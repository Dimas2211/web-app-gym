"use server";

// ─────────────────────────────────────────────────────────────────
// platform — change-organization-status.action.ts
//
// Cambia el status operativo de una PlatformOrganization y registra
// el evento en PlatformDeploymentLog.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { changeOrganizationStatusSchema } from "../schemas/change-organization-status.schema";

export type PlatformActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function changeOrganizationStatusAction(
  _prev: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  const sessionUser = await requireSuperAdmin();

  const raw = {
    id:     formData.get("id")     as string,
    status: formData.get("status") as string,
    reason: formData.get("reason") || null,
  };

  const parsed = changeOrganizationStatusSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { id, status, reason } = parsed.data;

  const org = await prisma.platformOrganization.findUnique({
    where:  { id },
    select: { id: true, name: true, status: true },
  });
  if (!org) return { error: "Organización no encontrada." };

  if (org.status === status) {
    return { error: `La organización ya tiene el estado "${status}".` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.platformOrganization.update({
      where: { id },
      data:  { status },
    });

    await tx.platformDeploymentLog.create({
      data: {
        organization_id: id,
        action:          "CHANGE_STATUS",
        status:          "SUCCESS",
        notes:           reason
          ? `Estado cambiado de ${org.status} a ${status}. Motivo: ${reason}`
          : `Estado cambiado de ${org.status} a ${status}`,
        metadata:        { from: org.status, to: status },
        triggered_by:    sessionUser.id,
        started_at:      new Date(),
        ended_at:        new Date(),
      },
    });
  });

  revalidatePath("/dashboard/platform/organizations");
  revalidatePath(`/dashboard/platform/organizations/${id}`);
}
