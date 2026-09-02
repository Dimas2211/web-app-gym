"use server";

// ─────────────────────────────────────────────────────────────────
// platform — set-organization-entitlement-override.action.ts (Bloque A)
//
// Crea/actualiza o elimina el override de un entitlement para una
// organización. La ausencia de override significa "usar el valor del
// plan" — nunca se copian automáticamente los valores del plan aquí.
// NO aplica enforcement de runtime — solo administración comercial.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { setOrganizationEntitlementOverrideSchema } from "../schemas/set-organization-entitlement-override.schema";

export type PlatformActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function setOrganizationEntitlementOverrideAction(
  _prev: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  const sessionUser = await requireSuperAdmin();

  const raw = {
    organization_id:           formData.get("organization_id"),
    entitlement_definition_id: formData.get("entitlement_definition_id"),
    clear:                     formData.get("clear") === "true",
    numeric_value:             formData.get("numeric_value") || null,
    is_unlimited:              formData.get("is_unlimited") === "true",
  };

  const parsed = setOrganizationEntitlementOverrideSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { organization_id, entitlement_definition_id, clear, numeric_value, is_unlimited } = parsed.data;

  const org = await prisma.platformOrganization.findUnique({ where: { id: organization_id }, select: { id: true } });
  if (!org) return { error: "Organización no encontrada." };

  const def = await prisma.platformEntitlementDefinition.findUnique({
    where:  { id: entitlement_definition_id },
    select: { id: true },
  });
  if (!def) return { error: "Entitlement no encontrado en el catálogo." };

  if (clear) {
    await prisma.platformOrganizationEntitlementOverride.deleteMany({
      where: { organization_id, entitlement_definition_id },
    });
  } else {
    await prisma.platformOrganizationEntitlementOverride.upsert({
      where: {
        organization_id_entitlement_definition_id: { organization_id, entitlement_definition_id },
      },
      update: {
        numeric_value: is_unlimited ? null : numeric_value ?? null,
        is_unlimited,
        updated_by: sessionUser.id,
      },
      create: {
        organization_id,
        entitlement_definition_id,
        numeric_value: is_unlimited ? null : numeric_value ?? null,
        is_unlimited,
        created_by: sessionUser.id,
      },
    });
  }

  revalidatePath(`/dashboard/platform/organizations/${organization_id}`);
}
