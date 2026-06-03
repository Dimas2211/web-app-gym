// ─────────────────────────────────────────────────────────────────
// platform — get-deployment-job-by-id.ts
//
// Obtiene un PlatformDeploymentJob con sus steps ordenados.
// Solo super_admin (validación en la page que llama).
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PlatformDeploymentJobDetail } from "../types/platform.types";

export async function getDeploymentJobByIdQuery(
  jobId: string,
): Promise<PlatformDeploymentJobDetail | null> {
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
        select: { code: true, name: true },
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

  return {
    id:                 row.id,
    organization_id:    row.organization_id,
    organization:       row.organization,
    bundle_export_id:   row.bundle_export_id,
    job_status:         row.job_status         as PlatformDeploymentJobDetail["job_status"],
    target_environment: row.target_environment as PlatformDeploymentJobDetail["target_environment"],
    deployment_mode:    row.deployment_mode    as PlatformDeploymentJobDetail["deployment_mode"],
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
      status:      s.status   as PlatformDeploymentJobDetail["steps"][number]["status"],
      started_at:  s.started_at,
      finished_at: s.finished_at,
      message:     s.message,
      metadata:    s.metadata as Record<string, unknown> | null,
      created_at:  s.created_at,
      updated_at:  s.updated_at,
    })),
  };
}
