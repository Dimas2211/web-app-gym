"use server";

import { revalidatePath }                  from "next/cache";
import { requireSuperAdmin }               from "@/lib/permissions/guards";
import { prisma }                          from "@/lib/db/prisma";
import { updateOrganizationLicenseSchema } from "../schemas/update-organization-license.schema";

export type LicenseActionState =
  | { errors?: Record<string, string[]>; error?: string; success?: boolean }
  | undefined;

export async function updateOrganizationLicenseAction(
  _prev: LicenseActionState,
  formData: FormData,
): Promise<LicenseActionState> {
  await requireSuperAdmin();

  const raw = {
    id:                 formData.get("id"),
    license_status:     formData.get("license_status")     || undefined,
    billing_cycle:      formData.get("billing_cycle")      || undefined,
    trial_ends_at:      formData.get("trial_ends_at")      || null,
    license_expires_at: formData.get("license_expires_at") || null,
    suspended_at:       formData.get("suspended_at")       || null,
    suspension_reason:  formData.get("suspension_reason")  || null,
  };

  const parsed = updateOrganizationLicenseSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { id, ...data } = parsed.data;

  const exists = await prisma.platformOrganization.findUnique({
    where:  { id },
    select: { id: true },
  });
  if (!exists) return { error: "Organización no encontrada." };

  await prisma.platformOrganization.update({ where: { id }, data });

  revalidatePath("/dashboard/platform/organizations");
  revalidatePath(`/dashboard/platform/organizations/${id}`);
  return { success: true };
}
