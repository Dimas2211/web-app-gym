"use server";

// ─────────────────────────────────────────────────────────────────
// platform — support-dte-generate-json.action.ts
//
// F2-B1 — Paso 2: Generar el json_document (FE 01 / CCFE 03) de un
// DteOutgoingDocument PENDING_GENERATION y validarlo contra el schema
// oficial MH, en el mismo paso, directamente en la base cliente de un
// PlatformDatabaseProfile, desde Support Session.
//
// Flujo:
//  1. requireSuperAdmin() obligatorio.
//  2. Validar forma del input (Zod).
//  3. Cargar perfil + organización + tenant_id.
//  4. Hard block: PRODUCTION siempre bloqueado.
//  5. Hard block: solo LOCAL / TEST / SANDBOX.
//  6. Safety Gate (D0) con GENERATE_SUPPORT_DTE_JSON (riesgo MEDIUM).
//  7. Abrir Prisma dinámico temporal sobre la base del perfil.
//  8. generateSupportDteJsonRunner — recalcula y valida server-side.
//  9. Registrar PlatformDeploymentLog (control plane).
// 10. Retornar resultado sanitizado — nunca json_document completo.
//
// Reglas de seguridad:
// - No modifica commerce/dte/services/*.
// - No firma. No transmite a Hacienda.
// - Confirmación textual obligatoria: "GENERATE SUPPORT DTE JSON".
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }         from "@/lib/permissions/guards";
import { prisma }                    from "@/lib/db/prisma";
import { assertEncryptionAvailable } from "@/lib/security/encryption";
import {
  buildDatabaseUrlFromProfile,
  sanitizeDatabaseError,
}                                    from "../lib/database-profile-url";
import { withTemporaryPrismaClient } from "../lib/client-prisma";
import { evaluateDatabaseExecutionSafety } from "../lib/database-execution-safety";
import { generateSupportDteJsonRunner } from "../lib/support-session/dte/support-dte-generate-json-runner";
import { GENERATE_SUPPORT_DTE_JSON_CONFIRMATION_TEXT } from "../lib/support-session/dte/support-dte.constants";
import { generateSupportDteJsonSchema } from "../schemas/generate-support-dte-json.schema";
import type {
  GenerateSupportDteJsonInput,
  GenerateSupportDteJsonActionState,
  DatabaseExecutionSafetyInput,
  PlatformDatabaseProfileEnvironment,
}                                    from "../types/platform.types";

const ALLOWED_ENVIRONMENTS = new Set(["LOCAL", "TEST", "SANDBOX"]);

export async function generateSupportDteJsonAction(
  rawInput: GenerateSupportDteJsonInput,
): Promise<GenerateSupportDteJsonActionState> {
  await requireSuperAdmin();

  const parsed = generateSupportDteJsonSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message ?? "Entrada inválida.", field: firstIssue?.path?.[0] as string | undefined };
  }
  const input = parsed.data as GenerateSupportDteJsonInput;

  try {
    assertEncryptionAvailable();
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Clave de cifrado no disponible." };
  }

  const profile = await prisma.platformDatabaseProfile.findUnique({
    where:  { id: input.profileId },
    select: {
      id: true, label: true, environment: true,
      db_host: true, db_port: true, db_name: true, db_user: true,
      encrypted_password: true, ssl_mode: true, is_active: true,
      last_test_status: true,
      organization: { select: { id: true, tenant_id: true } },
    },
  });

  if (!profile) return { success: false, error: "Perfil de base de datos no encontrado." };
  if (!profile.is_active) return { success: false, error: "Este perfil de base de datos está inactivo." };

  const tenantId = profile.organization.tenant_id;
  if (!tenantId) {
    return {
      success: false,
      error:
        "Esta organización no tiene tenant_id operativo. Usa \"Detectar tenant\" desde " +
        "Perfiles de BD antes de generar JSON DTE de soporte.",
    };
  }

  if (profile.environment === "PRODUCTION") {
    return {
      success: false,
      blocked: true,
      safetyBlockers: ["Generación de JSON DTE de soporte bloqueada en PRODUCTION. Solo disponible en LOCAL, TEST o SANDBOX."],
      error: "Generación de JSON DTE bloqueada en PRODUCTION.",
    };
  }
  if (!ALLOWED_ENVIRONMENTS.has(profile.environment)) {
    return {
      success: false,
      blocked: true,
      safetyBlockers: [`Ambiente "${profile.environment}" no está habilitado para esta operación en F2-B1. Solo se permite LOCAL, TEST o SANDBOX.`],
      error: `Ambiente "${profile.environment}" no permitido para esta operación.`,
    };
  }

  const safetyInput: DatabaseExecutionSafetyInput = {
    actionType:                        "GENERATE_SUPPORT_DTE_JSON",
    profileEnvironment:                profile.environment as PlatformDatabaseProfileEnvironment,
    targetType:                        "CLIENT_RUNTIME",
    isDryRun:                          false,
    confirmationText:                  input.confirmationText ?? "",
    expectedConfirmationText:          GENERATE_SUPPORT_DTE_JSON_CONFIRMATION_TEXT,
    hasRecentSuccessfulConnectionTest: profile.last_test_status === "SUCCESS",
    hasRecentPreflight:                true,
    hasBackupConfirmation:             !!input.hasBackupConfirmation,
  };

  const safety = evaluateDatabaseExecutionSafety(safetyInput);
  if (!safety.allowed) {
    return {
      success: false, blocked: safety.blocked, safetyBlockers: safety.blockers,
      error: safety.blockers[0] ?? "Acción bloqueada por el safety gate.",
    };
  }

  const databaseUrl = buildDatabaseUrlFromProfile(profile);

  try {
    const runnerResult = await withTemporaryPrismaClient(
      databaseUrl,
      (client) => generateSupportDteJsonRunner(client, tenantId, input.dte_document_id),
    );

    if (!runnerResult.ok) {
      try {
        await prisma.platformDeploymentLog.create({
          data: {
            organization_id: profile.organization.id,
            action:          "GENERATE_SUPPORT_DTE_JSON",
            status:          "FAILED",
            notes:           `Generación/validación de JSON DTE falló — perfil: ${profile.label}: ${runnerResult.error}`,
            metadata: {
              profileId: profile.id, tenantId, dteId: input.dte_document_id,
              error: runnerResult.error,
              validationErrorsCount: runnerResult.validation_errors?.length ?? 0,
            },
          },
        });
      } catch {
        // ignore
      }
      return {
        success: false, error: runnerResult.error, field: runnerResult.field,
        validation_errors: runnerResult.validation_errors,
      };
    }

    try {
      await prisma.platformDeploymentLog.create({
        data: {
          organization_id: profile.organization.id,
          action:          "GENERATE_SUPPORT_DTE_JSON",
          status:          "SUCCESS",
          notes:           `JSON DTE generado y validado — perfil: ${profile.label} — dte_id: ${runnerResult.result.dte_document_id}`,
          metadata: {
            profileId:   profile.id,
            profileLabel: profile.label,
            tenantId,
            dteId:       runnerResult.result.dte_document_id,
            status:      runnerResult.result.dte_status,
            environment: profile.environment,
          },
        },
      });
    } catch {
      // log failure no bloquea la respuesta
    }

    return {
      success: true, profileLabel: profile.label,
      safetyMessages: safety.messages, safetyWarnings: safety.warnings,
      result: runnerResult.result,
    };
  } catch (err) {
    const errorMsg = sanitizeDatabaseError(err);
    try {
      await prisma.platformDeploymentLog.create({
        data: {
          organization_id: profile.organization.id,
          action:          "GENERATE_SUPPORT_DTE_JSON",
          status:          "FAILED",
          notes:           `Generación/validación de JSON DTE falló — perfil: ${profile.label}: ${errorMsg}`,
          metadata:        { profileId: profile.id, tenantId, dteId: input.dte_document_id, error: errorMsg },
        },
      });
    } catch {
      // ignore
    }
    return { success: false, error: errorMsg };
  }
}
