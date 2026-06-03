"use server";

import { revalidatePath }          from "next/cache";
import { requireSuperAdmin }       from "@/lib/permissions/guards";
import { prisma }                  from "@/lib/db/prisma";
import { createPlatformPlanSchema } from "../schemas/create-platform-plan.schema";

export type PlatformPlanActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function createPlatformPlanAction(
  _prev: PlatformPlanActionState,
  formData: FormData,
): Promise<PlatformPlanActionState> {
  await requireSuperAdmin();

  const raw = {
    code:          formData.get("code"),
    name:          formData.get("name"),
    description:   formData.get("description") || null,
    billing_cycle: formData.get("billing_cycle") || "MONTHLY",
    price_monthly: formData.get("price_monthly") || null,
    price_annual:  formData.get("price_annual")  || null,
    max_locations: formData.get("max_locations") || null,
    max_users:     formData.get("max_users")     || null,
  };

  const parsed = createPlatformPlanSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const exists = await prisma.platformPlan.findUnique({
    where:  { code: parsed.data.code },
    select: { id: true },
  });
  if (exists) return { error: `Ya existe un plan con el código "${parsed.data.code}".` };

  await prisma.platformPlan.create({ data: parsed.data });
  revalidatePath("/dashboard/platform/plans");
}
