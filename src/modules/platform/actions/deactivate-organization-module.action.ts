"use server";

// ─────────────────────────────────────────────────────────────────
// platform — deactivate-organization-module.action.ts
//
// Desactiva un módulo para una organización.
// Rechaza la desactivación si el módulo tiene is_core = true.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { deactivateOrganizationModuleSchema } from "../schemas/activate-organization-module.schema";

export type PlatformActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function deactivateOrganizationModuleAction(
  _prev: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  const sessionUser = await requireSuperAdmin();

  const raw = {
    organization_id: formData.get("organization_id") as string,
    module_id:       formData.get("module_id")       as string,
    reason:          formData.get("reason")           || null,
  };

  const parsed = deactivateOrganizationModuleSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { organization_id, module_id, reason } = parsed.data;

  const [org, mod] = await Promise.all([
    prisma.platformOrganization.findUnique({ where: { id: organization_id }, select: { id: true } }),
    prisma.platformModule.findUnique({ where: { id: module_id }, select: { id: true, code: true, is_core: true } }),
  ]);
  if (!org) return { error: "Organización no encontrada." };
  if (!mod) return { error: "Módulo no encontrado." };

  if (mod.is_core) {
    return { error: `El módulo "${mod.code}" es core y no puede desactivarse.` };
  }

  const orgModule = await prisma.platformOrganizationModule.findUnique({
    where: { organization_id_module_id: { organization_id, module_id } },
    select: { id: true, is_active: true },
  });
  if (!orgModule || !orgModule.is_active) {
    return { error: "El módulo ya está desactivado o no ha sido activado para esta organización." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.platformOrganizationModule.update({
      where: { organization_id_module_id: { organization_id, module_id } },
      data:  {
        is_active:      false,
        deactivated_at: new Date(),
        updated_by:     sessionUser.id,
      },
    });

    await tx.platformDeploymentLog.create({
      data: {
        organization_id,
        action:       "DEACTIVATE_MODULE",
        status:       "SUCCESS",
        notes:        reason
          ? `Módulo "${mod.code}" desactivado. Motivo: ${reason}`
          : `Módulo "${mod.code}" desactivado`,
        metadata:     { module_id, module_code: mod.code },
        triggered_by: sessionUser.id,
        started_at:   new Date(),
        ended_at:     new Date(),
      },
    });
  });

  revalidatePath(`/dashboard/platform/organizations/${organization_id}`);
}
