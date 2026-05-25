"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — get-cash-session-cut-report.action.ts
//
// Obtiene el reporte de corte de una sesión de caja validando
// que pertenezca al tenant/location efectivos del usuario.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getCashSessionCutReportInputSchema } from "../schemas/cash.schemas";
import { getCashSessionCutReport }            from "../queries/get-cash-session-cut-report";
import type { GetCashSessionCutReportInput }  from "../schemas/cash.schemas";
import type { CashSessionCutReport }          from "../types/cash.types";

export type GetCashSessionCutReportActionResult =
  | { ok: true;  data: CashSessionCutReport }
  | { ok: false; error: string };

export async function getCashSessionCutReportAction(
  input: GetCashSessionCutReportInput,
): Promise<GetCashSessionCutReportActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

  const parsed = getCashSessionCutReportInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Parámetros de consulta no válidos." };
  }

  try {
    const data = await getCashSessionCutReport({
      tenant_id,
      location_id,
      cash_session_id: parsed.data.cash_session_id,
    });
    if (!data) {
      return { ok: false, error: "La sesión no existe o no pertenece a esta sucursal." };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudo cargar el reporte de corte." };
  }
}
