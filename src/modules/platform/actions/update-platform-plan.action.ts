"use server";

import { revalidatePath }          from "next/cache";
import { requireSuperAdmin }       from "@/lib/permissions/guards";
import { prisma }                  from "@/lib/db/prisma";
import { updatePlatformPlanSchema } from "../schemas/update-platform-plan.schema";

export type PlatformPlanActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function updatePlatformPlanAction(
  _prev: PlatformPlanActionState,
  formData: FormData,
): Promise<PlatformPlanActionState> {
  await requireSuperAdmin();

  const raw = {
    id:            formData.get("id"),
    name:          formData.get("name")          || undefined,
    description:   formData.get("description")   || null,
    billing_cycle: formData.get("billing_cycle") || undefined,
    price_monthly: formData.get("price_monthly") || null,
    price_annual:  formData.get("price_annual")  || null,
    max_locations: formData.get("max_locations") || null,
    max_users:     formData.get("max_users")     || null,
  };

  const parsed = updatePlatformPlanSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { id, ...data } = parsed.data;

  const exists = await prisma.platformPlan.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return { error: "Plan no encontrado." };

  await prisma.platformPlan.update({ where: { id }, data });
  revalidatePath("/dashboard/platform/plans");
}
