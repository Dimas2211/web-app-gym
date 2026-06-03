"use server";

import { revalidatePath }   from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma }           from "@/lib/db/prisma";

export async function togglePlatformPlanStatusAction(id: string): Promise<void> {
  await requireSuperAdmin();

  const plan = await prisma.platformPlan.findUnique({ where: { id }, select: { is_active: true } });
  if (!plan) throw new Error("Plan no encontrado.");

  await prisma.platformPlan.update({
    where: { id },
    data:  { is_active: !plan.is_active },
  });
  revalidatePath("/dashboard/platform/plans");
}
