"use server";

import { revalidatePath }   from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma }           from "@/lib/db/prisma";

export async function togglePlatformModuleStatusAction(id: string): Promise<void> {
  await requireSuperAdmin();

  const mod = await prisma.platformModule.findUnique({
    where:  { id },
    select: { status: true, is_core: true },
  });
  if (!mod) throw new Error("Módulo no encontrado.");
  if (mod.is_core) throw new Error("Los módulos core no pueden desactivarse desde aquí.");

  const next = mod.status === "AVAILABLE" ? "DEPRECATED" : "AVAILABLE";
  await prisma.platformModule.update({ where: { id }, data: { status: next } });
  revalidatePath("/dashboard/platform/modules");
}
