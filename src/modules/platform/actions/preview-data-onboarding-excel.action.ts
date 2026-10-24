"use server";

// ─────────────────────────────────────────────────────────────────
// platform — preview-data-onboarding-excel.action.ts
//
// E1B.1: Server action para recibir, validar, parsear y analizar
// un archivo Excel del Data Onboarding Center contra la base destino.
//
// Flujo:
//  1. Autenticación obligatoria (requireSuperAdmin).
//  2. Validación de parámetros y archivo.
//  3. Parsear Excel en memoria (solo lectura de archivo).
//  4. Si la estructura es procesable, conectar a base cliente
//     vía Prisma dinámico temporal y ejecutar análisis DB-aware
//     (solo lecturas — sin create, update, delete, upsert).
//  5. Desconectar Prisma temporal.
//  6. Retornar preview combinado (archivo + DB-aware).
//
// ONBOARDING-5K: el parseo y el análisis DB-aware cubren TODAS las filas
// del archivo (hasta DATA_ONBOARDING_MAX_IMPORT_ROWS; más → rechazo
// explícito). Al navegador viajan los conteos completos y solo una
// muestra acotada de filas (data-onboarding-view.ts).
//
// SHARED-OPS-PARITY-1: el destino se resuelve SERVER-SIDE por
// organizationId (Shared o Dedicated) — organizationId →
// PlatformOrganization.tenant_id → Runtime Router. profileId solo se
// acepta como fijación de un perfil Dedicated (links históricos) y debe
// pertenecer a la misma organización. Nunca tenantId del navegador.
//
// Reglas de seguridad E1B.1:
//  - requireSuperAdmin() obligatorio.
//  - Solo lecturas contra base cliente.
//  - Sin create, update, delete, upsert ni raw SQL destructivo.
//  - Sin seeds ni migraciones.
//  - No persistir archivo.
//  - No exponer DATABASE_URL ni encrypted_password.
//  - Sanitizar mensajes de error antes de retornar.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }       from "@/lib/permissions/guards";
import { IMPORT_DATASETS }          from "../lib/data-onboarding/data-onboarding-definitions";
import { parseDataOnboardingWorkbook }
  from "../lib/data-onboarding/excel-preview-parser";
import { analyzeDataOnboardingPreviewAgainstDatabase }
  from "../lib/data-onboarding/db-aware-preview-analyzer";
import { DEFAULT_IMPORT_POLICY }    from "../lib/data-onboarding/import-policy";
import { sanitizeDataOnboardingError }
  from "../lib/data-onboarding/run-data-onboarding-import";
import { sanitizeDatabaseError }    from "../lib/database-profile-url";
import { withTemporaryPrismaClient } from "../lib/client-prisma";
import {
  DATA_ONBOARDING_MAX_FILE_BYTES,
  dataOnboardingFileTooLargeMessage,
} from "../lib/data-onboarding/data-onboarding-limits";
import {
  toPreviewResultView,
  toDbAwareResultView,
} from "../lib/data-onboarding/data-onboarding-view";
import {
  resolveOrganizationRuntime,
  isOrganizationRuntimeResolutionError,
} from "../runtime/resolve-organization-runtime";
import { getRuntimeDatabaseUrlFromProfile } from "../runtime/runtime-database-router";
import { CommercialEnforcementError } from "../runtime/commercial-enforcement";
import { isGymDataOnboardingDataset } from "../lib/data-onboarding/data-onboarding-definitions";
import {
  resolveDataOnboardingGymAccess,
  evaluateGymDataOnboardingAccess,
} from "../lib/data-onboarding/gym-data-onboarding-access";
import type {
  DataOnboardingDatasetKey,
  DataOnboardingPreviewActionState,
  DataOnboardingGymAccess,
} from "../types/platform.types";

function formString(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function previewDataOnboardingExcelAction(
  formData: FormData,
): Promise<DataOnboardingPreviewActionState> {
  try {
    // ── 1. Autenticación obligatoria ──────────────────────────
    await requireSuperAdmin();

    // ── 2. Extraer parámetros ─────────────────────────────────
    const organizationId = formString(formData, "organizationId");
    const profileId      = formString(formData, "profileId");
    const datasetKey     = formData.get("datasetKey");
    const file           = formData.get("file");

    if (!organizationId && !profileId) {
      return { success: false, error: "organizationId requerido." };
    }
    if (typeof datasetKey !== "string" || !datasetKey.trim()) {
      return { success: false, error: "datasetKey requerido." };
    }
    if (!(file instanceof File)) {
      return { success: false, error: "No se recibió ningún archivo." };
    }

    // ── 3. Validar que el dataset soporta importación ─────────
    const importable = IMPORT_DATASETS.find((d) => d.key === datasetKey);
    if (!importable) {
      return { success: false, error: `El dataset '${datasetKey}' no soporta importación.` };
    }

    // ── 4. Validar archivo ────────────────────────────────────
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return { success: false, error: "Solo se permiten archivos .xlsx" };
    }
    if (file.size === 0) {
      return { success: false, error: "El archivo está vacío." };
    }
    if (file.size > DATA_ONBOARDING_MAX_FILE_BYTES) {
      return { success: false, error: dataOnboardingFileTooLargeMessage(file.size) };
    }

    // ── 5. Leer buffer y parsear en memoria ───────────────────
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = parseDataOnboardingWorkbook({
      datasetKey: datasetKey as DataOnboardingDatasetKey,
      fileBuffer: buffer,
    });

    // ── 6. Resolver destino runtime server-side ───────────────
    // Sin tenant/runtime resoluble devolvemos igualmente el análisis
    // del archivo, con el motivo en dbAwareError.
    let databaseUrl: string;
    let tenantId: string;
    try {
      const resolved = await resolveOrganizationRuntime({ organizationId, profileId });
      tenantId    = resolved.header.tenantId;
      databaseUrl = getRuntimeDatabaseUrlFromProfile(resolved.profile);
    } catch (err) {
      if (isOrganizationRuntimeResolutionError(err)) {
        const message = `No se pudo resolver la base destino de la organización: ${sanitizeDataOnboardingError(err.message)}`;
        // GYM-ONBOARDING: sin organización resuelta no se puede verificar
        // la vertical GYM — no se devuelve ni el análisis del archivo.
        if (isGymDataOnboardingDataset(datasetKey)) return { success: false, error: message };
        return {
          success:      true,
          result:       toPreviewResultView(result),
          dbAwareError: message,
        };
      }
      throw err;
    }

    // ── 6b. GYM-ONBOARDING: vertical GYM efectiva de la organización destino ─
    let gymAccess: DataOnboardingGymAccess | undefined;
    if (isGymDataOnboardingDataset(datasetKey)) {
      try {
        gymAccess = await resolveDataOnboardingGymAccess(tenantId);
      } catch (err) {
        if (err instanceof CommercialEnforcementError) return { success: false, error: err.userMessage };
        throw err;
      }
      const access = evaluateGymDataOnboardingAccess(gymAccess, datasetKey);
      if (!access.allowed) return { success: false, error: access.reason };
    }

    // ── 7. Análisis DB-aware (solo lecturas, WHERE tenant_id) ─
    let dbAwareResult;
    let dbAwareError: string | undefined;

    try {
      dbAwareResult = await withTemporaryPrismaClient(databaseUrl, async (client) => {
        return analyzeDataOnboardingPreviewAgainstDatabase({
          datasetKey:    datasetKey as DataOnboardingDatasetKey,
          parsedPreview: result,
          importPolicy:  DEFAULT_IMPORT_POLICY,
          prismaClient:  client,
          tenantId,
          ...(gymAccess ? { gymOptions: { classesModuleEnabled: gymAccess.classesModuleEnabled } } : {}),
        });
      });
    } catch (dbErr) {
      // El análisis DB falló, pero devolvemos el resultado del archivo igualmente
      dbAwareError = sanitizeDatabaseError(dbErr);
    }

    return {
      success: true,
      result:  toPreviewResultView(result),
      ...(dbAwareResult ? { dbAwareResult: toDbAwareResultView(dbAwareResult) } : {}),
      ...(dbAwareError  ? { dbAwareError  } : {}),
    };

  } catch (err) {
    const raw = err instanceof Error ? err.message : "Error inesperado al procesar el archivo.";
    return { success: false, error: sanitizeDataOnboardingError(raw) };
  }
}
