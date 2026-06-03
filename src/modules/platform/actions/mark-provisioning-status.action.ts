"use server";

// ─────────────────────────────────────────────────────────────────
// platform — mark-provisioning-status.action.ts
//
// Permite al super_admin marcar manualmente el estado de provisioning
// de una organización (PROVISIONED, DEPLOYED, FAILED, NOT_READY).
// Solo super_admin.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const schema = z.object({
  organization_id: z.string().uuid(),
  status: z.enum(["NOT_READY", "READY", "PROVISIONED", "DEPLOYED", "FAILED"]),
  notes: z.string().max(500).optional().nullable(),
});

export type MarkProvisioningActionState =
  | { error?: string; errors?: Record<string, string[]> }
  | undefined;

export async function markProvisioningStatusAction(
  _prev: MarkProvisioningActionState,
  formData: FormData,
): Promise<MarkProvisioningActionState> {
  const sessionUser = await requireSuperAdmin();

  const parsed = schema.safeParse({
    organization_id: formData.get("organization_id"),
    status:          formData.get("status"),
    notes:           formData.get("notes") || null,
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { organization_id, status, notes } = parsed.data;

  const org = await prisma.platformOrganization.findUnique({
    where:  { id: organization_id },
    select: { id: true, name: true },
  });

  if (!org) {
    return { error: "Organización no encontrada." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.platformOrganization.update({
      where: { id: organization_id },
      data:  { provisioning_status: status },
    });

    await tx.platformProvisioningLog.create({
      data: {
        organization_id,
        result:           status,
        triggered_by:     sessionUser.id,
        validation_errors: Prisma.JsonNull,
        notes:            notes ?? `Estado de provisioning cambiado manualmente a ${status}.`,
      },
    });

    await tx.platformDeploymentLog.create({
      data: {
        organization_id,
        action:       "MARK_PROVISIONING_STATUS",
        status:       status === "FAILED" ? "FAILED" : "SUCCESS",
        notes:        notes ?? `Provisioning marcado como ${status} manualmente.`,
        triggered_by: sessionUser.id,
        started_at:   new Date(),
        ended_at:     new Date(),
      },
    });
  });

  revalidatePath("/dashboard/platform/provisioning");
  revalidatePath(`/dashboard/platform/provisioning/${organization_id}`);
  revalidatePath(`/dashboard/platform/organizations/${organization_id}`);
}
