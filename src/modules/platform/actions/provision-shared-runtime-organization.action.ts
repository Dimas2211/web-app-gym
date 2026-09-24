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
//   persiste en PlatformDeploymentLog.metadata ni en la operación.
//
// Idempotencia distribuida (SHARED-PILOT-4B):
// No existe transacción ACID entre Control Plane y la base runtime.
// El cierre formal usa dos registros, uno en cada base:
//
//   1. PlatformRuntimeProvisioningOperation (Control Plane) — coordination
//      state. Se persiste ANTES de tocar runtime, 1 por organización
//      (organization_id @unique), con una idempotency_key aleatoria
//      generada aquí (server-side) y reutilizada en TODOS los reintentos.
//   2. RuntimeProvisioningReceipt (Runtime DB) — prueba de aplicación,
//      escrita en la MISMA transacción runtime que Tenant/Location/Admin.
//
// Retry después de cualquier fallo → misma key → el motor encuentra el
// receipt (si el commit runtime ocurrió) y devuelve los MISMOS IDs sin
// escribir; si no ocurrió, crea todo. Finalización Control Plane (bind +
// COMPLETED + logs) en UNA transacción, con bind condicional:
//   tenant_id null → bindear; igual → retry idempotente; distinto → fail closed.
// PlatformDeploymentLog es solo auditoría — nunca se usa para decidir.
// ─────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { controlPlanePrisma } from "../runtime/control-plane-prisma";
import {
  withRuntimePrismaForProvisioning,
  ActiveProfileNotFoundError,
  OrganizationNotFoundError,
  ProfileConnectionInvalidError,
  RuntimeDatabaseUnreachableError,
  SharedRuntimeTargetInactiveError,
  SharedRuntimeTargetNotFoundError,
} from "../runtime/runtime-database-router";
import {
  provisionRuntimeTenant,
  RuntimeProvisioningConflictError,
  type ProvisionRuntimeTenantResult,
} from "../lib/provisioning/provision-runtime-tenant";
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

type RuntimeTargetKind = "SHARED" | "DEDICATED";

type RuntimeOutcome =
  | { ok: true; result: ProvisionRuntimeTenantResult; profileId: string }
  | { ok: false; error: string };

/** Conflicto detectado al finalizar en Control Plane — siempre fail closed. */
class ProvisioningFinalizeConflictError extends Error {}

function describeProvisioningError(err: unknown): string {
  if (err instanceof ActiveProfileNotFoundError) {
    return "La organización no tiene un perfil de base de datos activo asignado. Asígnalo primero en Database Profiles.";
  }
  if (err instanceof OrganizationNotFoundError) {
    return "Organización no encontrada al resolver el perfil de base de datos.";
  }
  if (err instanceof SharedRuntimeTargetInactiveError || err instanceof SharedRuntimeTargetNotFoundError) {
    return "El Shared Runtime asignado a esta organización no existe o está inactivo.";
  }
  if (err instanceof ProfileConnectionInvalidError || err instanceof RuntimeDatabaseUnreachableError) {
    return "No se pudo conectar a la base runtime asignada. Verifica el perfil de base de datos en Database Profiles.";
  }
  return "Error inesperado durante el provisioning. Puedes reintentar de forma segura.";
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Recupera la operación de alta de la organización o la crea con una
 * idempotency_key nueva. organization_id @unique garantiza que dos
 * requests concurrentes terminen compartiendo la MISMA operación/key.
 */
async function getOrCreateOperation(organizationId: string, mode: string, createdBy: string) {
  const existing = await controlPlanePrisma.platformRuntimeProvisioningOperation.findUnique({
    where: { organization_id: organizationId },
  });
  if (existing) return existing;

  try {
    return await controlPlanePrisma.platformRuntimeProvisioningOperation.create({
      data: {
        organization_id: organizationId,
        idempotency_key: randomUUID(),
        mode,
        status:          "PENDING",
        created_by:      createdBy,
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const winner = await controlPlanePrisma.platformRuntimeProvisioningOperation.findUnique({
      where: { organization_id: organizationId },
    });
    if (!winner) throw err;
    return winner;
  }
}

/** Best-effort: si Control Plane está caído, el retry igual es seguro (la key ya está persistida). */
async function markOperationFailed(
  operationId: string,
  organizationId: string,
  error: string,
  triggeredBy: string,
): Promise<void> {
  try {
    await controlPlanePrisma.platformRuntimeProvisioningOperation.updateMany({
      where: { id: operationId, status: { not: "COMPLETED" } },
      data:  { status: "FAILED", last_error: error },
    });
    await controlPlanePrisma.platformDeploymentLog.create({
      data: {
        organization_id: organizationId,
        action:          FAILED_LOG_ACTION,
        status:          "FAILED",
        notes:           error,
        metadata:        { operationId },
        triggered_by:    triggeredBy,
        started_at:      new Date(),
        ended_at:        new Date(),
      },
    });
  } catch {
    // Intencional: no enmascarar el error original.
  }
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
  const organizationId = data.organizationId;

  const organization = await controlPlanePrisma.platformOrganization.findUnique({
    where:  { id: organizationId },
    select: { id: true, name: true, tenant_id: true, shared_runtime_target_id: true },
  });
  if (!organization) {
    return { success: false, error: "Organización no encontrada." };
  }

  const existingOperation = await controlPlanePrisma.platformRuntimeProvisioningOperation.findUnique({
    where: { organization_id: organizationId },
  });

  // F — operación ya COMPLETED (p.ej. el browser perdió la respuesta):
  // respuesta idempotente, 0 escrituras.
  if (existingOperation?.status === "COMPLETED") {
    if (organization.tenant_id !== existingOperation.result_tenant_id) {
      return {
        success: false,
        error: "La organización está vinculada a un tenant distinto del provisionado. Requiere revisión manual vía Tenant Binding.",
      };
    }
    return {
      success:            true,
      tenantId:           existingOperation.result_tenant_id ?? undefined,
      gymId:              existingOperation.result_gym_id,
      locationId:         existingOperation.result_location_id ?? undefined,
      adminUserId:        existingOperation.result_admin_user_id ?? undefined,
      alreadyProvisioned: true,
    };
  }

  // Organización ya vinculada sin operación 4B (Tenant Binding manual o
  // provisioning anterior a esta fase): nada que reconciliar, no-op.
  if (!existingOperation && organization.tenant_id) {
    return { success: true, tenantId: organization.tenant_id, alreadyProvisioned: true };
  }

  // A/B — la operación (y su key) se persiste ANTES de cualquier escritura runtime.
  let operation: Awaited<ReturnType<typeof getOrCreateOperation>>;
  try {
    operation = existingOperation ?? (await getOrCreateOperation(organizationId, data.mode, sessionUser.id));
    await controlPlanePrisma.platformRuntimeProvisioningOperation.update({
      where: { id: operation.id },
      data:  { status: "RUNNING", mode: data.mode, attempt_count: { increment: 1 }, last_error: null },
    });
  } catch {
    return { success: false, error: "No se pudo registrar la operación de provisioning. No se escribió nada en runtime; reintenta." };
  }

  const runtimeKind: RuntimeTargetKind = organization.shared_runtime_target_id ? "SHARED" : "DEDICATED";

  let outcome: RuntimeOutcome;
  try {
    outcome = await withRuntimePrismaForProvisioning(organizationId, async (client, profileId): Promise<RuntimeOutcome> => {
      // Fija el target físico en el primer intento; un retry contra un
      // target distinto (la organización fue reasignada) falla cerrado,
      // porque el receipt de esta key podría vivir en la otra base.
      const pinned = await controlPlanePrisma.platformRuntimeProvisioningOperation.updateMany({
        where: {
          id: operation.id,
          OR: [
            { runtime_target_id: null },
            { runtime_target_id: profileId, runtime_target_kind: runtimeKind },
          ],
        },
        data: { runtime_target_id: profileId, runtime_target_kind: runtimeKind },
      });
      if (pinned.count !== 1) {
        return {
          ok:    false,
          error: "El runtime asignado a la organización cambió desde el primer intento de provisioning. Restaura el runtime original o revisa manualmente.",
        };
      }

      try {
        const shared = {
          idempotencyKey: operation.idempotency_key,
          // E — Control Plane ya bindeó: solo se admite recuperar el receipt.
          replayOnly:     organization.tenant_id !== null,
          tenantName:     data.tenantName,
          tenantSlug:     data.tenantSlug,
          locationName:   data.locationName,
          admin:          data.admin,
        };
        const result = await provisionRuntimeTenant(
          client,
          data.mode === "GYM"
            ? { ...shared, mode: "GYM", gymName: data.gymName, gymSlug: data.gymSlug }
            : { ...shared, mode: "COMMERCE_ONLY" },
        );
        return { ok: true, result, profileId };
      } catch (err) {
        if (err instanceof RuntimeProvisioningConflictError) return { ok: false, error: err.message };
        throw err;
      }
    });
  } catch (err) {
    outcome = { ok: false, error: describeProvisioningError(err) };
  }

  if (!outcome.ok) {
    await markOperationFailed(operation.id, organizationId, outcome.error, sessionUser.id);
    return { success: false, error: outcome.error };
  }

  const { result, profileId } = outcome;

  // Finalización Control Plane — atómica. Si falla aquí (D/E), el retry
  // reutiliza la key, el motor devuelve los mismos IDs vía receipt, y
  // esta misma transacción se vuelve a ejecutar.
  try {
    await controlPlanePrisma.$transaction(async (tx) => {
      const current = await tx.platformOrganization.findUnique({
        where:  { id: organizationId },
        select: { tenant_id: true, shared_runtime_target_id: true, provisioning_status: true },
      });
      if (!current) throw new ProvisioningFinalizeConflictError("Organización no encontrada al finalizar el provisioning.");

      const expectedSharedTargetId = runtimeKind === "SHARED" ? profileId : null;
      if (current.shared_runtime_target_id !== expectedSharedTargetId) {
        throw new ProvisioningFinalizeConflictError(
          "El runtime asignado a la organización cambió durante el provisioning. Requiere revisión manual.",
        );
      }

      let bound = false;
      if (current.tenant_id === null) {
        const holder = await tx.platformOrganization.findFirst({
          where:  { tenant_id: result.tenantId, NOT: { id: organizationId } },
          select: { name: true },
        });
        if (holder) {
          throw new ProvisioningFinalizeConflictError(
            `El RuntimeTenant creado ya está vinculado a otra organización (${holder.name}). Requiere revisión manual vía Tenant Binding.`,
          );
        }
        const updated = await tx.platformOrganization.updateMany({
          where: { id: organizationId, tenant_id: null },
          data:  { tenant_id: result.tenantId },
        });
        if (updated.count === 1) {
          bound = true;
        } else {
          // Otro request concurrente bindeó primero: solo es válido si es el mismo tenant.
          const reread = await tx.platformOrganization.findUnique({
            where:  { id: organizationId },
            select: { tenant_id: true },
          });
          if (reread?.tenant_id !== result.tenantId) {
            throw new ProvisioningFinalizeConflictError(
              "La organización quedó vinculada a otro tenant durante el provisioning. Requiere revisión manual vía Tenant Binding.",
            );
          }
        }
      } else if (current.tenant_id !== result.tenantId) {
        throw new ProvisioningFinalizeConflictError(
          "La organización ya está vinculada a otro tenant. No se reescribe el binding; requiere revisión manual vía Tenant Binding.",
        );
      }

      if (current.provisioning_status !== "DEPLOYED") {
        await tx.platformOrganization.update({
          where: { id: organizationId },
          data:  { provisioning_status: "PROVISIONED" },
        });
      }

      const completed = await tx.platformRuntimeProvisioningOperation.updateMany({
        where: { id: operation.id, status: { not: "COMPLETED" } },
        data: {
          status:               "COMPLETED",
          result_tenant_id:     result.tenantId,
          result_gym_id:        result.gymId,
          result_location_id:   result.locationId,
          result_admin_user_id: result.adminUserId,
          last_error:           null,
          completed_at:         new Date(),
        },
      });

      // Auditoría solo para la finalización efectiva (no para un request
      // concurrente que llegó segundo).
      if (completed.count === 1) {
        await tx.platformDeploymentLog.create({
          data: {
            organization_id: organizationId,
            action:          CREATED_LOG_ACTION,
            status:          "SUCCESS",
            notes:           `RuntimeTenant provisionado (mode=${data.mode}${result.replayed ? ", recuperado por receipt" : ""}).`,
            metadata: {
              operationId: operation.id,
              tenantId:    result.tenantId,
              gymId:       result.gymId,
              locationId:  result.locationId,
              adminUserId: result.adminUserId,
              mode:        data.mode,
              profileId,
              replayed:    result.replayed,
            },
            triggered_by: sessionUser.id,
            started_at:   new Date(),
            ended_at:     new Date(),
          },
        });
      }
      if (bound) {
        await tx.platformDeploymentLog.create({
          data: {
            organization_id: organizationId,
            action:          BIND_LOG_ACTION,
            status:          "SUCCESS",
            notes:           "Tenant vinculado automáticamente por provisioning Shared Runtime.",
            metadata:        { previousTenantId: null, newTenantId: result.tenantId, auto: true, operationId: operation.id },
            triggered_by:    sessionUser.id,
            started_at:      new Date(),
            ended_at:        new Date(),
          },
        });
      }
    });
  } catch (err) {
    const error = err instanceof ProvisioningFinalizeConflictError
      ? err.message
      : isUniqueViolation(err)
        ? "El RuntimeTenant ya está vinculado a otra organización. Requiere revisión manual vía Tenant Binding."
        : "El tenant runtime quedó creado pero no se pudo completar el registro en Control Plane. Reintenta: se reutilizará el mismo tenant.";
    await markOperationFailed(operation.id, organizationId, error, sessionUser.id);
    return { success: false, error };
  }

  revalidatePath("/dashboard/platform/organizations");
  revalidatePath(`/dashboard/platform/organizations/${organizationId}`);
  revalidatePath("/dashboard/platform/provisioning");
  revalidatePath(`/dashboard/platform/provisioning/${organizationId}`);
  revalidatePath("/dashboard/platform/database-profiles");

  return {
    success:            true,
    tenantId:           result.tenantId,
    gymId:              result.gymId,
    locationId:         result.locationId,
    adminUserId:        result.adminUserId,
    alreadyProvisioned: false,
  };
}
