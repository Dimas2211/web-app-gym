// ─────────────────────────────────────────────────────────────────
// platform — list-manual-deployment-jobs.ts
//
// Lista PlatformDeploymentJob con deployment_mode MANUAL.
// Solo super_admin (validación en la page que llama).
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PlatformDeploymentJobItem } from "../types/platform.types";

const JOB_SELECT = {
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
} as const;

export async function listManualDeploymentJobsQuery(): Promise<PlatformDeploymentJobItem[]> {
  const rows = await prisma.platformDeploymentJob.findMany({
    where:   { deployment_mode: "MANUAL" },
    select:  JOB_SELECT,
    orderBy: { created_at: "desc" },
    take:    200,
  });

  return rows.map((r) => ({
    id:                 r.id,
    organization_id:    r.organization_id,
    organization:       r.organization,
    bundle_export_id:   r.bundle_export_id,
    job_status:         r.job_status         as PlatformDeploymentJobItem["job_status"],
    target_environment: r.target_environment as PlatformDeploymentJobItem["target_environment"],
    deployment_mode:    r.deployment_mode    as PlatformDeploymentJobItem["deployment_mode"],
    started_at:         r.started_at,
    finished_at:        r.finished_at,
    created_by:         r.created_by,
    notes:              r.notes,
    error_message:      r.error_message,
    created_at:         r.created_at,
    updated_at:         r.updated_at,
  }));
}
