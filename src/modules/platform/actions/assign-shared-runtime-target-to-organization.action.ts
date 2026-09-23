"use server";

// ─────────────────────────────────────────────────────────────────
// platform — assign-shared-runtime-target-to-organization.action.ts
//
// SHARED-PILOT-4A / Gap B + Gap D. Asigna organization.shared_runtime_
// target_id — el paso previo a provisionSharedRuntimeOrganizationAction
// para el modo SHARED. Reemplaza "copiar host/password" por
// "seleccionar un target ya registrado".
//
// Guards de seguridad (fail closed):
// - Solo super_admin.
// - No reasignar si la organización ya tiene tenant_id (ya
//   provisionada) — evitaría que runtime-database-router empiece a
//   resolver otra base física para una organización cuyos datos ya
//   viven en otro lado. Requiere recovery manual explícito.
// - No asignar si la organización ya tiene un PlatformDatabaseProfile
//   Dedicated activo — evita ambigüedad Dedicated vs Shared para la
//   misma organización (runtime-database-router prioriza Shared si
//   ambos existieran).
// - El target debe existir y estar activo.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";

const assignSchema = z.object({
  organizationId:        z.string().uuid("organizationId debe ser un UUID válido."),
  sharedRuntimeTargetId: z.string().uuid("sharedRuntimeTargetId debe ser un UUID válido."),
});

export interface AssignSharedRuntimeTargetResult {
  success: boolean;
  error?: string;
}

export async function assignSharedRuntimeTargetToOrganizationAction(
  input: { organizationId: string; sharedRuntimeTargetId: string },
): Promise<AssignSharedRuntimeTargetResult> {
  await requireSuperAdmin();

  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { organizationId, sharedRuntimeTargetId } = parsed.data;

  const organization = await prisma.platformOrganization.findUnique({
    where:  { id: organizationId },
    select: { id: true, tenant_id: true },
  });
  if (!organization) {
    return { success: false, error: "Organización no encontrada." };
  }
  if (organization.tenant_id) {
    return {
      success: false,
      error: "La organización ya está provisionada (tenant_id vinculado). No se puede reasignar el runtime automáticamente.",
    };
  }

  const activeDedicatedProfile = await prisma.platformDatabaseProfile.findFirst({
    where:  { organization_id: organizationId, is_active: true },
    select: { id: true },
  });
  if (activeDedicatedProfile) {
    return {
      success: false,
      error: "La organización ya tiene un perfil de base de datos Dedicated activo. Desactívalo antes de asignar un Shared Runtime.",
    };
  }

  const target = await prisma.platformSharedRuntimeTarget.findUnique({
    where:  { id: sharedRuntimeTargetId },
    select: { id: true, is_active: true },
  });
  if (!target) {
    return { success: false, error: "Shared Runtime no encontrado." };
  }
  if (!target.is_active) {
    return { success: false, error: "El Shared Runtime seleccionado está inactivo." };
  }

  await prisma.platformOrganization.update({
    where: { id: organizationId },
    data:  { shared_runtime_target_id: sharedRuntimeTargetId },
  });

  revalidatePath("/dashboard/platform/organizations");
  revalidatePath(`/dashboard/platform/organizations/${organizationId}`);
  revalidatePath("/dashboard/platform/database-profiles");

  return { success: true };
}
