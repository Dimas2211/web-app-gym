"use server";

import { revalidatePath }            from "next/cache";
import { requireSuperAdmin }         from "@/lib/permissions/guards";
import { prisma }                    from "@/lib/db/prisma";
import { createPlatformModuleSchema } from "../schemas/create-platform-module.schema";

export type PlatformModuleActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function createPlatformModuleAction(
  _prev: PlatformModuleActionState,
  formData: FormData,
): Promise<PlatformModuleActionState> {
  await requireSuperAdmin();

  const raw = {
    code:        formData.get("code"),
    name:        formData.get("name"),
    description: formData.get("description") || null,
    category:    formData.get("category"),
    version:     formData.get("version")     || "1.0",
    is_core:     formData.get("is_core") === "true",
    vertical_id: formData.get("vertical_id") || null,
  };

  const parsed = createPlatformModuleSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const exists = await prisma.platformModule.findUnique({
    where:  { code: parsed.data.code },
    select: { id: true },
  });
  if (exists) return { error: `Ya existe un módulo con el código "${parsed.data.code}".` };

  await prisma.platformModule.create({ data: parsed.data });
  revalidatePath("/dashboard/platform/modules");
}
