"use server";

// ─────────────────────────────────────────────────────────────────
// platform — run-database-profile-tenant-fiscal-config.action.ts
//
// D1B: Runner controlado para crear o asegurar TenantFiscalConfig
// en una base cliente seleccionada (PlatformDatabaseProfile).
//
// Reglas de seguridad:
// - Solo super_admin.
// - PRODUCTION bloqueado siempre en D1B.
// - CONTROL_PLANE y UNKNOWN bloqueados por D0.
// - Requiere tenant_id válido en PlatformOrganization.
// - Pasa por evaluateDatabaseExecutionSafety antes de actuar.
// - Dry-run: solo lectura, sin efectos.
// - Real run: upsert idempotente en tenant_fiscal_config únicamente.
// - Nunca loguea DATABASE_URL ni encrypted_password.
// - Siempre $disconnect() vía withTemporaryPrismaClient.
// - No ejecuta migraciones. No toca otras tablas.
// - Registra resultado en PlatformDeploymentLog (control plane).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }            from "next/cache";
import { requireSuperAdmin }         from "@/lib/permissions/guards";
import { prisma }                    from "@/lib/db/prisma";
import { assertEncryptionAvailable } from "@/lib/security/encryption";
import {
  buildDatabaseUrlFromProfile,
  sanitizeDatabaseError,
}                                    from "../lib/database-profile-url";
import { withTemporaryPrismaClient } from "../lib/client-prisma";
import { evaluateDatabaseExecutionSafety } from "../lib/database-execution-safety";
import {
  runTenantFiscalConfigDryRun,
  runTenantFiscalConfigSeed,
}                                    from "../lib/seed-runners/tenant-fiscal-config-runner";
import { TENANT_FISCAL_CONFIG_SEED_CONFIRMATION_TEXT } from "../lib/seed-runners/tenant-fiscal-config.constants";
import type {
  TenantFiscalConfigActionInput,
  TenantFiscalConfigActionState,
  PlatformDatabaseProfileEnvironment,
  DatabaseExecutionSafetyInput,
}                                    from "../types/platform.types";

export async function runDatabaseProfileTenantFiscalConfigAction(
  input: TenantFiscalConfigActionInput,
): Promise<TenantFiscalConfigActionState> {
  await requireSuperAdmin();

  if (!input.profileId || typeof input.profileId !== "string") {
    return { success: false, error: "profileId requerido." };
  }
  if (input.mode !== "DRY_RUN" && input.mode !== "EXECUTE") {
    return { success: false, error: "mode debe ser DRY_RUN o EXECUTE." };
  }

  try {
    assertEncryptionAvailable();
  } catch (err) {
    return {
      success: false,
      error:   err instanceof Error ? err.message : "Clave de cifrado no disponible.",
    };
  }

  // Cargar perfil con credenciales y tenant_id de la organización
  const profile = await prisma.platformDatabaseProfile.findUnique({
    where:  { id: input.profileId },
    select: {
      id:                 true,
      label:              true,
      environment:        true,
      db_host:            true,
      db_port:            true,
      db_name:            true,
      db_user:            true,
      encrypted_password: true,
      ssl_mode:           true,
      last_test_status:   true,
      organization: {
        select: {
          id:        true,
          tenant_id: true,
        },
      },
    },
  });

  if (!profile) {
    return { success: false, error: "Perfil de base de datos no encontrado." };
  }

  // ── Verificar tenant_id en la organización ────────────────────
  const tenantId = profile.organization.tenant_id;
  if (!tenantId) {
    return {
      success: false,
      error:
        "La organización asociada a este perfil no tiene tenant_id configurado. " +
        "Asignar tenant_id en Platform Admin antes de ejecutar este runner.",
    };
  }

  // ── Hard block: PRODUCTION siempre bloqueado en D1B ──────────
  if (profile.environment === "PRODUCTION") {
    return {
      success:        false,
      blocked:        true,
      safetyBlockers: [
        "Ejecución bloqueada en PRODUCTION (D1B). " +
        "La habilitación en producción estará disponible en versiones futuras " +
        "con controles adicionales (backup obligatorio, aprobación segunda persona).",
      ],
      error: "TenantFiscalConfig runner bloqueado en PRODUCTION en D1B.",
    };
  }

  // ── Safety Gate (D0) ──────────────────────────────────────────
  // hasRecentPreflight: true — este runner se invoca desde el modal de preflight,
  // que ya ejecutó un preflight exitoso para mostrar el item TENANT_FISCAL_CONFIG.
  const safetyInput: DatabaseExecutionSafetyInput = {
    actionType:                        "CREATE_TENANT_FISCAL_CONFIG",
    profileEnvironment:                profile.environment as PlatformDatabaseProfileEnvironment,
    targetType:                        "CLIENT_RUNTIME",
    isDryRun:                          input.mode === "DRY_RUN",
    confirmationText:                  input.mode === "EXECUTE"
                                         ? (input.confirmationText ?? "")
                                         : undefined,
    expectedConfirmationText:          input.mode === "EXECUTE"
                                         ? TENANT_FISCAL_CONFIG_SEED_CONFIRMATION_TEXT
                                         : undefined,
    hasRecentSuccessfulConnectionTest: profile.last_test_status === "SUCCESS",
    hasRecentPreflight:                true,  // invocado desde dentro del preflight modal
  };

  const safety = evaluateDatabaseExecutionSafety(safetyInput);

  if (!safety.allowed) {
    return {
      success:        false,
      blocked:        safety.blocked,
      safetyBlockers: safety.blockers,
      error:          safety.blockers[0] ?? "Acción bloqueada por el safety gate.",
    };
  }

  // ── Construir URL en memoria (nunca persistir ni loguear) ─────
  const databaseUrl = buildDatabaseUrlFromProfile(profile);

  try {
    // ── Modo DRY_RUN — solo lectura ───────────────────────────
    if (input.mode === "DRY_RUN") {
      const dryRunResult = await withTemporaryPrismaClient(
        databaseUrl,
        (client) => runTenantFiscalConfigDryRun(client, { tenantId }),
      );

      return {
        success:        true,
        mode:           "DRY_RUN",
        profileLabel:   profile.label,
        tenantId,
        safetyMessages: safety.messages,
        safetyWarnings: safety.warnings,
        dryRunResult,
      };
    }

    // ── Modo EXECUTE — upsert idempotente ─────────────────────
    const seedResult = await withTemporaryPrismaClient(
      databaseUrl,
      (client) => runTenantFiscalConfigSeed(client, { tenantId }),
    );

    // Registrar en control plane (no bloquear si falla el log)
    try {
      await prisma.platformDeploymentLog.create({
        data: {
          organization_id: profile.organization.id,
          action:          "CREATE_TENANT_FISCAL_CONFIG",
          status:          "SUCCESS",
          notes:           `TenantFiscalConfig ejecutado — perfil: ${profile.label}`,
          metadata: {
            profileId:    profile.id,
            profileLabel: profile.label,
            mode:         "EXECUTE",
            tenantId,
            created:      seedResult.created,
            updated:      seedResult.updated,
            unchanged:    seedResult.unchanged,
            configId:     seedResult.configId,
          },
        },
      });
    } catch {
      // log failure no bloquea la respuesta
    }

    revalidatePath("/dashboard/platform/database-profiles");

    return {
      success:        true,
      mode:           "EXECUTE",
      profileLabel:   profile.label,
      tenantId,
      safetyMessages: safety.messages,
      safetyWarnings: safety.warnings,
      seedResult,
    };
  } catch (err) {
    const errorMsg = sanitizeDatabaseError(err);

    // Registrar fallo en control plane (solo si era EXECUTE)
    if (input.mode === "EXECUTE") {
      try {
        await prisma.platformDeploymentLog.create({
          data: {
            organization_id: profile.organization.id,
            action:          "CREATE_TENANT_FISCAL_CONFIG",
            status:          "FAILED",
            notes:           `TenantFiscalConfig falló — perfil: ${profile.label}: ${errorMsg}`,
            metadata:        { profileId: profile.id, mode: "EXECUTE", tenantId, error: errorMsg },
          },
        });
      } catch {
        // ignore
      }
    }

    return { success: false, error: errorMsg };
  }
}
