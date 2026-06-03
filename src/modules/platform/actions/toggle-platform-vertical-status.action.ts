"use server";

import { revalidatePath }   from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma }           from "@/lib/db/prisma";

export async function togglePlatformVerticalStatusAction(id: string): Promise<void> {
  await requireSuperAdmin();

  const vertical = await prisma.platformVertical.findUnique({
    where:  { id },
    select: { is_active: true, _count: { select: { organizations: true } } },
  });
  if (!vertical) throw new Error("Vertical no encontrada.");

  if (vertical.is_active && vertical._count.organizations > 0) {
    throw new Error("No se puede desactivar una vertical que tiene organizaciones activas.");
  }

  await prisma.platformVertical.update({
    where: { id },
    data:  { is_active: !vertical.is_active },
  });
  revalidatePath("/dashboard/platform/verticals");
}
