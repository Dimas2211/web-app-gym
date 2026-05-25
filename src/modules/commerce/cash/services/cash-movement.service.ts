// ─────────────────────────────────────────────────────────────────
// commerce/cash — cash-movement.service.ts
//
// Lógica de negocio de movimientos manuales de caja.
// Sin "use server" — importable desde actions.
//
// Operaciones:
//   deriveCashMovementDirection — calcula IN/OUT a partir del tipo
//   mapCashMovement             — mapea Prisma → CashMovementItem
//   recordCashMovement          — registra movimiento + actualiza expected
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type {
  CashMovementType,
  CashMovementDirection,
  CashMovementItem,
  CashMovementCreateResult,
} from "../types/cash.types";

// ── Etiquetas legibles por tipo ───────────────────────────────────

const MOVEMENT_TYPE_LABELS: Record<CashMovementType, string> = {
  MANUAL_IN:       "Ingreso manual",
  MANUAL_OUT:      "Egreso manual",
  CASH_WITHDRAWAL: "Retiro de efectivo",
  PETTY_EXPENSE:   "Gasto menor",
  ADJUSTMENT_UP:   "Ajuste positivo",
  ADJUSTMENT_DOWN: "Ajuste negativo",
  REFUND_OUT:      "Devolución en efectivo",
};

// ── Tipos de movimiento que suman al efectivo esperado ────────────
const IN_TYPES = new Set<CashMovementType>(["MANUAL_IN", "ADJUSTMENT_UP"]);

// ── Derivar dirección a partir del tipo ──────────────────────────
//
// La dirección nunca proviene del cliente; se calcula siempre en servidor.

export function deriveCashMovementDirection(
  type: CashMovementType,
): CashMovementDirection {
  if (IN_TYPES.has(type)) return "IN";

  const OUT_TYPES = new Set<CashMovementType>([
    "MANUAL_OUT",
    "CASH_WITHDRAWAL",
    "PETTY_EXPENSE",
    "ADJUSTMENT_DOWN",
    "REFUND_OUT",
  ]);

  if (OUT_TYPES.has(type)) return "OUT";

  throw new Error(`Tipo de movimiento desconocido: ${type}`);
}

// ── Mapear registro Prisma → CashMovementItem ─────────────────────

type PrismaMovementRecord = {
  id:               string;
  tenant_id:        string;
  location_id:      string;
  cash_session_id:  string;
  cash_register_id: string;
  movement_type:    string;
  direction:        string;
  amount:           { toNumber(): number } | number | string;
  reason:           string | null;
  reference:        string | null;
  notes:            string | null;
  performed_by:     string;
  performed_at:     Date;
  created_at:       Date;
  updated_at:       Date;
  performed_by_user?: { first_name: string; last_name: string } | null;
};

export function mapCashMovement(record: PrismaMovementRecord): CashMovementItem {
  const movementType = record.movement_type as CashMovementType;
  return {
    id:               record.id,
    tenant_id:        record.tenant_id,
    location_id:      record.location_id,
    cash_session_id:  record.cash_session_id,
    cash_register_id: record.cash_register_id,
    movement_type:       movementType,
    movement_type_label: MOVEMENT_TYPE_LABELS[movementType] ?? movementType,
    direction:           record.direction as CashMovementDirection,
    amount:    typeof record.amount === "object" && "toNumber" in record.amount
      ? record.amount.toNumber()
      : Number(record.amount),
    reason:    record.reason,
    reference: record.reference,
    notes:     record.notes,
    performed_by: record.performed_by,
    performed_by_name: record.performed_by_user
      ? `${record.performed_by_user.first_name} ${record.performed_by_user.last_name}`
      : null,
    performed_at: record.performed_at,
    created_at:   record.created_at,
    updated_at:   record.updated_at,
  };
}

// ── Parámetros internos para registrar un movimiento ─────────────

export type RecordCashMovementParams = {
  tenant_id:       string;
  location_id:     string;
  cash_session_id: string;
  movement_type:   CashMovementType;
  amount:          number;
  reason?:         string | null;
  reference?:      string | null;
  notes?:          string | null;
  performed_by:    string;
};

export type RecordCashMovementResult =
  | { ok: true;  data: CashMovementCreateResult }
  | { ok: false; error: string };

// ── Registrar movimiento + actualizar expected_cash_amount ────────

export async function recordCashMovement(
  params: RecordCashMovementParams,
): Promise<RecordCashMovementResult> {
  const {
    tenant_id,
    location_id,
    cash_session_id,
    movement_type,
    amount,
    reason,
    reference,
    notes,
    performed_by,
  } = params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Buscar sesión OPEN dentro del scope tenant/location.
      const session = await tx.cashSession.findFirst({
        where: {
          id:          cash_session_id,
          tenant_id,
          location_id,
          status:      "OPEN",
        },
        select: {
          id:                   true,
          cash_register_id:     true,
          expected_cash_amount: true,
        },
      });

      if (!session) {
        return {
          ok: false as const,
          error: "La sesión de caja no existe o no está abierta.",
        };
      }

      // 2. Calcular dirección a partir del tipo (nunca del cliente).
      const direction = deriveCashMovementDirection(movement_type);

      // 3. Calcular nuevo expected_cash_amount.
      const currentExpected = Number(session.expected_cash_amount);
      let newExpected: number;

      if (direction === "IN") {
        newExpected = currentExpected + amount;
      } else {
        // 4. Regla de seguridad: no permitir expected negativo.
        if (amount > currentExpected) {
          return {
            ok: false as const,
            error: "El movimiento excede el efectivo esperado de la caja.",
          };
        }
        newExpected = currentExpected - amount;
      }

      // 5. Crear movimiento.
      const movement = await tx.cashMovement.create({
        data: {
          tenant_id,
          location_id,
          cash_session_id:  session.id,
          cash_register_id: session.cash_register_id,
          movement_type,
          direction,
          amount,
          reason:    reason?.trim() ?? null,
          reference: reference?.trim() ?? null,
          notes:     notes?.trim() ?? null,
          performed_by,
          // performed_at usa default(now()) del schema
        },
        select: {
          id:               true,
          tenant_id:        true,
          location_id:      true,
          cash_session_id:  true,
          cash_register_id: true,
          movement_type:    true,
          direction:        true,
          amount:           true,
          reason:           true,
          reference:        true,
          notes:            true,
          performed_by:     true,
          performed_at:     true,
          created_at:       true,
          updated_at:       true,
          performed_by_user: {
            select: { first_name: true, last_name: true },
          },
        },
      });

      // 6. Actualizar solo expected_cash_amount en la sesión.
      // No se toca: opening_amount, declared_cash_amount, difference_amount,
      // closed_at, closed_by, status.
      await tx.cashSession.update({
        where: { id: session.id },
        data:  { expected_cash_amount: newExpected },
      });

      return { ok: true as const, movement, newExpected };
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return {
      ok: true,
      data: {
        movement:             mapCashMovement(result.movement),
        expected_cash_amount: result.newExpected,
      },
    };
  } catch {
    return { ok: false, error: "No se pudo registrar el movimiento de caja." };
  }
}
