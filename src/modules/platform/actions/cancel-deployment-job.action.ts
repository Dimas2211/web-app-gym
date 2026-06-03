"use server";

// ─────────────────────────────────────────────────────────────────
// platform — cancel-deployment-job.action.ts
//
// Cancela un PlatformDeploymentJob en estado PENDING.
// Solo super_admin.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }    from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma }            from "@/lib/db/prisma";

export type CancelDeploymentJobState =
  | { error?: string; success?: boolean }
  | undefined;

export async function cancelDeploymentJobAction(
  jobId: string,
): Promise<CancelDeploymentJobState> {
  const sessionUser = await requireSuperAdmin();

  const job = await prisma.platformDeploymentJob.findUnique({
    where:  { id: jobId },
    select: { id: true, organization_id: true, job_status: true },
  });

  if (!job) {
    return { error: "Deployment Job no encontrado." };
  }
  if (job.job_status !== "PENDING") {
    return { error: `Solo se pueden cancelar jobs en estado PENDING. Estado actual: ${job.job_status}` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.platformDeploymentJob.update({
      where: { id: jobId },
      data:  { job_status: "CANCELLED", finished_at: new Date() },
    });

    // Marcar todos los steps pendientes como SKIPPED
    await tx.platformDeploymentStep.updateMany({
      where: { job_id: jobId, status: "PENDING" },
      data:  { status: "SKIPPED", message: "Job cancelado por el administrador." },
    });

    await tx.platformDeploymentLog.create({
      data: {
        organization_id: job.organization_id,
        action:          "CANCEL_DEPLOYMENT_JOB",
        status:          "SUCCESS",
        notes:           `Deployment Job ${jobId} cancelado.`,
        triggered_by:    sessionUser.id,
        started_at:      new Date(),
        ended_at:        new Date(),
      },
    });
  });

  revalidatePath(`/dashboard/platform/deployments/${jobId}`);
  revalidatePath("/dashboard/platform/deployments");

  return { success: true };
}
