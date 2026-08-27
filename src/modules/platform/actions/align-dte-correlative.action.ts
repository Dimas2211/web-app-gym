"use server";

// ─────────────────────────────────────────────────────────────────
// platform — align-dte-correlative.action.ts
//
// F3-C24 — Alineación inicial de correlativos DTE. Solo super_admin.
//
// Registra el "baseline" externo (último numeroControl usado en un
// sistema de facturación anterior) para una combinación
// tenant/location/emisor/ambiente/tipo DTE, de forma que la siguiente
// reserva de correlativo (reserveDteControlNumber) nunca vuelva a
// emitir un numeroControl que Hacienda ya conoce.
//
// No firma, no transmite, no toca DteOutgoingDocument existentes.
// Solo afecta la próxima reserva de correlativo (emisiones futuras).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { alignDteCorrelativeSchema } from "../schemas/align-dte-correlative.schema";
import { alignDteCorrelativeBaseline } from "@/modules/commerce/dte/services/dte-correlative.service";

export type AlignDteCorrelativeActionState =
  | { errors?: Record<string, string[]>; error?: string; success?: false }
  | { success: true; next_sequence: number }
  | undefined;

export async function alignDteCorrelativeAction(
  _prev: AlignDteCorrelativeActionState,
  formData: FormData,
): Promise<AlignDteCorrelativeActionState> {
  const sessionUser = await requireSuperAdmin();

  const raw = {
    organization_id:    formData.get("organization_id"),
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

  const parsed = alignDteCorrelativeSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const input = parsed.data;

  const org = await prisma.platformOrganization.findUnique({
    where:  { id: input.organization_id },
    select: { id: true, tenant_id: true, name: true },
  });
  if (!org) return { error: "Organización no encontrada." };
  if (!org.tenant_id) return { error: "Esta organización no tiene tenant_id operativo." };

  // El emisor debe pertenecer realmente a este tenant/location/ambiente —
  // evita que un super_admin alinee un correlativo de otro tenant por error.
  const issuer = await prisma.dteIssuerConfig.findFirst({
    where: {
      id:          input.issuer_config_id,
      tenant_id:   org.tenant_id,
      location_id: input.location_id,
      environment: input.environment,
    },
    select: { id: true, cod_estable_mh: true, cod_punto_venta_mh: true },
  });
  if (!issuer) {
    return { error: "La configuración de emisor DTE indicada no corresponde a esta organización/sucursal/ambiente." };
  }
  if (issuer.cod_estable_mh !== input.cod_estable_mh || issuer.cod_punto_venta_mh !== input.cod_punto_venta_mh) {
    return { error: "Los códigos MH de establecimiento/punto de venta no coinciden con la configuración actual del emisor. Recargue la página." };
  }

  const result = await alignDteCorrelativeBaseline({
    tenant_id:          org.tenant_id,
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

  // Auditoría — mismo mecanismo que otras acciones administrativas de
  // Platform (PlatformDeploymentLog), aunque esta acción no despliega nada:
  // es el único log inmutable disponible hoy para acciones de super_admin
  // sobre una organización. Ver docs/modules/dte-correlatives-onboarding.md.
  await prisma.platformDeploymentLog.create({
    data: {
      organization_id: org.id,
      action:          "ALIGN_DTE_CORRELATIVE",
      status:          "SUCCESS",
      notes:           `Baseline DTE alineado — tipo ${input.dte_type_code}, ambiente ${input.environment}, ` +
                        `establecimiento ${input.cod_estable_mh}${input.cod_punto_venta_mh}. ` +
                        `Último usado externo: ${input.last_used_sequence}. Próximo numeroControl: ${result.next_sequence}. ` +
                        `Nota: ${input.notes}`,
      metadata: {
        location_id:        input.location_id,
        issuer_config_id:   input.issuer_config_id,
        environment:        input.environment,
        dte_type_code:      input.dte_type_code,
        last_used_sequence: input.last_used_sequence,
        next_sequence:      result.next_sequence,
        source:             input.source,
        evidence_ref:       input.evidence_ref,
      },
      triggered_by: sessionUser.id,
      started_at:   new Date(),
      ended_at:     new Date(),
    },
  });

  revalidatePath(`/dashboard/platform/organizations/${org.id}`);

  return { success: true, next_sequence: result.next_sequence };
}
