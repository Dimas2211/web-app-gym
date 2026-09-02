"use server";

import { revalidatePath }          from "next/cache";
import { requireSuperAdmin }       from "@/lib/permissions/guards";
import { prisma }                  from "@/lib/db/prisma";
import { createPlatformPlanSchema } from "../schemas/create-platform-plan.schema";
import { deriveLegacyPlanLimits, LEGACY_ENTITLEMENT_CODES } from "../lib/legacy-plan-limits";

export type PlatformPlanActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

// Bloque A — "modules" y "entitlements" llegan como JSON serializado en
// campos ocultos del form (arrays no son representables directamente en
// FormData). Un JSON inválido o ausente se trata como lista vacía.
function parseJsonArray(raw: FormDataEntryValue | null): unknown[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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
    modules:      parseJsonArray(formData.get("modules_json")),
    entitlements: parseJsonArray(formData.get("entitlements_json")),
  };

  const parsed = createPlatformPlanSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const exists = await prisma.platformPlan.findUnique({
    where:  { code: parsed.data.code },
    select: { id: true },
  });
  if (exists) return { error: `Ya existe un plan con el código "${parsed.data.code}".` };

  const { modules, entitlements, ...planData } = parsed.data;

  // Espejo unidireccional entitlement → columna legacy (ver legacy-plan-limits.ts).
  // Si core.users.max/core.locations.max no están en el catálogo o no se
  // configuraron en este plan, planData.max_users/max_locations (tal como
  // vino del formulario) se conserva sin cambios.
  const legacyDefs = await prisma.platformEntitlementDefinition.findMany({
    where:  { code: { in: Object.values(LEGACY_ENTITLEMENT_CODES) } },
    select: { id: true, code: true },
  });
  const definitionIdsByCode = Object.fromEntries(legacyDefs.map((d) => [d.code, d.id]));
  const legacyLimits = deriveLegacyPlanLimits({
    entitlements,
    definitionIdsByCode,
    fallback: { max_users: planData.max_users ?? null, max_locations: planData.max_locations ?? null },
  });

  await prisma.$transaction(async (tx) => {
    const plan = await tx.platformPlan.create({
      data: { ...planData, max_users: legacyLimits.max_users, max_locations: legacyLimits.max_locations },
    });

    if (modules.length > 0) {
      await tx.platformPlanModule.createMany({
        data: modules.map((m) => ({ plan_id: plan.id, module_id: m.module_id, is_enabled: m.is_enabled })),
      });
    }

    if (entitlements.length > 0) {
      await tx.platformPlanEntitlement.createMany({
        data: entitlements.map((e) => ({
          plan_id:                   plan.id,
          entitlement_definition_id: e.entitlement_definition_id,
          numeric_value:              e.is_unlimited ? null : e.numeric_value ?? null,
          is_unlimited:                e.is_unlimited,
        })),
      });
    }
  });

  revalidatePath("/dashboard/platform/plans");
}
