"use server";

// ─────────────────────────────────────────────────────────────────
// platform — deactivate-organization-module.action.ts
//
// Desactiva un módulo para una organización, como OVERRIDE explícito
// respecto al plan. Rechaza la desactivación si el módulo es is_core.
//
// Bloque A (ajuste post-cierre, punto 3): usa upsert, no update. Un
// módulo puede estar efectivamente HABILITADO por herencia del plan
// sin tener fila propia en PlatformOrganizationModule — desactivarlo
// como override debe poder CREAR esa fila con is_active=false, no
// requerir que ya existiera una fila activa.
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

  await prisma.$transaction(async (tx) => {
    await tx.platformOrganizationModule.upsert({
      where: { organization_id_module_id: { organization_id, module_id } },
      update: {
        is_active:      false,
        deactivated_at: new Date(),
        updated_by:     sessionUser.id,
      },
      create: {
        organization_id,
        module_id,
        is_active:      false,
        activated_at:   new Date(),
        deactivated_at: new Date(),
        created_by:     sessionUser.id,
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
