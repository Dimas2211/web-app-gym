"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — cancel-confirmed-sale.action.ts
//
// Anula una venta CONFIRMED → CANCELLED sin borrado físico.
// Requiere la Clave de Supervisor (SALE_CANCEL_CONFIRMED, un solo uso:
// verificada en esta misma request contra la Runtime DB efectiva —
// context.client). No emite grant reutilizable.
//
// La action no confía en la UI: sesión, runtime, módulo commerce.sales,
// write, tenant/location y clave se verifican aquí; estado de la venta,
// reglas DTE, reglas de caja y la reversa atómica viven en
// cancelConfirmedSale (sale.service.ts).
//
// Retorna:
//   { ok: true }                       — venta anulada
//   { ok: false; error: string }       — clave inválida, bloqueo o fallo
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { cancelConfirmedSale } from "../services/sale.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { verifySupervisorPinForOperation } from "@/core/security/operational-authorization/operational-authorization";
import { readSupervisorPin } from "@/core/security/operational-authorization/run-supervisor-authorization";
import { OPERATIONAL_SCOPES } from "@/core/security/operational-authorization/scopes";

export type CancelConfirmedSaleState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

export async function cancelConfirmedSaleAction(
  _prev: CancelConfirmedSaleState,
  formData: FormData,
): Promise<CancelConfirmedSaleState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.sales", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(sessionUser, context.client, context.tenantId));
    if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

    const sale_id = ((formData.get("sale_id") as string) ?? "").trim();
    if (!sale_id) return { ok: false, error: "El ID de venta es requerido." };

    const auth = await verifySupervisorPinForOperation(
      context,
      OPERATIONAL_SCOPES.SALE_CANCEL_CONFIRMED,
      readSupervisorPin(formData),
    );
    if (!auth.ok) return auth;

    const result = await cancelConfirmedSale(
      sale_id,
      context.tenantId,
      location_id,
      context.effectiveUser.id,
      context.client,
    );
    if (!result.ok) return { ok: false, error: result.error };

    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/cash");

    return { ok: true };
  } finally {
    await dispose();
  }
}
