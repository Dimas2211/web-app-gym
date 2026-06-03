"use server";

// ─────────────────────────────────────────────────────────────────
// platform — complete-manual-deployment-job.action.ts
//
// Marca un Deployment Job MANUAL como SUCCESS o FAILED.
// Registra log de auditoría.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }    from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma }            from "@/lib/db/prisma";

export type CompleteManualDeploymentState =
  | { error?: string; success?: boolean }
  | undefined;

export async function completeManualDeploymentJobAction(
  jobId:        string,
  finalStatus:  "SUCCESS" | "FAILED",
  notes?:       string,
): Promise<CompleteManualDeploymentState> {
  const sessionUser = await requireSuperAdmin();

  const job = await prisma.platformDeploymentJob.findUnique({
    where:  { id: jobId },
    select: {
      id:              true,
      organization_id: true,
      deployment_mode: true,
      job_status:      true,
      organization:    { select: { name: true } },
    },
  });

  if (!job) return { error: "Deployment Job no encontrado." };
  if (job.deployment_mode !== "MANUAL") return { error: "Solo se pueden completar jobs en modo MANUAL." };

  const terminalStatuses = ["SUCCESS", "FAILED", "CANCELLED", "SIMULATED"];
  if (terminalStatuses.includes(job.job_status)) {
    return { error: `El job ya está en estado final (${job.job_status}).` };
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.platformDeploymentJob.update({
      where: { id: jobId },
      data:  {
        job_status:    finalStatus,
        finished_at:   now,
        notes:         notes ?? undefined,
        error_message: finalStatus === "FAILED" ? (notes ?? "Deployment manual fallido.") : null,
      },
    });

    await tx.platformDeploymentLog.create({
      data: {
        organization_id: job.organization_id,
        action:          finalStatus === "SUCCESS" ? "MANUAL_DEPLOYMENT_SUCCESS" : "MANUAL_DEPLOYMENT_FAILED",
        status:          finalStatus === "SUCCESS" ? "SUCCESS" : "FAILED",
        notes:           finalStatus === "SUCCESS"
          ? `Deployment manual completado exitosamente para "${job.organization.name}". Job: ${jobId}`
          : `Deployment manual fallido para "${job.organization.name}". Job: ${jobId}. Notas: ${notes ?? "—"}`,
        triggered_by: sessionUser.id,
        started_at:   now,
        ended_at:     now,
      },
    });
  });

  revalidatePath(`/dashboard/platform/manual-deployment/${jobId}`);
  revalidatePath("/dashboard/platform/manual-deployment");

  return { success: true };
}
