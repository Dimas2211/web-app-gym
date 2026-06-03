// ─────────────────────────────────────────────────────────────────
// platform — get-manual-deployment-job-by-id.ts
//
// Obtiene un Deployment Job (modo MANUAL) con sus steps y los
// detalles completos de la organización necesarios para el runbook.
// Solo super_admin (validación en la page que llama).
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type {
  ManualDeploymentJobDetail,
  PlatformModuleCategory,
} from "../types/platform.types";

export async function getManualDeploymentJobByIdQuery(
  jobId: string,
): Promise<ManualDeploymentJobDetail | null> {
  const row = await prisma.platformDeploymentJob.findUnique({
    where: { id: jobId },
    select: {
      id:                 true,
      organization_id:    true,
      bundle_export_id:   true,
      job_status:         true,
      target_environment: true,
      deployment_mode:    true,
      started_at:         true,
      finished_at:        true,
      created_by:         true,
      notes:              true,
      error_message:      true,
      created_at:         true,
      updated_at:         true,
      organization: {
        select: {
          code:                true,
          name:                true,
          legal_name:          true,
          nit:                 true,
          tenant_id:           true,
          country_code:        true,
          timezone:            true,
          domain:              true,
          deployment_url:      true,
          instance_identifier: true,
          vertical: { select: { code: true, name: true } },
          plan:     { select: { code: true, name: true } },
          branding: {
            select: {
              primary_color:   true,
              secondary_color: true,
              logo_url:        true,
              custom_domain:   true,
            },
          },
          modules: {
            where:  { is_active: true },
            select: {
              module: {
                select: { code: true, name: true, category: true },
              },
            },
          },
        },
      },
      steps: {
        select: {
          id:          true,
          job_id:      true,
          step_key:    true,
          step_name:   true,
          step_order:  true,
          status:      true,
          started_at:  true,
          finished_at: true,
          message:     true,
          metadata:    true,
          created_at:  true,
          updated_at:  true,
        },
        orderBy: { step_order: "asc" },
      },
    },
  });

  if (!row) return null;

  const org = row.organization;

  return {
    id:                 row.id,
    organization_id:    row.organization_id,
    organization:       { code: org.code, name: org.name },
    bundle_export_id:   row.bundle_export_id,
    job_status:         row.job_status         as ManualDeploymentJobDetail["job_status"],
    target_environment: row.target_environment as ManualDeploymentJobDetail["target_environment"],
    deployment_mode:    row.deployment_mode    as ManualDeploymentJobDetail["deployment_mode"],
    started_at:         row.started_at,
    finished_at:        row.finished_at,
    created_by:         row.created_by,
    notes:              row.notes,
    error_message:      row.error_message,
    created_at:         row.created_at,
    updated_at:         row.updated_at,
    steps: row.steps.map((s) => ({
      id:          s.id,
      job_id:      s.job_id,
      step_key:    s.step_key,
      step_name:   s.step_name,
      step_order:  s.step_order,
      status:      s.status   as ManualDeploymentJobDetail["steps"][number]["status"],
      started_at:  s.started_at,
      finished_at: s.finished_at,
      message:     s.message,
      metadata:    s.metadata as Record<string, unknown> | null,
      created_at:  s.created_at,
      updated_at:  s.updated_at,
    })),
    org_details: {
      code:                org.code,
      name:                org.name,
      legal_name:          org.legal_name,
      nit:                 org.nit,
      tenant_id:           org.tenant_id,
      country_code:        org.country_code,
      timezone:            org.timezone,
      domain:              org.domain,
      deployment_url:      org.deployment_url,
      instance_identifier: org.instance_identifier,
      vertical:            org.vertical ?? null,
      plan:                org.plan    ?? null,
      branding:            org.branding ?? null,
      active_modules: org.modules.map((m) => ({
        code:     m.module.code,
        name:     m.module.name,
        category: m.module.category as PlatformModuleCategory,
      })),
    },
  };
}
