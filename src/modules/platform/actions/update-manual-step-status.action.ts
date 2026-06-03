"use server";

// ─────────────────────────────────────────────────────────────────
// platform — update-manual-step-status.action.ts
//
// Actualiza el estado de un paso individual en un Deployment Job
// de modo MANUAL. El super_admin controla cada paso manualmente.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }    from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma }            from "@/lib/db/prisma";
import type { ManualStepStatusUpdate } from "../types/platform.types";

export type UpdateManualStepState =
  | { error?: string; success?: boolean }
  | undefined;

export async function updateManualStepStatusAction(
  stepId:    string,
  jobId:     string,
  newStatus: ManualStepStatusUpdate,
  message?:  string,
): Promise<UpdateManualStepState> {
  await requireSuperAdmin();

  const step = await prisma.platformDeploymentStep.findUnique({
    where:  { id: stepId },
    select: { id: true, job_id: true, status: true },
  });

  if (!step) return { error: "Paso no encontrado." };
  if (step.job_id !== jobId) return { error: "El paso no pertenece al job indicado." };

  const job = await prisma.platformDeploymentJob.findUnique({
    where:  { id: jobId },
    select: { deployment_mode: true, job_status: true },
  });

  if (!job) return { error: "Deployment Job no encontrado." };
  if (job.deployment_mode !== "MANUAL") return { error: "Solo se puede actualizar pasos de un job MANUAL." };
  if (job.job_status === "SUCCESS" || job.job_status === "FAILED" || job.job_status === "CANCELLED") {
    return { error: `El job ya está en estado final (${job.job_status}). No se pueden modificar pasos.` };
  }

  const now = new Date();
  const isStarting  = newStatus === "RUNNING";
  const isCompleted = newStatus === "SUCCESS" || newStatus === "FAILED" || newStatus === "SKIPPED";

  await prisma.platformDeploymentStep.update({
    where: { id: stepId },
    data:  {
      status:      newStatus,
      started_at:  isStarting  ? now : undefined,
      finished_at: isCompleted ? now : undefined,
      message:     message ?? null,
    },
  });

  // Si el job estaba PENDING y se empieza un paso, marcarlo RUNNING
  if (job.job_status === "PENDING" && isStarting) {
    await prisma.platformDeploymentJob.update({
      where: { id: jobId },
      data:  { job_status: "RUNNING", started_at: now },
    });
  }

  revalidatePath(`/dashboard/platform/manual-deployment/${jobId}`);

  return { success: true };
}
