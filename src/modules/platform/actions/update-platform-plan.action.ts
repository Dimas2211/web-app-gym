"use server";

import { revalidatePath }          from "next/cache";
import { requireSuperAdmin }       from "@/lib/permissions/guards";
import { prisma }                  from "@/lib/db/prisma";
import { updatePlatformPlanSchema } from "../schemas/update-platform-plan.schema";
import { deriveLegacyPlanLimits, LEGACY_ENTITLEMENT_CODES } from "../lib/legacy-plan-limits";

export type PlatformPlanActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

function parseJsonArray(raw: FormDataEntryValue | null): unknown[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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
    modules:      parseJsonArray(formData.get("modules_json")),
    entitlements: parseJsonArray(formData.get("entitlements_json")),
  };

  const parsed = updatePlatformPlanSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { id, modules, entitlements, ...data } = parsed.data;

  const exists = await prisma.platformPlan.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return { error: "Plan no encontrado." };

  // Espejo unidireccional entitlement → columna legacy (ver legacy-plan-limits.ts).
  const legacyDefs = await prisma.platformEntitlementDefinition.findMany({
    where:  { code: { in: Object.values(LEGACY_ENTITLEMENT_CODES) } },
    select: { id: true, code: true },
  });
  const definitionIdsByCode = Object.fromEntries(legacyDefs.map((d) => [d.code, d.id]));
  const legacyLimits = deriveLegacyPlanLimits({
    entitlements,
    definitionIdsByCode,
    fallback: { max_users: data.max_users ?? null, max_locations: data.max_locations ?? null },
  });
  const planUpdateData = { ...data, max_users: legacyLimits.max_users, max_locations: legacyLimits.max_locations };

  // Bloque A — módulos y entitlements del plan se reemplazan por completo
  // en cada guardado (delete + recreate), consistente con que el form
  // envía siempre el estado completo seleccionado, no un delta.
  await prisma.$transaction(async (tx) => {
    await tx.platformPlan.update({ where: { id }, data: planUpdateData });

    await tx.platformPlanModule.deleteMany({ where: { plan_id: id } });
    if (modules.length > 0) {
      await tx.platformPlanModule.createMany({
        data: modules.map((m) => ({ plan_id: id, module_id: m.module_id, is_enabled: m.is_enabled })),
      });
    }

    await tx.platformPlanEntitlement.deleteMany({ where: { plan_id: id } });
    if (entitlements.length > 0) {
      await tx.platformPlanEntitlement.createMany({
        data: entitlements.map((e) => ({
          plan_id:                   id,
          entitlement_definition_id: e.entitlement_definition_id,
          numeric_value:              e.is_unlimited ? null : e.numeric_value ?? null,
          is_unlimited:                e.is_unlimited,
        })),
      });
    }
  });

  revalidatePath("/dashboard/platform/plans");
  revalidatePath("/dashboard/platform/organizations");
}
