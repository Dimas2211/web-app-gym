// ─────────────────────────────────────────────────────────────────
// platform — get-deployment-bundle.ts
//
// Construye el DeploymentBundle completo de una organización.
// Valida pre-condiciones antes de construir el bundle.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type {
  DeploymentBundle,
  DeploymentBundleOrganization,
  DeploymentBundleVertical,
  DeploymentBundlePlan,
  DeploymentBundleBranding,
  DeploymentBundleLicense,
  DeploymentBundleModule,
  DeploymentBundleConfiguration,
  ExportValidationResult,
  PlatformOrganizationStatus,
  PlatformLicenseStatus,
  PlatformBillingCycle,
  PlatformProvisioningStatus,
  PlatformModuleCategory,
} from "../types/platform.types";

export interface DeploymentBundleQueryResult {
  bundle:     DeploymentBundle | null;
  validation: ExportValidationResult;
}

export async function getDeploymentBundleQuery(
  organizationId: string,
  generatedBy: string | null,
  bundleVersion: string,
): Promise<DeploymentBundleQueryResult> {
  const row = await prisma.platformOrganization.findUnique({
    where: { id: organizationId },
    select: {
      id:                  true,
      code:                true,
      name:                true,
      legal_name:          true,
      nit:                 true,
      tenant_id:           true,
      country_code:        true,
      timezone:            true,
      domain:              true,
      status:              true,
      license_status:      true,
      billing_cycle:       true,
      provisioning_status: true,
      trial_ends_at:       true,
      license_expires_at:  true,
      deployment_url:      true,
      instance_identifier: true,
      vertical: {
        select: { code: true, name: true },
      },
      plan: {
        select: {
          code:          true,
          name:          true,
          billing_cycle: true,
          price_monthly: true,
          price_annual:  true,
          max_locations: true,
          max_users:     true,
        },
      },
      branding: {
        select: {
          primary_color:   true,
          secondary_color: true,
          logo_url:        true,
          favicon_url:     true,
          custom_domain:   true,
        },
      },
      modules: {
        where: { is_active: true },
        select: {
          module: {
            select: {
              code:     true,
              name:     true,
              category: true,
              version:  true,
            },
          },
        },
      },
    },
  });

  if (!row) {
    return {
      bundle: null,
      validation: { valid: false, errors: ["Organización no encontrada."] },
    };
  }

  // Validar pre-condiciones para exportar
  const errors: string[] = [];

  if ((row.provisioning_status as PlatformProvisioningStatus) !== "READY") {
    errors.push("El estado de provisioning debe ser READY antes de exportar.");
  }
  if (!row.vertical) {
    errors.push("La organización no tiene vertical asignada.");
  }
  if (!row.plan) {
    errors.push("La organización no tiene plan asignado.");
  }
  if (!row.branding) {
    errors.push("La organización no tiene branding configurado.");
  }
  if (row.modules.length === 0) {
    errors.push("La organización no tiene módulos activos.");
  }
  const ls = row.license_status as PlatformLicenseStatus;
  if (ls !== "TRIAL" && ls !== "ACTIVE") {
    errors.push("La licencia debe estar en estado TRIAL o ACTIVE.");
  }

  if (errors.length > 0) {
    return { bundle: null, validation: { valid: false, errors } };
  }

  // Construir bundle
  const organization: DeploymentBundleOrganization = {
    id:           row.id,
    code:         row.code,
    name:         row.name,
    legal_name:   row.legal_name,
    nit:          row.nit,
    tenant_id:    row.tenant_id,
    country_code: row.country_code,
    timezone:     row.timezone,
    domain:       row.domain,
  };

  const vertical: DeploymentBundleVertical | null = row.vertical
    ? { code: row.vertical.code, name: row.vertical.name }
    : null;

  const plan: DeploymentBundlePlan | null = row.plan
    ? {
        code:          row.plan.code,
        name:          row.plan.name,
        billing_cycle: row.plan.billing_cycle as PlatformBillingCycle,
        price_monthly: row.plan.price_monthly ? Number(row.plan.price_monthly) : null,
        price_annual:  row.plan.price_annual  ? Number(row.plan.price_annual)  : null,
        max_locations: row.plan.max_locations,
        max_users:     row.plan.max_users,
      }
    : null;

  const branding: DeploymentBundleBranding | null = row.branding
    ? {
        primary_color:   row.branding.primary_color,
        secondary_color: row.branding.secondary_color,
        logo_url:        row.branding.logo_url,
        favicon_url:     row.branding.favicon_url,
        custom_domain:   row.branding.custom_domain,
      }
    : null;

  const license: DeploymentBundleLicense = {
    license_status:     row.license_status as PlatformLicenseStatus,
    billing_cycle:      row.billing_cycle  as PlatformBillingCycle,
    trial_ends_at:      row.trial_ends_at,
    license_expires_at: row.license_expires_at,
  };

  const modules: DeploymentBundleModule[] = row.modules.map((m) => ({
    code:     m.module.code,
    name:     m.module.name,
    category: m.module.category as PlatformModuleCategory,
    version:  m.module.version,
  }));

  const configuration: DeploymentBundleConfiguration = {
    deployment_url:      row.deployment_url,
    instance_identifier: row.instance_identifier,
  };

  const bundle: DeploymentBundle = {
    organization,
    vertical,
    plan,
    branding,
    license,
    modules,
    configuration,
    metadata: {
      generated_at:   new Date(),
      generated_by:   generatedBy,
      bundle_version: bundleVersion,
    },
  };

  return { bundle, validation: { valid: true, errors: [] } };
}

// Calcula la versión del próximo bundle (vN+1)
export async function getNextBundleVersion(organizationId: string): Promise<string> {
  const count = await prisma.platformDeploymentExportLog.count({
    where: {
      organization_id: organizationId,
      export_type:     "DEPLOYMENT_BUNDLE",
      result:          "SUCCESS",
    },
  });
  return `v${count + 1}`;
}
