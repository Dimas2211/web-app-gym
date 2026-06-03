"use server";

// ─────────────────────────────────────────────────────────────────
// platform — activate-organization-module.action.ts
//
// Activa un módulo para una organización.
// Los módulos is_core no pueden desactivarse (validación en deactivate).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { activateOrganizationModuleSchema } from "../schemas/activate-organization-module.schema";

export type PlatformActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function activateOrganizationModuleAction(
  _prev: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  const sessionUser = await requireSuperAdmin();

  const raw = {
    organization_id: formData.get("organization_id") as string,
    module_id:       formData.get("module_id")       as string,
  };

  const parsed = activateOrganizationModuleSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { organization_id, module_id } = parsed.data;

  const [org, mod] = await Promise.all([
    prisma.platformOrganization.findUnique({ where: { id: organization_id }, select: { id: true, name: true } }),
    prisma.platformModule.findUnique({ where: { id: module_id }, select: { id: true, code: true, name: true } }),
  ]);
  if (!org) return { error: "Organización no encontrada." };
  if (!mod) return { error: "Módulo no encontrado." };

  await prisma.$transaction(async (tx) => {
    await tx.platformOrganizationModule.upsert({
      where: {
        organization_id_module_id: { organization_id, module_id },
      },
      update: {
        is_active:      true,
        activated_at:   new Date(),
        deactivated_at: null,
        updated_by:     sessionUser.id,
      },
      create: {
        organization_id,
        module_id,
        is_active:    true,
        activated_at: new Date(),
        created_by:   sessionUser.id,
      },
    });

    await tx.platformDeploymentLog.create({
      data: {
        organization_id,
        action:       "ACTIVATE_MODULE",
        status:       "SUCCESS",
        notes:        `Módulo "${mod.code}" activado`,
        metadata:     { module_id, module_code: mod.code },
        triggered_by: sessionUser.id,
        started_at:   new Date(),
        ended_at:     new Date(),
      },
    });
  });

  revalidatePath(`/dashboard/platform/organizations/${organization_id}`);
}
