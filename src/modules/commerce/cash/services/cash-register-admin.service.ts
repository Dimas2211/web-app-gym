// ─────────────────────────────────────────────────────────────────
// commerce/cash — cash-register-admin.service.ts
//
// Administración mínima de cajas (CashRegister) por tenant/location.
// Sin "use server" — importable desde actions.
//
// Operaciones:
//   createCashRegister     — alta (activa) con capacidad commerce.cash_registers.max
//   updateCashRegister     — edita code/name (no consume capacidad)
//   setCashRegisterActive  — desactiva (sin sesión OPEN) / reactiva (consume capacidad)
//
// Reglas:
//   - tenant_id, location_id y user_id siempre vienen de la capa superior
//     (contexto operacional efectivo), nunca del browser.
//   - Sin borrado físico: sesiones y movimientos históricos nunca se tocan.
//   - Toda transición que suma cupo (alta, reactivación) pasa por
//     withCapacityCheckedTransaction (Serializable + retry): el conteo y
//     el write ocurren en la misma transacción.
// ─────────────────────────────────────────────────────────────────

import { Prisma, type PrismaClient } from "@prisma/client";
import { withCapacityCheckedTransaction } from "@/modules/platform/runtime/commercial-enforcement/with-capacity-checked-transaction";
import {
  capacityDelta,
  isCashRegisterCountedForCapacity,
} from "@/modules/platform/runtime/commercial-enforcement/capacity-registry";
import {
  CommercialEnforcementError,
  type CommercialEnforcementContext,
} from "@/modules/platform/runtime/commercial-enforcement/types";

const CASH_REGISTER_CAPACITY_CODE = "commerce.cash_registers.max";

export const CASH_REGISTER_MESSAGES = {
  DUPLICATE_CODE: "Ya existe una caja con ese código en esta sucursal.",
  NOT_FOUND:      "La caja no existe o no pertenece a la sucursal activa.",
  OPEN_SESSION:   "No puedes desactivar una caja con una sesión abierta. Cierra la caja primero.",
  ALREADY_ACTIVE:   "La caja ya está activa.",
  ALREADY_INACTIVE: "La caja ya está inactiva.",
  CHANGED:        "La caja cambió mientras se procesaba. Recarga e intenta de nuevo.",
} as const;

export interface CashRegisterScope {
  tenant_id:   string;
  location_id: string;
  user_id:     string;
}

export interface CashRegisterAdminRecord {
  id:        string;
  code:      string;
  name:      string;
  is_active: boolean;
}

export type CashRegisterAdminResult =
  | { ok: true; data: CashRegisterAdminRecord }
  | { ok: false; error: string };

const RECORD_SELECT = { id: true, code: true, name: true, is_active: true } as const;

class CashRegisterAdminError extends Error {}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function mapError(err: unknown): CashRegisterAdminResult {
  if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
  if (err instanceof CashRegisterAdminError) return { ok: false, error: err.message };
  if (isUniqueViolation(err)) return { ok: false, error: CASH_REGISTER_MESSAGES.DUPLICATE_CODE };
  throw err;
}

// ── Crear ─────────────────────────────────────────────────────────

export async function createCashRegister(
  scope:  CashRegisterScope,
  input:  { code: string; name: string },
  db:     PrismaClient,
  commercialCtx: CommercialEnforcementContext,
): Promise<CashRegisterAdminResult> {
  const delta = capacityDelta(false, isCashRegisterCountedForCapacity(true));

  try {
    const created = await withCapacityCheckedTransaction(
      db,
      CASH_REGISTER_CAPACITY_CODE,
      delta,
      commercialCtx,
      (tx) =>
        tx.cashRegister.create({
          data: {
            tenant_id:   scope.tenant_id,
            location_id: scope.location_id,
            code:        input.code,
            name:        input.name,
            is_active:   true,
            created_by:  scope.user_id,
            updated_by:  scope.user_id,
          },
          select: RECORD_SELECT,
        }),
    );
    return { ok: true, data: created };
  } catch (err) {
    return mapError(err);
  }
}

// ── Editar code/name ──────────────────────────────────────────────

export async function updateCashRegister(
  scope: CashRegisterScope,
  input: { cash_register_id: string; code: string; name: string },
  db:    PrismaClient,
): Promise<CashRegisterAdminResult> {
  const existing = await db.cashRegister.findFirst({
    where:  { id: input.cash_register_id, tenant_id: scope.tenant_id, location_id: scope.location_id },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: CASH_REGISTER_MESSAGES.NOT_FOUND };

  try {
    // updateMany con scope en el WHERE: nunca toca una caja de otro tenant/location.
    const result = await db.cashRegister.updateMany({
      where: { id: input.cash_register_id, tenant_id: scope.tenant_id, location_id: scope.location_id },
      data:  { code: input.code, name: input.name, updated_by: scope.user_id },
    });
    if (result.count !== 1) return { ok: false, error: CASH_REGISTER_MESSAGES.NOT_FOUND };
  } catch (err) {
    return mapError(err);
  }

  const updated = await db.cashRegister.findFirst({
    where:  { id: input.cash_register_id, tenant_id: scope.tenant_id, location_id: scope.location_id },
    select: RECORD_SELECT,
  });
  if (!updated) return { ok: false, error: CASH_REGISTER_MESSAGES.NOT_FOUND };
  return { ok: true, data: updated };
}

// ── Desactivar / reactivar ────────────────────────────────────────

export async function setCashRegisterActive(
  scope: CashRegisterScope,
  input: { cash_register_id: string; is_active: boolean },
  db:    PrismaClient,
  commercialCtx: CommercialEnforcementContext,
): Promise<CashRegisterAdminResult> {
  const existing = await db.cashRegister.findFirst({
    where:  { id: input.cash_register_id, tenant_id: scope.tenant_id, location_id: scope.location_id },
    select: { id: true, is_active: true },
  });
  if (!existing) return { ok: false, error: CASH_REGISTER_MESSAGES.NOT_FOUND };

  if (existing.is_active === input.is_active) {
    return {
      ok: false,
      error: input.is_active ? CASH_REGISTER_MESSAGES.ALREADY_ACTIVE : CASH_REGISTER_MESSAGES.ALREADY_INACTIVE,
    };
  }

  // +1 al reactivar (assertCapacityAvailable), -1 al desactivar (libera cupo).
  const delta = capacityDelta(
    isCashRegisterCountedForCapacity(existing.is_active),
    isCashRegisterCountedForCapacity(input.is_active),
  );

  try {
    const updated = await withCapacityCheckedTransaction(
      db,
      CASH_REGISTER_CAPACITY_CODE,
      delta,
      commercialCtx,
      async (tx) => {
        if (!input.is_active) {
          const openSession = await tx.cashSession.findFirst({
            where:  {
              cash_register_id: input.cash_register_id,
              tenant_id:        scope.tenant_id,
              location_id:      scope.location_id,
              status:           "OPEN",
            },
            select: { id: true },
          });
          if (openSession) throw new CashRegisterAdminError(CASH_REGISTER_MESSAGES.OPEN_SESSION);
        }

        // Guardia de estado previo: otra transición concurrente → count=0 → rollback.
        const result = await tx.cashRegister.updateMany({
          where: {
            id:          input.cash_register_id,
            tenant_id:   scope.tenant_id,
            location_id: scope.location_id,
            is_active:   existing.is_active,
          },
          data:  { is_active: input.is_active, updated_by: scope.user_id },
        });
        if (result.count !== 1) throw new CashRegisterAdminError(CASH_REGISTER_MESSAGES.CHANGED);

        return tx.cashRegister.findFirst({
          where:  { id: input.cash_register_id },
          select: RECORD_SELECT,
        });
      },
    );
    if (!updated) return { ok: false, error: CASH_REGISTER_MESSAGES.NOT_FOUND };
    return { ok: true, data: updated };
  } catch (err) {
    return mapError(err);
  }
}
