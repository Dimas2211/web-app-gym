"use server";

// ─────────────────────────────────────────────────────────────────
// platform — revert-organization-module-to-inherit.action.ts (Bloque A)
//
// "Heredar del plan": elimina el override explícito de la organización
// para un módulo (fila PlatformOrganizationModule), de forma que el
// valor efectivo vuelva a resolverse desde PlatformPlanModule (o
// UNCONFIGURED si el plan tampoco lo incluye). Ver entitlements-resolver.ts.
// No aplica a módulos is_core — nunca tienen override que revertir.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { activateOrganizationModuleSchema } from "../schemas/activate-organization-module.schema";

export type PlatformActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function revertOrganizationModuleToInheritAction(
  _prev: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  const sessionUser = await requireSuperAdmin();

  const raw = {
    organization_id: formData.get("organization_id") as string,
    module_id:       formData.get("module_id")       as string,
  };

  const parsed = activateOrganizationModuleSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { organization_id, module_id } = parsed.data;

  const [org, mod] = await Promise.all([
    prisma.platformOrganization.findUnique({ where: { id: organization_id }, select: { id: true } }),
    prisma.platformModule.findUnique({ where: { id: module_id }, select: { id: true, code: true } }),
  ]);
  if (!org) return { error: "Organización no encontrada." };
  if (!mod) return { error: "Módulo no encontrado." };

  await prisma.$transaction(async (tx) => {
    await tx.platformOrganizationModule.deleteMany({ where: { organization_id, module_id } });

    await tx.platformDeploymentLog.create({
      data: {
        organization_id,
        action:       "REVERT_MODULE_TO_INHERIT",
        status:       "SUCCESS",
        notes:        `Módulo "${mod.code}" vuelve a heredar del plan (override eliminado)`,
        metadata:     { module_id, module_code: mod.code },
        triggered_by: sessionUser.id,
        started_at:   new Date(),
        ended_at:     new Date(),
      },
    });
  });

  revalidatePath(`/dashboard/platform/organizations/${organization_id}`);
}
