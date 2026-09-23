"use server";

// ─────────────────────────────────────────────────────────────────
// platform — provision-shared-runtime-organization.action.ts
//
// SHARED-PILOT-4A / Gap A + Gap E. Conecta provisionRuntimeTenant()
// (motor puro, SHARED-PILOT-3B) a Platform Admin, y automatiza el
// Tenant Binding que hoy exige bind-organization-tenant.action.ts de
// forma manual (adminKey + confirmación textual) — ver el TODO en ese
// archivo.
//
// Reglas de seguridad:
// - Solo super_admin.
// - El perfil de base de datos se resuelve SIEMPRE server-side por
//   organizationId (withRuntimePrismaForProvisioning) — el browser
//   nunca envía profileId, host, password ni ningún UUID de tenant.
// - COMMERCE_ONLY nunca crea fila Gym (garantizado por
//   provisionRuntimeTenant, no reimplementado aquí).
// - Password del admin: nunca se loguea, nunca se devuelve, nunca se
//   persiste en PlatformDeploymentLog.metadata.
//
// Idempotencia (Gap C):
// - Si organization.tenant_id ya existe → no-op, se reporta el
//   resultado ya cerrado (alreadyProvisioned: true). Cubre el caso
//   "reintento después de que todo ya terminó bien".
// - Si no existe tenant_id pero SÍ existe un log
//   PROVISION_RUNTIME_TENANT_CREATED/SUCCESS previo para esta
//   organización, se reutiliza ese resultado (tenantId/gymId/
//   locationId/adminUserId) y solo se reintenta el bind. Cubre el
//   caso "el RuntimeTenant se creó pero el bind falló después".
//   La clave de recuperación es organization_id (PlatformDeploymentLog
//   vive en el control plane, ligado a la organización — nunca se usa
//   tenantSlug como mecanismo de recuperación).
// - Si no hay tenant_id ni log previo, se crea desde cero.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { controlPlanePrisma } from "../runtime/control-plane-prisma";
import {
  withRuntimePrismaForProvisioning,
  ActiveProfileNotFoundError,
  OrganizationNotFoundError,
  ProfileConnectionInvalidError,
  RuntimeDatabaseUnreachableError,
} from "../runtime/runtime-database-router";
import { provisionRuntimeTenant } from "../lib/provisioning/provision-runtime-tenant";
import {
  provisionSharedRuntimeOrganizationSchema,
  type ProvisionSharedRuntimeOrganizationInput,
} from "../schemas/provision-shared-runtime-organization.schema";

const CREATED_LOG_ACTION = "PROVISION_RUNTIME_TENANT_CREATED";
const FAILED_LOG_ACTION = "PROVISION_RUNTIME_TENANT_FAILED";
const BIND_LOG_ACTION = "BIND_TENANT";

export interface ProvisionSharedRuntimeOrganizationResult {
  success: boolean;
  error?: string;
  tenantId?: string;
  gymId?: string | null;
  locationId?: string;
  adminUserId?: string;
  alreadyProvisioned?: boolean;
}

interface ProvisionCreatedLogMetadata {
  tenantId: string;
  gymId: string | null;
  locationId: string;
  adminUserId: string;
  mode: "COMMERCE_ONLY" | "GYM";
  profileId: string;
}

function isCreatedMetadata(value: unknown): value is ProvisionCreatedLogMetadata {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.tenantId === "string" &&
    typeof v.locationId === "string" &&
    typeof v.adminUserId === "string" &&
    (v.gymId === null || typeof v.gymId === "string") &&
    (v.mode === "COMMERCE_ONLY" || v.mode === "GYM")
  );
}

function describeProvisioningError(err: unknown): string {
  if (err instanceof ActiveProfileNotFoundError) {
    return "La organización no tiene un perfil de base de datos activo asignado. Asígnalo primero en Database Profiles.";
  }
  if (err instanceof OrganizationNotFoundError) {
    return "Organización no encontrada al resolver el perfil de base de datos.";
  }
  if (err instanceof ProfileConnectionInvalidError || err instanceof RuntimeDatabaseUnreachableError) {
    return "No se pudo conectar a la base runtime asignada. Verifica el perfil de base de datos en Database Profiles.";
  }
  if (err instanceof Error && err.message.includes("Unique constraint")) {
    return "Ya existe un tenant o gym con ese slug en la base runtime. Usa un slug distinto.";
  }
  return "Error inesperado durante el provisioning. Revisa PlatformDeploymentLog para el detalle.";
}

export async function provisionSharedRuntimeOrganizationAction(
  input: ProvisionSharedRuntimeOrganizationInput,
): Promise<ProvisionSharedRuntimeOrganizationResult> {
  const sessionUser = await requireSuperAdmin();

  const parsed = provisionSharedRuntimeOrganizationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const data = parsed.data;

  const organization = await controlPlanePrisma.platformOrganization.findUnique({
    where:  { id: data.organizationId },
    select: { id: true, name: true, tenant_id: true },
  });
  if (!organization) {
    return { success: false, error: "Organización no encontrada." };
  }

  if (organization.tenant_id) {
    return { success: true, tenantId: organization.tenant_id, alreadyProvisioned: true };
  }

  const priorCreated = await controlPlanePrisma.platformDeploymentLog.findFirst({
    where: {
      organization_id: data.organizationId,
      action:          CREATED_LOG_ACTION,
      status:          "SUCCESS",
    },
    orderBy: { created_at: "desc" },
    select:  { metadata: true },
  });

  let created: ProvisionCreatedLogMetadata;

  if (priorCreated?.metadata && isCreatedMetadata(priorCreated.metadata)) {
    created = priorCreated.metadata;
  } else {
    try {
      created = await withRuntimePrismaForProvisioning(data.organizationId, async (client, profileId) => {
        const result = await provisionRuntimeTenant(
          client,
          data.mode === "GYM"
            ? {
                mode:         "GYM",
                tenantName:   data.tenantName,
                tenantSlug:   data.tenantSlug,
                gymName:      data.gymName,
                gymSlug:      data.gymSlug,
                locationName: data.locationName,
                admin:        data.admin,
              }
            : {
                mode:         "COMMERCE_ONLY",
                tenantName:   data.tenantName,
                tenantSlug:   data.tenantSlug,
                locationName: data.locationName,
                admin:        data.admin,
              },
        );
        return {
          tenantId:    result.tenantId,
          gymId:       result.gymId,
          locationId:  result.locationId,
          adminUserId: result.adminUserId,
          mode:        data.mode,
          profileId,
        } satisfies ProvisionCreatedLogMetadata;
      });
    } catch (err) {
      await controlPlanePrisma.platformDeploymentLog.create({
        data: {
          organization_id: data.organizationId,
          action:          FAILED_LOG_ACTION,
          status:          "FAILED",
          notes:           describeProvisioningError(err),
          triggered_by:    sessionUser.id,
          started_at:      new Date(),
          ended_at:        new Date(),
        },
      });
      return { success: false, error: describeProvisioningError(err) };
    }

    await controlPlanePrisma.platformDeploymentLog.create({
      data: {
        organization_id: data.organizationId,
        action:          CREATED_LOG_ACTION,
        status:          "SUCCESS",
        notes:           `RuntimeTenant creado (mode=${created.mode}).`,
        metadata:        { ...created },
        triggered_by:    sessionUser.id,
        started_at:      new Date(),
        ended_at:        new Date(),
      },
    });
  }

  // Bind automático — guard defensivo: el tenant recién creado (o
  // recuperado del log previo) no debe estar ya tomado por otra
  // organización distinta a la actual.
  const conflicting = await controlPlanePrisma.platformOrganization.findFirst({
    where:  { tenant_id: created.tenantId, NOT: { id: data.organizationId } },
    select: { id: true, name: true },
  });
  if (conflicting) {
    return {
      success: false,
      error: `El RuntimeTenant creado ya está vinculado a otra organización (${conflicting.name}). Requiere revisión manual vía Tenant Binding.`,
    };
  }

  await controlPlanePrisma.$transaction([
    controlPlanePrisma.platformOrganization.update({
      where: { id: data.organizationId },
      data:  { tenant_id: created.tenantId },
    }),
    controlPlanePrisma.platformDeploymentLog.create({
      data: {
        organization_id: data.organizationId,
        action:          BIND_LOG_ACTION,
        status:          "SUCCESS",
        notes:           "Tenant vinculado automáticamente por provisioning Shared Runtime.",
        metadata:        { previousTenantId: null, newTenantId: created.tenantId, auto: true },
        triggered_by:    sessionUser.id,
        started_at:      new Date(),
        ended_at:        new Date(),
      },
    }),
  ]);

  revalidatePath("/dashboard/platform/organizations");
  revalidatePath(`/dashboard/platform/organizations/${data.organizationId}`);
  revalidatePath("/dashboard/platform/provisioning");
  revalidatePath(`/dashboard/platform/provisioning/${data.organizationId}`);
  revalidatePath("/dashboard/platform/database-profiles");

  return {
    success:            true,
    tenantId:           created.tenantId,
    gymId:              created.gymId,
    locationId:         created.locationId,
    adminUserId:        created.adminUserId,
    alreadyProvisioned: false,
  };
}
