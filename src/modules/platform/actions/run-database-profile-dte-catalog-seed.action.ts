"use server";

// ─────────────────────────────────────────────────────────────────
// platform — run-database-profile-dte-catalog-seed.action.ts
//
// D1A: Seed runner controlado para DteCatalogItems contra un
// PlatformDatabaseProfile.
//
// Reglas de seguridad:
// - Solo super_admin.
// - PRODUCTION bloqueado siempre en D1A.
// - Pasa por evaluateDatabaseExecutionSafety antes de actuar.
// - Dry-run: solo lectura, sin efectos.
// - Real run: upsert idempotente en dte_catalog_items únicamente.
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
  runDteCatalogItemsSeedDryRun,
  runDteCatalogItemsSeed,
}                                    from "../lib/seed-runners/dte-catalog-items-runner";
import { DTE_CATALOG_SEED_CONFIRMATION_TEXT } from "../lib/seed-runners/dte-catalog-seed.constants";
import type {
  DteCatalogSeedActionInput,
  DteCatalogSeedActionState,
  PlatformDatabaseProfileEnvironment,
  DatabaseExecutionSafetyInput,
}                                    from "../types/platform.types";

export async function runDatabaseProfileDteCatalogSeedAction(
  input: DteCatalogSeedActionInput,
): Promise<DteCatalogSeedActionState> {
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

  // Cargar perfil con credenciales desde control plane
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
      organization: { select: { id: true } },
    },
  });

  if (!profile) {
    return { success: false, error: "Perfil de base de datos no encontrado." };
  }

  // ── Hard block: PRODUCTION siempre bloqueado en D1A ──────────
  if (profile.environment === "PRODUCTION") {
    return {
      success:         false,
      blocked:         true,
      safetyBlockers:  [
        "Ejecución bloqueada en PRODUCTION (D1A). " +
        "La habilitación en producción estará disponible en versiones futuras " +
        "con controles adicionales (backup obligatorio, aprobación segunda persona).",
      ],
      error: "Seeds bloqueados en PRODUCTION en D1A.",
    };
  }

  // ── Safety Gate (D0) ──────────────────────────────────────────
  const safetyInput: DatabaseExecutionSafetyInput = {
    actionType:                        "SEED_DTE_CATALOGS",
    profileEnvironment:                profile.environment as PlatformDatabaseProfileEnvironment,
    targetType:                        "CLIENT_RUNTIME",
    isDryRun:                          input.mode === "DRY_RUN",
    confirmationText:                  input.mode === "EXECUTE"
                                         ? (input.confirmationText ?? "")
                                         : undefined,
    expectedConfirmationText:          input.mode === "EXECUTE"
                                         ? DTE_CATALOG_SEED_CONFIRMATION_TEXT
                                         : undefined,
    hasRecentSuccessfulConnectionTest: profile.last_test_status === "SUCCESS",
    hasRecentPreflight:                false,  // no tracked yet — genera solo WARNING en LOW
  };

  const safety = evaluateDatabaseExecutionSafety(safetyInput);

  if (!safety.allowed) {
    return {
      success:         false,
      blocked:         safety.blocked,
      safetyBlockers:  safety.blockers,
      error:           safety.blockers[0] ?? "Acción bloqueada por el safety gate.",
    };
  }

  // ── Construir URL en memoria (nunca persistir ni loguear) ─────
  const databaseUrl = buildDatabaseUrlFromProfile(profile);

  try {
    // ── Modo DRY_RUN — solo lectura ───────────────────────────
    if (input.mode === "DRY_RUN") {
      const dryRunResult = await withTemporaryPrismaClient(
        databaseUrl,
        (client) => runDteCatalogItemsSeedDryRun(client),
      );

      return {
        success:        true,
        mode:           "DRY_RUN",
        profileLabel:   profile.label,
        safetyMessages: safety.messages,
        safetyWarnings: safety.warnings,
        dryRunResult,
      };
    }

    // ── Modo EXECUTE — upsert idempotente ─────────────────────
    const seedResult = await withTemporaryPrismaClient(
      databaseUrl,
      (client) => runDteCatalogItemsSeed(client),
    );

    // Registrar en control plane (no bloquear si falla el log)
    try {
      await prisma.platformDeploymentLog.create({
        data: {
          organization_id: profile.organization.id,
          action:          "SEED_DTE_CATALOGS",
          status:          "SUCCESS",
          notes:           `Seed DTE catalogs ejecutado — perfil: ${profile.label}`,
          metadata: {
            profileId:     profile.id,
            profileLabel:  profile.label,
            mode:          "EXECUTE",
            created:       seedResult.created,
            updated:       seedResult.updated,
            totalExpected: seedResult.totalExpected,
            totalAfter:    seedResult.totalAfter,
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
            action:          "SEED_DTE_CATALOGS",
            status:          "FAILED",
            notes:           `Seed DTE catalogs falló — perfil: ${profile.label}: ${errorMsg}`,
            metadata:        { profileId: profile.id, mode: "EXECUTE", error: errorMsg },
          },
        });
      } catch {
        // ignore
      }
    }

    return { success: false, error: errorMsg };
  }
}
