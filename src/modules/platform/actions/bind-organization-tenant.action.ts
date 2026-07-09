"use server";

// ─────────────────────────────────────────────────────────────────
// platform — bind-organization-tenant.action.ts
//
// Asigna/actualiza organization.tenant_id en el control plane.
// C7 — Tenant Binding & Auto-Discovery.
//
// Reglas de seguridad:
// - Solo super_admin.
// - Requiere confirmationText === "BIND TENANT".
// - Requiere adminKey === PLATFORM_TENANT_BINDING_ADMIN_KEY (server-only).
// - adminKey nunca se devuelve, guarda ni loguea.
// - Solo escribe en PlatformOrganization (control plane) — nunca en
//   la base cliente.
// - Registra un log administrativo inmutable (PlatformDeploymentLog).
//
// TODO(provisioning): cuando el flujo de provisioning cree una base
// nueva y genere el registro en `gyms`, debe invocar esta misma
// lógica de asignación (sin adminKey/confirmación manual) para
// guardar automáticamente gym.id en organization.tenant_id.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }    from "next/cache";
import { z }                 from "zod";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma }            from "@/lib/db/prisma";
import type { BindOrganizationTenantResult } from "../types/platform.types";

const CONFIRMATION_TEXT = "BIND TENANT";

const bindOrganizationTenantSchema = z.object({
  organizationId:   z.string().uuid("organizationId debe ser un UUID válido."),
  tenantId:         z.string().uuid("tenantId debe ser un UUID válido."),
  confirmationText: z.string(),
  adminKey:         z.string().min(1, "Clave administrativa requerida."),
  sourceProfileId:  z.string().uuid().optional(),
});

export interface BindOrganizationTenantInput {
  organizationId:   string;
  tenantId:         string;
  confirmationText: string;
  adminKey:         string;
  sourceProfileId?: string;
}

export async function bindOrganizationTenantAction(
  input: BindOrganizationTenantInput,
): Promise<BindOrganizationTenantResult> {
  const sessionUser = await requireSuperAdmin();

  const parsed = bindOrganizationTenantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const { organizationId, tenantId, confirmationText, adminKey, sourceProfileId } = parsed.data;

  if (confirmationText !== CONFIRMATION_TEXT) {
    return {
      success: false,
      error: `Confirmación textual incorrecta. Debe escribir exactamente: "${CONFIRMATION_TEXT}".`,
    };
  }

  const expectedAdminKey = process.env.PLATFORM_TENANT_BINDING_ADMIN_KEY;
  if (!expectedAdminKey) {
    return {
      success: false,
      error: "PLATFORM_TENANT_BINDING_ADMIN_KEY no está configurada en este entorno.",
    };
  }
  if (adminKey !== expectedAdminKey) {
    return { success: false, error: "Clave administrativa incorrecta." };
  }

  const organization = await prisma.platformOrganization.findUnique({
    where:  { id: organizationId },
    select: { id: true, tenant_id: true },
  });
  if (!organization) {
    return { success: false, error: "Organización no encontrada." };
  }

  // tenant_id es @unique — evitar colisión con otra organización
  const conflicting = await prisma.platformOrganization.findFirst({
    where:  { tenant_id: tenantId, NOT: { id: organizationId } },
    select: { id: true, name: true },
  });
  if (conflicting) {
    return {
      success: false,
      error: `El tenant_id ya está vinculado a otra organización: ${conflicting.name}.`,
    };
  }

  const previousTenantId = organization.tenant_id;

  await prisma.$transaction([
    prisma.platformOrganization.update({
      where: { id: organizationId },
      data:  { tenant_id: tenantId },
    }),
    prisma.platformDeploymentLog.create({
      data: {
        organization_id: organizationId,
        action:          "BIND_TENANT",
        status:           "SUCCESS",
        notes:           `Tenant vinculado manualmente vía Tenant Binding (C7).`,
        metadata: {
          previousTenantId,
          newTenantId: tenantId,
          sourceProfileId: sourceProfileId ?? null,
        },
        triggered_by: sessionUser.id,
        started_at:   new Date(),
        ended_at:     new Date(),
      },
    }),
  ]);

  revalidatePath("/dashboard/platform/database-profiles");
  revalidatePath("/dashboard/platform/organizations");

  return { success: true, tenantId };
}
