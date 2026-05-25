// ─────────────────────────────────────────────────────────────────
// commerce/cash — cash-session.service.ts
//
// Lógica de negocio de sesiones de caja.
// Sin "use server" — importable desde actions.
//
// Operaciones:
//   openCashSession  — crea una CashSession en estado OPEN
//   closeCashSession — cierra una CashSession OPEN
//
// Fases pendientes (no implementadas aquí):
//   cancelCashSession
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { CashOpenSessionInfo } from "../types/cash.types";

// ── Tipos internos ────────────────────────────────────────────────

export type OpenCashSessionParams = {
  tenant_id:        string;
  location_id:      string;
  cash_register_id: string;
  opened_by:        string;
  opening_amount:   number;
  notes?:           string | null;
};

export type OpenCashSessionResult =
  | { ok: true;  data: CashOpenSessionInfo }
  | { ok: false; error: string };

// ── Apertura de sesión ────────────────────────────────────────────

export async function openCashSession(
  params: OpenCashSessionParams,
): Promise<OpenCashSessionResult> {
  const { tenant_id, location_id, cash_register_id, opened_by, opening_amount, notes } = params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verificar que la caja exista dentro del scope y esté activa.
      const register = await tx.cashRegister.findFirst({
        where: { id: cash_register_id, tenant_id, location_id, is_active: true },
        select: { id: true },
      });

      if (!register) {
        return { ok: false as const, error: "La caja seleccionada no existe o no pertenece a esta sucursal." };
      }

      // 2. Verificar que no exista ya una sesión OPEN para esta caja.
      // Nota: la protección fuerte contra concurrencia puede reforzarse luego
      // con un índice parcial único en una migración dedicada.
      // Por ahora la validación se garantiza dentro de la transacción de aplicación.
      const existing = await tx.cashSession.findFirst({
        where:  { cash_register_id: register.id, tenant_id, location_id, status: "OPEN" },
        select: { id: true },
      });

      if (existing) {
        return { ok: false as const, error: "Esta caja ya tiene una sesión abierta." };
      }

      // 3. Crear la sesión con opening_amount = expected_cash_amount en esta fase.
      const session = await tx.cashSession.create({
        data: {
          tenant_id,
          location_id,
          cash_register_id: register.id,
          opened_by,
          opening_amount:       opening_amount,
          expected_cash_amount: opening_amount,
          declared_cash_amount: null,
          difference_amount:    null,
          status: "OPEN",
          notes:  notes?.trim() ?? null,
        },
        select: {
          id:               true,
          cash_register_id: true,
          opened_by:        true,
          opened_at:        true,
          opening_amount:       true,
          expected_cash_amount: true,
          declared_cash_amount: true,
          difference_amount:    true,
          status: true,
          notes:  true,
          opened_by_user: {
            select: { first_name: true, last_name: true },
          },
        },
      });

      return { ok: true as const, session };
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    const s = result.session;

    const data: CashOpenSessionInfo = {
      id:               s.id,
      cash_register_id: s.cash_register_id,
      opened_by:        s.opened_by,
      opened_by_name:   s.opened_by_user
        ? `${s.opened_by_user.first_name} ${s.opened_by_user.last_name}`
        : null,
      opened_at:            s.opened_at,
      opening_amount:       Number(s.opening_amount),
      expected_cash_amount: Number(s.expected_cash_amount),
      declared_cash_amount: s.declared_cash_amount ? Number(s.declared_cash_amount) : null,
      difference_amount:    s.difference_amount    ? Number(s.difference_amount)    : null,
      status: s.status as CashOpenSessionInfo["status"],
      notes:  s.notes,
    };

    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudo abrir la caja." };
  }
}

// ── Cierre de sesión ──────────────────────────────────────────────

export type CloseCashSessionParams = {
  tenant_id:            string;
  location_id:          string;
  cash_session_id:      string;
  closed_by:            string;
  declared_cash_amount: number;
  notes?:               string | null;
};

export type CloseCashSessionResult =
  | { ok: true;  data: CashOpenSessionInfo }
  | { ok: false; error: string };

export async function closeCashSession(
  params: CloseCashSessionParams,
): Promise<CloseCashSessionResult> {
  const { tenant_id, location_id, cash_session_id, closed_by, declared_cash_amount, notes } = params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Buscar la sesión OPEN dentro del scope.
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
          opened_by:            true,
          opened_at:            true,
          opening_amount:       true,
          expected_cash_amount: true,
          notes:                true,
          opened_by_user: {
            select: { first_name: true, last_name: true },
          },
        },
      });

      if (!session) {
        return { ok: false as const, error: "La sesión de caja no existe o no está abierta." };
      }

      // 2. Calcular diferencia: declarado - esperado.
      const expected       = Number(session.expected_cash_amount);
      const difference     = declared_cash_amount - expected;

      // 3. Actualizar la sesión a CLOSED.
      const closed = await tx.cashSession.update({
        where: { id: session.id },
        data: {
          declared_cash_amount,
          difference_amount:    difference,
          closed_by,
          closed_at:            new Date(),
          status:               "CLOSED",
          notes:                notes !== undefined ? (notes?.trim() ?? null) : session.notes,
        },
        select: {
          id:               true,
          cash_register_id: true,
          opened_by:        true,
          opened_at:        true,
          opening_amount:       true,
          expected_cash_amount: true,
          declared_cash_amount: true,
          difference_amount:    true,
          status: true,
          notes:  true,
          opened_by_user: {
            select: { first_name: true, last_name: true },
          },
        },
      });

      return { ok: true as const, session: closed };
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    const s = result.session;

    const data: CashOpenSessionInfo = {
      id:               s.id,
      cash_register_id: s.cash_register_id,
      opened_by:        s.opened_by,
      opened_by_name:   s.opened_by_user
        ? `${s.opened_by_user.first_name} ${s.opened_by_user.last_name}`
        : null,
      opened_at:            s.opened_at,
      opening_amount:       Number(s.opening_amount),
      expected_cash_amount: Number(s.expected_cash_amount),
      declared_cash_amount: s.declared_cash_amount ? Number(s.declared_cash_amount) : null,
      difference_amount:    s.difference_amount    ? Number(s.difference_amount)    : null,
      status: s.status as CashOpenSessionInfo["status"],
      notes:  s.notes,
    };

    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudo cerrar la caja." };
  }
}
