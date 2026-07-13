"use server";

// ─────────────────────────────────────────────────────────────────
// platform — import-data-onboarding-inventory.action.ts
//
// E1C-E1: Server action para importar inventario inicial desde un
// archivo Excel hacia la base de datos cliente seleccionada
// (PlatformDatabaseProfile).
//
// Flujo:
//  1. requireSuperAdmin() obligatorio.
//  2. Validar parámetros: datasetKey === "inventory_initial", policy === "CREATE_ONLY".
//  3. Hard block: PRODUCTION bloqueado siempre en E1C-E1.
//  4. Verificar perfil y tenant_id.
//  5. Safety gate (D0) con RUN_IMPORT.
//  6. Re-parsear el archivo server-side (nunca confiar en estado del cliente).
//  7. Re-ejecutar análisis DB-aware server-side (product_code + location_name
//     como llave natural, dependencias de producto y sucursal (Branch)).
//  8. Bloquear si hay cualquier fila con error en el análisis.
//  9. Bloquear si hay filas que no son CREATE (duplicados o UPDATE/SKIP).
// 10. Ejecutar runner (DRY_RUN o EXECUTE) — ProductLocation + InventoryMovement
//     en una sola transacción por fila.
// 11. Registrar resultado en PlatformDeploymentLog (control plane).
// 12. Retornar resumen seguro sin exponer credenciales.
//
// Reglas de seguridad E1C-E1:
//  - requireSuperAdmin() obligatorio.
//  - Solo escribe en product_locations e inventory_movements.
//  - No actualiza, no elimina, no hace upsert.
//  - No toca products, categorías, unidades, proveedores, sucursales,
//    ventas, compras, DTE ni caja.
//  - Confirmación textual obligatoria en EXECUTE: "IMPORT INITIAL INVENTORY".
//  - PRODUCTION bloqueado explícitamente.
//  - No persistir archivo.
//  - No exponer DATABASE_URL ni encrypted_password.
//  - Sanitizar mensajes de error.
//  - performed_by/created_by/updated_by se dejan en null: el usuario
//    autenticado pertenece a la base de control (platform), no a la base
//    destino del perfil, y no existe garantía de que su id corresponda a
//    un User real en esa base (mismo criterio ya usado en products-import-runner).
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }       from "@/lib/permissions/guards";
import { prisma }                   from "@/lib/db/prisma";
import { assertEncryptionAvailable } from "@/lib/security/encryption";
import {
  buildDatabaseUrlFromProfile,
  sanitizeDatabaseError,
}                                   from "../lib/database-profile-url";
import { withTemporaryPrismaClient } from "../lib/client-prisma";
import { evaluateDatabaseExecutionSafety } from "../lib/database-execution-safety";
import { parseDataOnboardingWorkbook }
  from "../lib/data-onboarding/excel-preview-parser";
import { analyzeDataOnboardingPreviewAgainstDatabase }
  from "../lib/data-onboarding/db-aware-preview-analyzer";
import { runInventoryImport }
  from "../lib/data-onboarding/import-runners/inventory-import-runner";
import { IMPORT_INVENTORY_CONFIRMATION_TEXT }
  from "../lib/data-onboarding/import-runners/inventory-import.constants";
import type {
  InventoryImportActionState,
  DatabaseExecutionSafetyInput,
  PlatformDatabaseProfileEnvironment,
} from "../types/platform.types";

// Límite de archivo
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// Patrones sensibles a sanitizar
const SENSITIVE_PATTERNS: [RegExp, string][] = [
  [/postgresql:\/\/[^\s]*/gi,           "***"],
  [/password[=:\s]+[^\s,}]*/gi,         "***"],
  [/DATABASE_URL[=:\s]+[^\s]*/gi,       "***"],
  [/encrypted_password[=:\s]+[^\s]*/gi, "***"],
];

function sanitizeError(msg: string): string {
  return SENSITIVE_PATTERNS.reduce(
    (s, [pattern, replacement]) => s.replace(pattern, replacement),
    msg,
  );
}

export async function importDataOnboardingInventoryAction(
  formData: FormData,
): Promise<InventoryImportActionState> {
  try {
    // ── 1. Autenticación ──────────────────────────────────────────
    await requireSuperAdmin();

    // ── 2. Extraer y validar parámetros ──────────────────────────
    const profileId        = formData.get("profileId");
    const mode              = formData.get("mode");
    const datasetKey        = formData.get("datasetKey");
    const importPolicy      = formData.get("importPolicy");
    const confirmationText  = formData.get("confirmationText");
    const file              = formData.get("file");

    if (typeof profileId !== "string" || !profileId.trim()) {
      return { success: false, error: "profileId requerido." };
    }
    if (mode !== "DRY_RUN" && mode !== "EXECUTE") {
      return { success: false, error: "mode debe ser DRY_RUN o EXECUTE." };
    }
    if (datasetKey !== "inventory_initial") {
      return {
        success: false,
        error: `E1C-E1 solo permite importar dataset 'inventory_initial' desde esta action. Recibido: '${datasetKey}'.`,
      };
    }
    if (importPolicy !== "CREATE_ONLY") {
      return {
        success: false,
        error: `E1C-E1 solo permite política CREATE_ONLY. Recibida: '${importPolicy}'.`,
      };
    }
    if (!(file instanceof File)) {
      return { success: false, error: "No se recibió ningún archivo." };
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return { success: false, error: "Solo se permiten archivos .xlsx" };
    }
    if (file.size === 0) {
      return { success: false, error: "El archivo está vacío." };
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        error: `El archivo excede el tamaño máximo de 5 MB (${(file.size / 1024 / 1024).toFixed(2)} MB recibidos).`,
      };
    }

    // ── 3. Verificar cifrado disponible ───────────────────────────
    try {
      assertEncryptionAvailable();
    } catch (err) {
      return {
        success: false,
        error:   err instanceof Error ? err.message : "Clave de cifrado no disponible.",
      };
    }

    // ── 4. Cargar perfil con credenciales ────────────────────────
    const profile = await prisma.platformDatabaseProfile.findUnique({
      where:  { id: profileId.trim() },
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

    // ── 5. Verificar tenant_id ────────────────────────────────────
    const tenantId = profile.organization.tenant_id;
    if (!tenantId) {
      return {
        success: false,
        error:
          "Esta organización no tiene tenant_id operativo. Ve a Perfiles de BD → " +
          "Detectar tenant para asociarlo. Si la base es nueva y no aparecen tenants, " +
          "primero debe ejecutarse provisioning/seed para crear el registro en gyms.",
      };
    }

    // ── 6. Hard block: PRODUCTION ─────────────────────────────────
    if (profile.environment === "PRODUCTION") {
      return {
        success:        false,
        blocked:        true,
        safetyBlockers: [
          "Importación bloqueada en PRODUCTION (E1C-E1). " +
          "La habilitación en producción estará disponible en fases posteriores " +
          "con controles adicionales de backup y aprobación.",
        ],
        error: "Importación de inventario inicial bloqueada en PRODUCTION.",
      };
    }

    // ── 7. Safety Gate (D0) ───────────────────────────────────────
    const safetyInput: DatabaseExecutionSafetyInput = {
      actionType:                        "RUN_IMPORT",
      profileEnvironment:                profile.environment as PlatformDatabaseProfileEnvironment,
      targetType:                        "CLIENT_RUNTIME",
      isDryRun:                          mode === "DRY_RUN",
      confirmationText:                  mode === "EXECUTE"
                                           ? (typeof confirmationText === "string" ? confirmationText : "")
                                           : undefined,
      expectedConfirmationText:          mode === "EXECUTE"
                                           ? IMPORT_INVENTORY_CONFIRMATION_TEXT
                                           : undefined,
      hasRecentSuccessfulConnectionTest: profile.last_test_status === "SUCCESS",
      // La preview DB-aware ya verificó conectividad exitosa contra la base destino.
      hasRecentPreflight:                true,
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

    // ── 8. Construir URL en memoria (nunca loguear) ───────────────
    const databaseUrl = buildDatabaseUrlFromProfile(profile);

    // ── 9. Re-parsear y re-analizar server-side ───────────────────
    const arrayBuffer = await file.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);

    const parsedPreview = parseDataOnboardingWorkbook({
      datasetKey: "inventory_initial",
      fileBuffer: buffer,
    });

    if (parsedPreview.status === "INVALID") {
      return {
        success: false,
        error:   "El archivo Excel tiene errores estructurales. Verifique el formato antes de importar.",
      };
    }

    // ── 10. Análisis DB-aware server-side ─────────────────────────
    let dbAwareResult;
    try {
      dbAwareResult = await withTemporaryPrismaClient(databaseUrl, async (client) => {
        return analyzeDataOnboardingPreviewAgainstDatabase({
          datasetKey:    "inventory_initial",
          parsedPreview,
          importPolicy:  "CREATE_ONLY",
          prismaClient:  client,
          tenantId,
        });
      });
    } catch (dbErr) {
      return {
        success: false,
        error:   `Error al analizar la base destino: ${sanitizeDatabaseError(dbErr)}`,
      };
    }

    // ── 11. Verificar que el análisis no tiene errores ────────────
    const errorRows = dbAwareResult.rows.filter((r) => r.resolution === "ERROR");
    if (errorRows.length > 0) {
      return {
        success: false,
        error:
          `El análisis server-side detectó ${errorRows.length} fila(s) con error ` +
          "(producto o sucursal inexistente/ambigua, producto no elegible, inventario " +
          "inicial ya existente u otros datos inválidos). Corrija el archivo y vuelva a intentar.",
      };
    }

    // Solo filas CREATE son aceptables en E1C-E1 CREATE_ONLY
    const nonCreateRows = dbAwareResult.rows.filter(
      (r) => r.resolution !== "CREATE",
    );
    if (nonCreateRows.length > 0) {
      return {
        success: false,
        error:
          `${nonCreateRows.length} fila(s) no pueden crearse ` +
          "(política CREATE_ONLY: solo se permiten registros nuevos). " +
          "El archivo contiene inventario inicial que ya existe en la base destino.",
      };
    }

    // ── 12. Ejecutar runner ───────────────────────────────────────
    const runnerResult = await withTemporaryPrismaClient(
      databaseUrl,
      async (client) => {
        return runInventoryImport({
          parsedPreview,
          dbAwareResult,
          prismaClient: client,
          tenantId,
          isDryRun:     mode === "DRY_RUN",
          performedBy:  null,
        });
      },
    );

    // ── 13. Registrar log en control plane (solo EXECUTE exitoso) ─
    if (mode === "EXECUTE" && "created" in runnerResult) {
      const imp = runnerResult;
      try {
        await prisma.platformDeploymentLog.create({
          data: {
            organization_id: profile.organization.id,
            action:          "RUN_IMPORT",
            status:          "SUCCESS",
            notes:           `Import inventario inicial E1C-E1 — perfil: ${profile.label} — created: ${imp.created}`,
            metadata: {
              profileId:               profile.id,
              profileLabel:            profile.label,
              mode:                    "EXECUTE",
              tenantId,
              datasetKey:              "inventory_initial",
              importPolicy:            "CREATE_ONLY",
              productLocationsCreated: imp.productLocationsCreated,
              movementsCreated:        imp.movementsCreated,
              errors:                  imp.errors,
              totalRows:               imp.totalRows,
            },
          },
        });
      } catch {
        // log failure no bloquea la respuesta
      }
    }

    // ── 14. Retornar resultado según modo ─────────────────────────
    if (mode === "DRY_RUN") {
      const dry = runnerResult as import("../types/platform.types").InventoryImportDryRunResult;
      return {
        success:        true,
        mode:           "DRY_RUN",
        profileLabel:   profile.label,
        safetyMessages: safety.messages,
        safetyWarnings: safety.warnings,
        dryRunResult:   dry,
      };
    }

    const imp = runnerResult as import("../types/platform.types").InventoryImportResult;
    return {
      success:        true,
      mode:           "EXECUTE",
      profileLabel:   profile.label,
      safetyMessages: safety.messages,
      safetyWarnings: safety.warnings,
      importResult:   imp,
    };

  } catch (err) {
    const raw  = err instanceof Error ? err.message : "Error inesperado al importar inventario inicial.";
    const safe = sanitizeError(raw);
    return { success: false, error: safe };
  }
}
