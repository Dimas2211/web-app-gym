"use server";

import { revalidatePath }            from "next/cache";
import { requireSuperAdmin }         from "@/lib/permissions/guards";
import { prisma }                    from "@/lib/db/prisma";
import { updatePlatformModuleSchema } from "../schemas/update-platform-module.schema";

export type PlatformModuleActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function updatePlatformModuleAction(
  _prev: PlatformModuleActionState,
  formData: FormData,
): Promise<PlatformModuleActionState> {
  await requireSuperAdmin();

  const raw = {
    id:          formData.get("id"),
    name:        formData.get("name")        || undefined,
    description: formData.get("description") || null,
    category:    formData.get("category")    || undefined,
    version:     formData.get("version")     || undefined,
    is_core:     formData.get("is_core") !== null ? formData.get("is_core") === "true" : undefined,
    vertical_id: formData.get("vertical_id") || null,
  };

  const parsed = updatePlatformModuleSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { id, ...data } = parsed.data;

  const exists = await prisma.platformModule.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return { error: "Módulo no encontrado." };

  await prisma.platformModule.update({ where: { id }, data });
  revalidatePath("/dashboard/platform/modules");
}
