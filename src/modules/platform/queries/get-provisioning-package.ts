// ─────────────────────────────────────────────────────────────────
// platform — get-provisioning-package.ts
//
// Construye el Provisioning Package completo de una organización.
// Incluye: configuración, validación y estado de provisioning.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import { validateProvisioning } from "../lib/provisioning-validator";
import type {
  ProvisioningPackage,
  ProvisioningConfiguration,
  PlatformOrganizationDetail,
  PlatformBrandingData,
  OrganizationModuleItem,
  PlatformProvisioningStatus,
  PlatformOrganizationStatus,
  PlatformLicenseStatus,
  PlatformBillingCycle,
  PlatformModuleCategory,
} from "../types/platform.types";

export async function getProvisioningPackageQuery(
  organizationId: string,
): Promise<ProvisioningPackage | null> {
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
      branding: {
        select: {
          id:              true,
          organization_id: true,
          primary_color:   true,
          secondary_color: true,
          logo_url:        true,
          favicon_url:     true,
          custom_domain:   true,
          updated_at:      true,
        },
      },
      modules: {
        where:  { is_active: true },
        select: {
          id:              true,
          organization_id: true,
          module_id:       true,
          is_active:       true,
          activated_at:    true,
          deactivated_at:  true,
          module: {
            select: { code: true, name: true, category: true },
          },
        },
      },
    },
  });

  if (!row) return null;

  // Construir org detail compatible con el validador
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

  // Branding compatible
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

  // Módulos activos compatibles
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

  // Ejecutar validador
  const validation = validateProvisioning({ org, branding, modules });

  // Construir configuración
  const config: ProvisioningConfiguration = {
    organization_code:   org.code,
    organization_name:   org.name,
    legal_name:          org.legal_name,
    nit:                 org.nit,
    country_code:        org.country_code,
    timezone:            org.timezone,
    tenant_id:           org.tenant_id,
    plan:                org.plan ? { code: org.plan.code, name: org.plan.name } : null,
    vertical:            org.vertical ? { code: org.vertical.code, name: org.vertical.name } : null,
    billing_cycle:       org.billing_cycle,
    license_status:      org.license_status,
    trial_ends_at:       org.trial_ends_at,
    license_expires_at:  org.license_expires_at,
    branding:            branding
      ? {
          primary_color:   branding.primary_color,
          secondary_color: branding.secondary_color,
          logo_url:        branding.logo_url,
          favicon_url:     branding.favicon_url,
          custom_domain:   branding.custom_domain,
        }
      : null,
    active_modules:      modules.map((m) => ({
      code:     m.module.code,
      name:     m.module.name,
      category: m.module.category,
    })),
    deployment_url:      org.deployment_url,
    instance_identifier: org.instance_identifier,
  };

  return {
    generated_at:        new Date(),
    organization_id:     org.id,
    config,
    validation,
    provisioning_status: org.provisioning_status,
  };
}
