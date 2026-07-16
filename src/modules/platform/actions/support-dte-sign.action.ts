"use server";

// ─────────────────────────────────────────────────────────────────
// platform — support-dte-sign.action.ts
//
// F2-B2: Firmar un DteOutgoingDocument SCHEMA_VALIDATED directamente
// en la base cliente de un PlatformDatabaseProfile, desde Support
// Session, usando el firmador MH configurado por variables de entorno.
//
// Flujo:
//  1. requireSuperAdmin() obligatorio.
//  2. Validar forma del input (Zod).
//  3. Cargar perfil + organización + tenant_id.
//  4. Hard block: PRODUCTION siempre bloqueado.
//  5. Hard block: solo LOCAL / TEST / SANDBOX.
//  6. Safety Gate (D0) con SIGN_SUPPORT_DTE (riesgo HIGH).
//  7. Abrir Prisma dinámico temporal sobre la base del perfil.
//  8. DRY_RUN  → previewSignSupportDte (solo lectura, no llama al firmador).
//     EXECUTE → signSupportDteRunner (llama al firmador y persiste).
//  9. Registrar PlatformDeploymentLog (control plane) solo en EXECUTE.
// 10. Retornar resultado sanitizado — nunca signed_jws completo, ni secrets.
//
// Reglas de seguridad:
// - No modifica commerce/dte/services/*.
// - No cambia DATABASE_URL global ni variables del firmador.
// - No transmite a Hacienda.
// - No escribe Sale, SaleItem, ProductLocation, InventoryMovement.
// - Confirmación textual obligatoria en EXECUTE: "SIGN SUPPORT DTE".
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
import {
  previewSignSupportDte,
  signSupportDteRunner,
}                                    from "../lib/support-session/dte/support-dte-sign-runner";
import { SIGN_SUPPORT_DTE_CONFIRMATION_TEXT } from "../lib/support-session/dte/support-dte.constants";
import { signSupportDteSchema } from "../schemas/sign-support-dte.schema";
import type {
  SignSupportDteInput,
  SignSupportDteActionState,
  DatabaseExecutionSafetyInput,
  PlatformDatabaseProfileEnvironment,
}                                    from "../types/platform.types";

const ALLOWED_ENVIRONMENTS = new Set(["LOCAL", "TEST", "SANDBOX"]);

export async function signSupportDteAction(
  rawInput: SignSupportDteInput,
): Promise<SignSupportDteActionState> {
  await requireSuperAdmin();

  const parsed = signSupportDteSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message ?? "Entrada inválida.", field: firstIssue?.path?.[0] as string | undefined };
  }
  const input = parsed.data as SignSupportDteInput;

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
        "Perfiles de BD antes de firmar un DTE de soporte.",
    };
  }

  if (profile.environment === "PRODUCTION") {
    return {
      success: false,
      blocked: true,
      safetyBlockers: ["Firma de DTE de soporte bloqueada en PRODUCTION. Solo disponible en LOCAL, TEST o SANDBOX."],
      error: "Firma de DTE bloqueada en PRODUCTION.",
    };
  }
  if (!ALLOWED_ENVIRONMENTS.has(profile.environment)) {
    return {
      success: false,
      blocked: true,
      safetyBlockers: [`Ambiente "${profile.environment}" no está habilitado para firmar DTE de soporte en F2-B2. Solo se permite LOCAL, TEST o SANDBOX.`],
      error: `Ambiente "${profile.environment}" no permitido para esta operación.`,
    };
  }

  const safetyInput: DatabaseExecutionSafetyInput = {
    actionType:                        "SIGN_SUPPORT_DTE",
    profileEnvironment:                profile.environment as PlatformDatabaseProfileEnvironment,
    targetType:                        "CLIENT_RUNTIME",
    isDryRun:                          input.mode === "DRY_RUN",
    confirmationText:                  input.mode === "EXECUTE" ? (input.confirmationText ?? "") : undefined,
    expectedConfirmationText:          input.mode === "EXECUTE" ? SIGN_SUPPORT_DTE_CONFIRMATION_TEXT : undefined,
    hasRecentSuccessfulConnectionTest: profile.last_test_status === "SUCCESS",
    hasRecentPreflight:                true,
    hasBackupConfirmation:             input.mode === "EXECUTE" ? !!input.hasBackupConfirmation : true,
    hasRecentSuccessfulDryRun:         input.mode === "EXECUTE" ? !!input.hasDryRunConfirmation : undefined,
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
    if (input.mode === "DRY_RUN") {
      const previewResult = await withTemporaryPrismaClient(
        databaseUrl,
        (client) => previewSignSupportDte(client, tenantId, input),
      );
      if (!previewResult.ok) {
        return { success: false, error: previewResult.error, field: previewResult.field };
      }
      return {
        success: true, mode: "DRY_RUN", profileLabel: profile.label,
        safetyMessages: safety.messages, safetyWarnings: safety.warnings,
        preview: previewResult.preview,
      };
    }

    const runnerResult = await withTemporaryPrismaClient(
      databaseUrl,
      (client) => signSupportDteRunner(client, tenantId, input),
    );

    if (!runnerResult.ok) {
      try {
        await prisma.platformDeploymentLog.create({
          data: {
            organization_id: profile.organization.id,
            action:          "SIGN_SUPPORT_DTE",
            status:          "FAILED",
            notes:           `Firma DTE falló — perfil: ${profile.label} — dte_id: ${input.dte_document_id}: ${runnerResult.error}`,
            metadata: {
              profileId: profile.id, tenantId, dteId: input.dte_document_id,
              error: runnerResult.error,
            },
          },
        });
      } catch {
        // log failure no bloquea la respuesta
      }
      return { success: false, error: runnerResult.error, field: runnerResult.field };
    }

    try {
      await prisma.platformDeploymentLog.create({
        data: {
          organization_id: profile.organization.id,
          action:          "SIGN_SUPPORT_DTE",
          status:          "SUCCESS",
          notes:           `DTE firmado — perfil: ${profile.label} — control_number: ${runnerResult.result.control_number}`,
          metadata: {
            profileId:      profile.id,
            profileLabel:   profile.label,
            tenantId,
            dteId:          runnerResult.result.dte_document_id,
            dteType:        runnerResult.result.dte_type_code,
            controlNumber:  runnerResult.result.control_number,
            generationCode: runnerResult.result.generation_code,
            previousStatus: "SCHEMA_VALIDATED",
            newStatus:      runnerResult.result.dte_status,
            environment:    profile.environment,
          },
        },
      });
    } catch {
      // log failure no bloquea la respuesta
    }

    return {
      success: true, mode: "EXECUTE", profileLabel: profile.label,
      safetyMessages: safety.messages, safetyWarnings: safety.warnings,
      result: runnerResult.result,
    };
  } catch (err) {
    const errorMsg = sanitizeDatabaseError(err);

    if (input.mode === "EXECUTE") {
      try {
        await prisma.platformDeploymentLog.create({
          data: {
            organization_id: profile.organization.id,
            action:          "SIGN_SUPPORT_DTE",
            status:          "FAILED",
            notes:           `Firma DTE falló — perfil: ${profile.label}: ${errorMsg}`,
            metadata:        { profileId: profile.id, tenantId, dteId: input.dte_document_id, error: errorMsg },
          },
        });
      } catch {
        // ignore
      }
    }

    return { success: false, error: errorMsg };
  }
}
