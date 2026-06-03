"use server";

// ─────────────────────────────────────────────────────────────────
// platform — create-platform-organization.action.ts
//
// Crea un nuevo registro PlatformOrganization.
// Solo super_admin puede ejecutar acciones del dominio platform.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { createPlatformOrganizationSchema } from "../schemas/create-platform-organization.schema";

export type PlatformActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function createPlatformOrganizationAction(
  _prev: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  const sessionUser = await requireSuperAdmin();

  const raw = {
    code:               formData.get("code")               as string,
    name:               formData.get("name")               as string,
    legal_name:         formData.get("legal_name")         || null,
    nit:                formData.get("nit")                || null,
    tenant_id:          formData.get("tenant_id")          || null,
    vertical_id:        formData.get("vertical_id")        || null,
    plan_id:            formData.get("plan_id")            || null,
    billing_cycle:      formData.get("billing_cycle")      || "MONTHLY",
    country_code:       formData.get("country_code")       || null,
    timezone:           formData.get("timezone")           || null,
    domain:             formData.get("domain")             || null,
    logo_url:           formData.get("logo_url")           || null,
    trial_ends_at:      formData.get("trial_ends_at")      || null,
    license_expires_at: formData.get("license_expires_at") || null,
  };

  const parsed = createPlatformOrganizationSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;

  // Unicidad del code
  const existing = await prisma.platformOrganization.findUnique({
    where: { code: data.code },
    select: { id: true },
  });
  if (existing) {
    return { errors: { code: ["Ya existe una organización con este código."] } };
  }

  await prisma.$transaction(async (tx) => {
    const org = await tx.platformOrganization.create({
      data: {
        code:               data.code,
        name:               data.name,
        legal_name:         data.legal_name   ?? null,
        nit:                data.nit          ?? null,
        tenant_id:          data.tenant_id    ?? null,
        vertical_id:        data.vertical_id  ?? null,
        plan_id:            data.plan_id      ?? null,
        billing_cycle:      data.billing_cycle,
        status:             "PENDING",
        license_status:     "TRIAL",
        country_code:       data.country_code       ?? null,
        timezone:           data.timezone           ?? null,
        domain:             data.domain             ?? null,
        logo_url:           data.logo_url           ?? null,
        trial_ends_at:      data.trial_ends_at      ?? null,
        license_expires_at: data.license_expires_at ?? null,
        created_by:         sessionUser.id,
      },
    });

    // Branding vacío inicial
    await tx.platformBranding.create({
      data: { organization_id: org.id },
    });

    // Log de deployment
    await tx.platformDeploymentLog.create({
      data: {
        organization_id: org.id,
        action:          "CREATE_ORG",
        status:          "SUCCESS",
        notes:           `Organización "${org.name}" creada`,
        triggered_by:    sessionUser.id,
        started_at:      new Date(),
        ended_at:        new Date(),
      },
    });
  });

  revalidatePath("/dashboard/platform/organizations");
}
