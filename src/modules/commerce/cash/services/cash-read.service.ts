// ─────────────────────────────────────────────────────────────────
// commerce/cash — cash-read.service.ts
//
// Service de lectura para el módulo de caja.
// Sin "use server" — importable desde actions y route handlers.
//
// Operaciones:
//   getActiveCashRegistersForCurrentLocation — lista de cajas activas
//   ensureCashRegisterInScope               — obtiene una caja validando scope
//   getOpenSessionForRegister               — sesión OPEN de una caja
//   getCashWorkspaceState                   — estado completo del workspace
//
// Restricciones de esta fase:
//   - Solo lectura.
//   - No abre sesiones.
//   - No cierra sesiones.
//   - No crea movimientos.
//   - No toca ventas, pagos, DTE ni inventario.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { listCashRegisters }    from "../queries/list-cash-registers";
import { getCashRegisterById }  from "../queries/get-cash-register-by-id";
import { getOpenCashSession }   from "../queries/get-open-cash-session";
import type {
  CashRegisterListItem,
  CashRegisterDetail,
  CashOpenSessionInfo,
  CashWorkspaceState,
} from "../types/cash.types";

// ── Lista de cajas activas de la location actual ──────────────────

export async function getActiveCashRegistersForCurrentLocation(
  tenant_id:   string,
  location_id: string,
  client: PrismaClient = prisma,
): Promise<CashRegisterListItem[]> {
  return listCashRegisters(tenant_id, location_id, false, client);
}

// ── Obtiene una caja validando scope — null si fuera de scope ─────

export async function ensureCashRegisterInScope(
  cash_register_id: string,
  tenant_id:        string,
  location_id:      string,
  client: PrismaClient = prisma,
): Promise<CashRegisterDetail | null> {
  return getCashRegisterById(cash_register_id, tenant_id, location_id, client);
}

// ── Obtiene la sesión OPEN de una caja ───────────────────────────

export async function getOpenSessionForRegister(
  cash_register_id: string,
  tenant_id:        string,
  location_id:      string,
  client: PrismaClient = prisma,
): Promise<CashOpenSessionInfo | null> {
  return getOpenCashSession(cash_register_id, tenant_id, location_id, client);
}

// ── Estado completo del workspace de caja ────────────────────────
//
// Carga en paralelo la lista de cajas y, si se proporciona
// selected_register_id, el detalle de la caja seleccionada y su
// sesión activa. Si no se proporciona, selected_register y
// open_session quedan en null.

export async function getCashWorkspaceState(
  tenant_id:              string,
  location_id:            string,
  selected_register_id?: string,
  client: PrismaClient = prisma,
): Promise<CashWorkspaceState> {
  const [registers, selected_register] = await Promise.all([
    listCashRegisters(tenant_id, location_id, false, client),
    selected_register_id
      ? getCashRegisterById(selected_register_id, tenant_id, location_id, client)
      : Promise.resolve(null),
  ]);

  const open_session = selected_register?.open_session ?? null;

  return {
    registers,
    selected_register,
    open_session,
  };
}
