"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — align-dte-correlative-session.action.ts
//
// F3-C24 (corrección de acceso) — Alinea el baseline externo de un
// correlativo DTE usando el tenant de la SESIÓN actual, sin depender
// de PlatformOrganization. Reutiliza el mismo servicio de dominio
// (alignDteCorrelativeBaseline) que la action de Platform Admin
// (align-dte-correlative.action.ts) — la única diferencia es de dónde
// sale tenant_id y cómo se audita.
//
// Seguridad: requireSuperAdmin (igual que el resto de F3-C24 — el
// proyecto todavía no tiene un rol "admin autorizado" intermedio para
// esto; no se abre a branch_admin/reception/cajero).
//
// Auditoría: no existe hoy un log inmutable genérico fuera de
// PlatformDeploymentLog (que requiere un organization_id real, y esta
// ruta existe justamente para bases sin PlatformOrganization poblada).
// El propio DteCorrelative.external_baseline_* (quién, cuándo, nota
// obligatoria) queda como registro de la alineación — ver limitación
// documentada en docs/modules/dte-correlatives-onboarding.md.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { alignDteCorrelativeSessionSchema } from "../schemas/align-dte-correlative-session.schema";
import { alignDteCorrelativeBaseline } from "../services/dte-correlative.service";

export type AlignDteCorrelativeSessionActionState =
  | { errors?: Record<string, string[]>; error?: string; success?: false }
  | { success: true; next_sequence: number }
  | undefined;

export async function alignDteCorrelativeSessionAction(
  _prev: AlignDteCorrelativeSessionActionState,
  formData: FormData,
): Promise<AlignDteCorrelativeSessionActionState> {
  const sessionUser = await requireSuperAdmin();
  const tenant_id = sessionUser.tenant_id;
  if (!tenant_id) return { error: "La sesión no tiene un tenant activo." };

  const raw = {
    location_id:        formData.get("location_id"),
    issuer_config_id:   formData.get("issuer_config_id"),
    environment:        formData.get("environment"),
    dte_type_code:      formData.get("dte_type_code"),
    cod_estable_mh:     formData.get("cod_estable_mh"),
    cod_punto_venta_mh: formData.get("cod_punto_venta_mh"),
    last_used_sequence: formData.get("last_used_sequence"),
    source:             formData.get("source") ?? "",
    notes:              formData.get("notes"),
    evidence_ref:       formData.get("evidence_ref") || null,
  };

  const parsed = alignDteCorrelativeSessionSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const input = parsed.data;

  // El emisor debe pertenecer realmente al tenant/location/ambiente de la
  // sesión — evita alinear un correlativo con datos manipulados en el form.
  const issuer = await prisma.dteIssuerConfig.findFirst({
    where: {
      id:          input.issuer_config_id,
      tenant_id,
      location_id: input.location_id,
      environment: input.environment,
    },
    select: { id: true, cod_estable_mh: true, cod_punto_venta_mh: true },
  });
  if (!issuer) {
    return { error: "La configuración de emisor DTE indicada no corresponde a este tenant/sucursal/ambiente." };
  }
  if (issuer.cod_estable_mh !== input.cod_estable_mh || issuer.cod_punto_venta_mh !== input.cod_punto_venta_mh) {
    return { error: "Los códigos MH de establecimiento/punto de venta no coinciden con la configuración actual del emisor. Recargue la página." };
  }

  const result = await alignDteCorrelativeBaseline({
    tenant_id,
    location_id:        input.location_id,
    issuer_config_id:   input.issuer_config_id,
    environment:        input.environment,
    dte_type_code:      input.dte_type_code,
    cod_estable_mh:     input.cod_estable_mh,
    cod_punto_venta_mh: input.cod_punto_venta_mh,
    last_used_sequence: input.last_used_sequence,
    source:             input.source ?? "",
    notes:              input.notes,
    evidence_ref:       input.evidence_ref ?? null,
    user_id:            sessionUser.id,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/dashboard/dte/correlatives");

  return { success: true, next_sequence: result.next_sequence };
}
