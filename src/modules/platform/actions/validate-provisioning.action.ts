"use server";

// ─────────────────────────────────────────────────────────────────
// platform — validate-provisioning.action.ts
//
// Ejecuta el motor de validación de provisioning para una organización.
// Actualiza provisioning_status en PlatformOrganization.
// Crea un PlatformProvisioningLog con el resultado.
// Solo super_admin.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { validateProvisioning } from "../lib/provisioning-validator";
import type {
  PlatformOrganizationDetail,
  PlatformBrandingData,
  OrganizationModuleItem,
  PlatformOrganizationStatus,
  PlatformLicenseStatus,
  PlatformBillingCycle,
  PlatformProvisioningStatus,
  PlatformModuleCategory,
} from "../types/platform.types";

export type ProvisioningActionState =
  | {
      success?: boolean;
      status?:  "READY" | "NOT_READY";
      errors?:  string[];
      error?:   string;
    }
  | undefined;

export async function validateProvisioningAction(
  organizationId: string,
): Promise<ProvisioningActionState> {
  const sessionUser = await requireSuperAdmin();

  // Cargar datos necesarios para la validación
  const row = await prisma.platformOrganization.findUnique({
    where: { id: organizationId },
    select: {
      id:                  true,
      code:                true,
      name:                true,
      legal_name:          true,
      nit:                 true,
      tenant_id:           true,
      status:              true,
      license_status:      true,
      billing_cycle:       true,
      provisioning_status: true,
      trial_ends_at:       true,
      license_expires_at:  true,
      country_code:        true,
      timezone:            true,
      domain:              true,
      logo_url:            true,
      deployment_url:      true,
      instance_identifier: true,
      suspended_at:        true,
      suspension_reason:   true,
      created_at:          true,
      updated_at:          true,
      vertical: { select: { id: true, code: true, name: true } },
      plan:     { select: { id: true, code: true, name: true } },
      branding: true,
      modules: {
        where: { is_active: true },
        select: {
          id:              true,
          organization_id: true,
          module_id:       true,
          is_active:       true,
          activated_at:    true,
          deactivated_at:  true,
          module: { select: { code: true, name: true, category: true } },
        },
      },
    },
  });

  if (!row) {
    return { error: "Organización no encontrada." };
  }

  const org: PlatformOrganizationDetail = {
    id:                  row.id,
    code:                row.code,
    name:                row.name,
    legal_name:          row.legal_name,
    nit:                 row.nit,
    tenant_id:           row.tenant_id,
    status:              row.status              as PlatformOrganizationStatus,
    license_status:      row.license_status      as PlatformLicenseStatus,
    billing_cycle:       row.billing_cycle       as PlatformBillingCycle,
    provisioning_status: row.provisioning_status as PlatformProvisioningStatus,
    trial_ends_at:       row.trial_ends_at,
    license_expires_at:  row.license_expires_at,
    country_code:        row.country_code,
    timezone:            row.timezone,
    domain:              row.domain,
    logo_url:            row.logo_url,
    deployment_url:      row.deployment_url,
    instance_identifier: row.instance_identifier,
    suspended_at:        row.suspended_at,
    suspension_reason:   row.suspension_reason,
    vertical:            row.vertical,
    plan:                row.plan,
    created_at:          row.created_at,
    updated_at:          row.updated_at,
  };

  const branding: PlatformBrandingData | null = row.branding
    ? {
        id:              row.branding.id,
        organization_id: row.branding.organization_id,
        primary_color:   row.branding.primary_color,
        secondary_color: row.branding.secondary_color,
        logo_url:        row.branding.logo_url,
        favicon_url:     row.branding.favicon_url,
        custom_domain:   row.branding.custom_domain,
        updated_at:      row.branding.updated_at,
      }
    : null;

  const modules: OrganizationModuleItem[] = row.modules.map((m) => ({
    id:              m.id,
    organization_id: m.organization_id,
    module_id:       m.module_id,
    module: {
      code:     m.module.code,
      name:     m.module.name,
      category: m.module.category as PlatformModuleCategory,
    },
    is_active:      m.is_active,
    activated_at:   m.activated_at,
    deactivated_at: m.deactivated_at,
  }));

  const result = validateProvisioning({ org, branding, modules });

  const newStatus: PlatformProvisioningStatus = result.status === "READY" ? "READY" : "NOT_READY";

  const failedChecks = result.checks
    .filter((c) => !c.passed)
    .map((c) => c.message ?? c.label);

  await prisma.$transaction(async (tx) => {
    await tx.platformOrganization.update({
      where: { id: organizationId },
      data:  { provisioning_status: newStatus },
    });

    await tx.platformProvisioningLog.create({
      data: {
        organization_id:   organizationId,
        result:            newStatus,
        triggered_by:      sessionUser.id,
        validation_errors: failedChecks.length > 0 ? failedChecks : Prisma.JsonNull,
        notes:             result.status === "READY"
          ? "Validación exitosa. Organización lista para provisioning."
          : `Validación fallida. ${failedChecks.length} error(es) detectado(s).`,
      },
    });

    // Log de deployment también para trazabilidad
    await tx.platformDeploymentLog.create({
      data: {
        organization_id: organizationId,
        action:          "VALIDATE_PROVISIONING",
        status:          result.status === "READY" ? "SUCCESS" : "FAILED",
        notes:           result.status === "READY"
          ? "Validación de provisioning exitosa."
          : `Validación de provisioning fallida: ${failedChecks.join(", ")}`,
        triggered_by: sessionUser.id,
        started_at:   new Date(),
        ended_at:     new Date(),
      },
    });
  });

  revalidatePath("/dashboard/platform/provisioning");
  revalidatePath(`/dashboard/platform/provisioning/${organizationId}`);
  revalidatePath(`/dashboard/platform/organizations/${organizationId}`);

  return {
    success: true,
    status:  result.status,
    errors:  failedChecks,
  };
}
