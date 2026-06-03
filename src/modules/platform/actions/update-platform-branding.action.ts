"use server";

// ─────────────────────────────────────────────────────────────────
// platform — update-platform-branding.action.ts
//
// Actualiza el branding de una organización.
// Crea el registro si no existe (puede ocurrir en orgs legacy).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { updatePlatformBrandingSchema } from "../schemas/update-platform-branding.schema";

export type PlatformActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function updatePlatformBrandingAction(
  _prev: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  const sessionUser = await requireSuperAdmin();

  const raw = {
    organization_id: formData.get("organization_id") as string,
    primary_color:   formData.get("primary_color")   || null,
    secondary_color: formData.get("secondary_color") || null,
    logo_url:        formData.get("logo_url")        || null,
    favicon_url:     formData.get("favicon_url")     || null,
    custom_domain:   formData.get("custom_domain")   || null,
  };

  const parsed = updatePlatformBrandingSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { organization_id, ...data } = parsed.data;

  const org = await prisma.platformOrganization.findUnique({
    where:  { id: organization_id },
    select: { id: true },
  });
  if (!org) return { error: "Organización no encontrada." };

  await prisma.platformBranding.upsert({
    where:  { organization_id },
    update: {
      ...data,
      updated_by: sessionUser.id,
    },
    create: {
      organization_id,
      ...data,
      created_by: sessionUser.id,
    },
  });

  revalidatePath(`/dashboard/platform/organizations/${organization_id}`);
}
