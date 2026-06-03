"use server";

import { revalidatePath }              from "next/cache";
import { requireSuperAdmin }           from "@/lib/permissions/guards";
import { prisma }                      from "@/lib/db/prisma";
import { createPlatformVerticalSchema } from "../schemas/create-platform-vertical.schema";

export type PlatformVerticalActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function createPlatformVerticalAction(
  _prev: PlatformVerticalActionState,
  formData: FormData,
): Promise<PlatformVerticalActionState> {
  await requireSuperAdmin();

  const raw = {
    code:        formData.get("code"),
    name:        formData.get("name"),
    description: formData.get("description") || null,
  };

  const parsed = createPlatformVerticalSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const exists = await prisma.platformVertical.findUnique({
    where:  { code: parsed.data.code },
    select: { id: true },
  });
  if (exists) return { error: `Ya existe una vertical con el código "${parsed.data.code}".` };

  await prisma.platformVertical.create({ data: parsed.data });
  revalidatePath("/dashboard/platform/verticals");
}
