"use server";

// ─────────────────────────────────────────────────────────────────
// platform — ensure-organization-runtime-baseline.action.ts
//
// SHARED-OPS-PARITY-1. Inicializa/verifica el baseline Commerce
// tenant-scoped (IVA 13%, categoría GENERAL, TenantFiscalConfig) de UNA
// organización ya provisionada (Shared o Dedicated). Idempotente: solo
// crea lo que falta; nunca actualiza, borra ni toca otros tenants.
//
// Flujo: requireSuperAdmin → organizationId → PlatformOrganization →
// tenant_id → runtime (router) → ensureCommerceTenantBaselineAtomic
// (transacción + advisory lock por tenant) → PlatformDeploymentLog.
//
// Solo se ejecuta cuando un super_admin lo pide explícitamente desde
// Platform Admin — nunca automáticamente.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { assertEncryptionAvailable } from "@/lib/security/encryption";
import { controlPlanePrisma } from "../runtime/control-plane-prisma";
import {
  resolveOrganizationRuntime,
  isOrganizationRuntimeResolutionError,
  type OrganizationRuntimeKind,
} from "../runtime/resolve-organization-runtime";
import { getRuntimeDatabaseUrlFromProfile } from "../runtime/runtime-database-router";
import { withTemporaryPrismaClient } from "../lib/client-prisma";
import { sanitizeDatabaseError } from "../lib/database-profile-url";
import {
  ensureCommerceTenantBaselineAtomic,
  CommerceBaselineTenantNotFoundError,
  type CommerceBaselineItem,
} from "../lib/provisioning/ensure-commerce-tenant-baseline";

export type EnsureOrganizationRuntimeBaselineResult =
  | {
      success:          true;
      organizationCode: string;
      runtimeKind:      OrganizationRuntimeKind;
      runtimeLabel:     string;
      tenantId:         string;
      created:          CommerceBaselineItem[];
      alreadyExisting:  CommerceBaselineItem[];
    }
  | { success: false; error: string };

export async function ensureOrganizationRuntimeBaselineAction(
  organizationId: string,
): Promise<EnsureOrganizationRuntimeBaselineResult> {
  await requireSuperAdmin();

  if (typeof organizationId !== "string" || !organizationId.trim()) {
    return { success: false, error: "ID de organización requerido." };
  }

  try {
    assertEncryptionAvailable();
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Clave de cifrado no disponible." };
  }

  let resolved;
  try {
    resolved = await resolveOrganizationRuntime({ organizationId: organizationId.trim() });
  } catch (err) {
    if (isOrganizationRuntimeResolutionError(err)) return { success: false, error: err.message };
    return { success: false, error: "No se pudo resolver el runtime de la organización." };
  }
  const { header, profile } = resolved;

  let result;
  try {
    const databaseUrl = getRuntimeDatabaseUrlFromProfile(profile);
    // tenantId exclusivamente de PlatformOrganization.tenant_id.
    result = await withTemporaryPrismaClient(databaseUrl, (client) =>
      ensureCommerceTenantBaselineAtomic(client, header.tenantId),
    );
  } catch (err) {
    const message = err instanceof CommerceBaselineTenantNotFoundError
      ? err.message
      : `No se pudo asegurar el baseline Commerce: ${sanitizeDatabaseError(err)}`;
    try {
      await controlPlanePrisma.platformDeploymentLog.create({
        data: {
          organization_id: header.organizationId,
          action:          "ENSURE_COMMERCE_BASELINE",
          status:          "FAILED",
          notes:           `Baseline Commerce — ${header.runtimeKind} ${header.runtimeLabel} — fallo`,
          metadata:        {
            tenantId:        header.tenantId,
            runtimeKind:     header.runtimeKind,
            runtimeTargetId: header.runtimeTargetId,
            environment:     header.environment,
          },
        },
      });
    } catch {
      // log failure no bloquea la respuesta
    }
    return { success: false, error: message };
  }

  try {
    await controlPlanePrisma.platformDeploymentLog.create({
      data: {
        organization_id: header.organizationId,
        action:          "ENSURE_COMMERCE_BASELINE",
        status:          "SUCCESS",
        notes:           `Baseline Commerce — ${header.runtimeKind} ${header.runtimeLabel} — created: ${result.created.length}, existing: ${result.alreadyExisting.length}`,
        metadata:        {
          tenantId:        header.tenantId,
          runtimeKind:     header.runtimeKind,
          runtimeTargetId: header.runtimeTargetId,
          environment:     header.environment,
          created:         result.created,
          alreadyExisting: result.alreadyExisting,
        },
      },
    });
  } catch {
    // log failure no bloquea la respuesta
  }

  revalidatePath("/dashboard/platform/database-profiles");

  return {
    success:          true,
    organizationCode: header.organizationCode,
    runtimeKind:      header.runtimeKind,
    runtimeLabel:     header.runtimeLabel,
    tenantId:         header.tenantId,
    created:          result.created,
    alreadyExisting:  result.alreadyExisting,
  };
}
