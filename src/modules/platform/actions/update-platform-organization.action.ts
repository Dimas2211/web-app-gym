"use server";

// ─────────────────────────────────────────────────────────────────
// platform — update-platform-organization.action.ts
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { updatePlatformOrganizationSchema } from "../schemas/update-platform-organization.schema";

export type PlatformActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function updatePlatformOrganizationAction(
  _prev: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  await requireSuperAdmin();

  const raw = {
    id:                 formData.get("id")                 as string,
    name:               formData.get("name")               || undefined,
    legal_name:         formData.get("legal_name")         || null,
    nit:                formData.get("nit")                || null,
    tenant_id:          formData.get("tenant_id")          || null,
    vertical_id:        formData.get("vertical_id")        || null,
    plan_id:            formData.get("plan_id")            || null,
    billing_cycle:      formData.get("billing_cycle")      || undefined,
    country_code:       formData.get("country_code")       || null,
    timezone:           formData.get("timezone")           || null,
    domain:              formData.get("domain")              || null,
    logo_url:            formData.get("logo_url")            || null,
    deployment_url:      formData.get("deployment_url")      || null,
    instance_identifier: formData.get("instance_identifier") || null,
    trial_ends_at:       formData.get("trial_ends_at")       || null,
    license_expires_at:  formData.get("license_expires_at")  || null,
  };

  const parsed = updatePlatformOrganizationSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { id, ...data } = parsed.data;

  const exists = await prisma.platformOrganization.findUnique({
    where:  { id },
    select: { id: true },
  });
  if (!exists) return { error: "Organización no encontrada." };

  await prisma.platformOrganization.update({
    where: { id },
    data:  {
      ...data,
      // Forzar undefined → no actualizar campos ausentes
      name:               data.name               ?? undefined,
      legal_name:         data.legal_name         ?? undefined,
      nit:                data.nit                ?? undefined,
      tenant_id:          data.tenant_id          ?? undefined,
      vertical_id:        data.vertical_id        ?? undefined,
      plan_id:            data.plan_id            ?? undefined,
      country_code:       data.country_code       ?? undefined,
      timezone:           data.timezone           ?? undefined,
      domain:              data.domain              ?? undefined,
      logo_url:            data.logo_url            ?? undefined,
      deployment_url:      data.deployment_url      ?? undefined,
      instance_identifier: data.instance_identifier ?? undefined,
      trial_ends_at:       data.trial_ends_at       ?? undefined,
      license_expires_at:  data.license_expires_at  ?? undefined,
    },
  });

  revalidatePath("/dashboard/platform/organizations");
  revalidatePath(`/dashboard/platform/organizations/${id}`);
}
