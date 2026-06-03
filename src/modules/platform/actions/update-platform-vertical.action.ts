"use server";

import { revalidatePath }              from "next/cache";
import { requireSuperAdmin }           from "@/lib/permissions/guards";
import { prisma }                      from "@/lib/db/prisma";
import { updatePlatformVerticalSchema } from "../schemas/update-platform-vertical.schema";

export type PlatformVerticalActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function updatePlatformVerticalAction(
  _prev: PlatformVerticalActionState,
  formData: FormData,
): Promise<PlatformVerticalActionState> {
  await requireSuperAdmin();

  const raw = {
    id:          formData.get("id"),
    name:        formData.get("name")        || undefined,
    description: formData.get("description") || null,
  };

  const parsed = updatePlatformVerticalSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { id, ...data } = parsed.data;

  const exists = await prisma.platformVertical.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return { error: "Vertical no encontrada." };

  await prisma.platformVertical.update({ where: { id }, data });
  revalidatePath("/dashboard/platform/verticals");
}
