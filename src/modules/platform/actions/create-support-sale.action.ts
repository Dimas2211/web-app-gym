"use server";

// ─────────────────────────────────────────────────────────────────
// platform — create-support-sale.action.ts
//
// F1-B1: Crear una venta de prueba directamente en la base cliente
// de un PlatformDatabaseProfile, desde Support Session.
//
// Flujo:
//  1. requireSuperAdmin() obligatorio.
//  2. Validar forma del input (Zod).
//  3. Cargar perfil + organización + tenant_id.
//  4. Hard block: PRODUCTION siempre bloqueado.
//  5. Hard block: solo LOCAL / TEST / SANDBOX (STAGING bloqueado por ahora).
//  6. Safety Gate (D0) con CREATE_SUPPORT_SALE (riesgo HIGH).
//  7. Abrir Prisma dinámico temporal sobre la base del perfil.
//  8. DRY_RUN  → previewSupportSale (solo lectura).
//     EXECUTE → createSupportSaleRunner (transacción atómica).
//  9. Registrar PlatformDeploymentLog (control plane) solo en EXECUTE.
// 10. Retornar resultado sanitizado — nunca credenciales.
//
// Reglas de seguridad:
// - No modifica commerce/sales/services/sale.service.ts.
// - No cambia DATABASE_URL global — la app normal sigue en el .env.
// - No genera DTE. No crea DteOutgoingDocument.
// - No abre/cierra caja. No crea CashMovement.
// - Confirmación textual obligatoria en EXECUTE: "CREATE SUPPORT SALE".
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
  previewSupportSale,
  createSupportSaleRunner,
}                                    from "../lib/support-session/create-support-sale-runner";
import { CREATE_SUPPORT_SALE_CONFIRMATION_TEXT } from "../lib/support-session/create-support-sale.constants";
import { createSupportSaleSchema }   from "../schemas/create-support-sale.schema";
import type {
  CreateSupportSaleInput,
  CreateSupportSaleActionState,
  DatabaseExecutionSafetyInput,
  PlatformDatabaseProfileEnvironment,
}                                    from "../types/platform.types";

// Ambientes permitidos para F1-B1. STAGING queda bloqueado hasta que
// exista un patrón explícito de habilitación (backup + segunda aprobación).
const ALLOWED_ENVIRONMENTS = new Set(["LOCAL", "TEST", "SANDBOX"]);

export async function createSupportSaleAction(
  rawInput: CreateSupportSaleInput,
): Promise<CreateSupportSaleActionState> {
  await requireSuperAdmin();

  // ── 1. Validar forma del input ────────────────────────────────
  const parsed = createSupportSaleSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message ?? "Entrada inválida.", field: firstIssue?.path?.[0] as string | undefined };
  }
  const input = parsed.data as CreateSupportSaleInput;

  // ── 2. Verificar cifrado disponible ───────────────────────────
  try {
    assertEncryptionAvailable();
  } catch (err) {
    return {
      success: false,
      error:   err instanceof Error ? err.message : "Clave de cifrado no disponible.",
    };
  }

  // ── 3. Cargar perfil con credenciales ─────────────────────────
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
      is_active:          true,
      last_test_status:   true,
      organization: {
        select: { id: true, tenant_id: true },
      },
    },
  });

  if (!profile) {
    return { success: false, error: "Perfil de base de datos no encontrado." };
  }
  if (!profile.is_active) {
    return { success: false, error: "Este perfil de base de datos está inactivo." };
  }

  const tenantId = profile.organization.tenant_id;
  if (!tenantId) {
    return {
      success: false,
      error:
        "Esta organización no tiene tenant_id operativo. Usa \"Detectar tenant\" desde " +
        "Perfiles de BD antes de crear una venta de prueba.",
    };
  }

  // ── 4. Hard block: PRODUCTION siempre bloqueado ───────────────
  if (profile.environment === "PRODUCTION") {
    return {
      success: false,
      blocked: true,
      safetyBlockers: [
        "Creación de ventas de prueba bloqueada en PRODUCTION. " +
        "Esta operación solo está disponible en LOCAL, TEST o SANDBOX.",
      ],
      error: "Venta de prueba bloqueada en PRODUCTION.",
    };
  }

  // ── 5. Hard block: solo ambientes permitidos en F1-B1 ─────────
  if (!ALLOWED_ENVIRONMENTS.has(profile.environment)) {
    return {
      success: false,
      blocked: true,
      safetyBlockers: [
        `Ambiente "${profile.environment}" no está habilitado para ventas de prueba en F1-B1. ` +
        "Solo se permite LOCAL, TEST o SANDBOX.",
      ],
      error: `Ambiente "${profile.environment}" no permitido para esta operación.`,
    };
  }

  // ── 6. Safety Gate (D0) ────────────────────────────────────────
  const safetyInput: DatabaseExecutionSafetyInput = {
    actionType:                        "CREATE_SUPPORT_SALE",
    profileEnvironment:                profile.environment as PlatformDatabaseProfileEnvironment,
    targetType:                        "CLIENT_RUNTIME",
    isDryRun:                          input.mode === "DRY_RUN",
    confirmationText:                  input.mode === "EXECUTE" ? (input.confirmationText ?? "") : undefined,
    expectedConfirmationText:          input.mode === "EXECUTE" ? CREATE_SUPPORT_SALE_CONFIRMATION_TEXT : undefined,
    hasRecentSuccessfulConnectionTest: profile.last_test_status === "SUCCESS",
    hasRecentPreflight:                true,
    // El gate exige backup confirmado para riesgo HIGH sin distinguir dry-run.
    // DRY_RUN no escribe nada (previewSupportSale es solo lectura), así que el
    // requisito de backup no aplica ahí — solo se exige el valor real en EXECUTE.
    hasBackupConfirmation:             input.mode === "EXECUTE" ? !!input.hasBackupConfirmation : true,
    // El gate exige un dry-run previo para riesgo HIGH. En EXECUTE, el cliente
    // debe reportar que ya completó un preview (DRY_RUN) exitoso y vigente
    // (invalidado localmente ante cualquier cambio de línea/sucursal/cliente).
    hasRecentSuccessfulDryRun:         input.mode === "EXECUTE" ? !!input.hasDryRunConfirmation : undefined,
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

  // ── 7. Construir URL en memoria (nunca loguear) ───────────────
  const databaseUrl = buildDatabaseUrlFromProfile(profile);

  try {
    // ── 8a. Modo DRY_RUN — solo lectura ─────────────────────────
    if (input.mode === "DRY_RUN") {
      const previewResult = await withTemporaryPrismaClient(
        databaseUrl,
        (client) => previewSupportSale(client, tenantId, input),
      );

      if (!previewResult.ok) {
        return { success: false, error: previewResult.error, field: previewResult.field };
      }

      return {
        success:        true,
        mode:           "DRY_RUN",
        profileLabel:   profile.label,
        safetyMessages: safety.messages,
        safetyWarnings: safety.warnings,
        preview:        previewResult.preview,
      };
    }

    // ── 8b. Modo EXECUTE — transacción atómica ──────────────────
    const runnerResult = await withTemporaryPrismaClient(
      databaseUrl,
      (client) => createSupportSaleRunner(client, tenantId, input),
    );

    if (!runnerResult.ok) {
      return { success: false, error: runnerResult.error, field: runnerResult.field };
    }

    // ── 9. Registrar log en control plane ───────────────────────
    try {
      await prisma.platformDeploymentLog.create({
        data: {
          organization_id: profile.organization.id,
          action:          "CREATE_SUPPORT_SALE",
          status:          "SUCCESS",
          notes:           `Venta de prueba creada — perfil: ${profile.label} — sale_code: ${runnerResult.result.saleCode}`,
          metadata: {
            profileId:      profile.id,
            profileLabel:   profile.label,
            tenantId,
            saleId:         runnerResult.result.saleId,
            saleCode:       runnerResult.result.saleCode,
            total:          runnerResult.result.total,
            itemsCount:     runnerResult.result.itemsCount,
            inventoryMoved: runnerResult.result.inventoryMoved,
          },
        },
      });
    } catch {
      // log failure no bloquea la respuesta
    }

    return {
      success:        true,
      mode:           "EXECUTE",
      profileLabel:   profile.label,
      safetyMessages: safety.messages,
      safetyWarnings: safety.warnings,
      result:         runnerResult.result,
    };
  } catch (err) {
    const errorMsg = sanitizeDatabaseError(err);

    if (input.mode === "EXECUTE") {
      try {
        await prisma.platformDeploymentLog.create({
          data: {
            organization_id: profile.organization.id,
            action:          "CREATE_SUPPORT_SALE",
            status:          "FAILED",
            notes:           `Venta de prueba falló — perfil: ${profile.label}: ${errorMsg}`,
            metadata:        { profileId: profile.id, tenantId, error: errorMsg },
          },
        });
      } catch {
        // ignore
      }
    }

    return { success: false, error: errorMsg };
  }
}
