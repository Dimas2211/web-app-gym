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
import { prisma }                   from "@/lib/db/prisma";
import { IMPORT_DATASETS }          from "../lib/data-onboarding/data-onboarding-definitions";
import { parseDataOnboardingWorkbook }
  from "../lib/data-onboarding/excel-preview-parser";
import { analyzeDataOnboardingPreviewAgainstDatabase }
  from "../lib/data-onboarding/db-aware-preview-analyzer";
import { DEFAULT_IMPORT_POLICY }    from "../lib/data-onboarding/import-policy";
import { buildDatabaseUrlFromProfile, sanitizeDatabaseError }
  from "../lib/database-profile-url";
import { withTemporaryPrismaClient } from "../lib/client-prisma";
import type {
  DataOnboardingDatasetKey,
  DataOnboardingPreviewActionState,
} from "../types/platform.types";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// Patrones de datos sensibles a sanitizar en mensajes de error
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

export async function previewDataOnboardingExcelAction(
  formData: FormData,
): Promise<DataOnboardingPreviewActionState> {
  try {
    // ── 1. Autenticación obligatoria ──────────────────────────
    await requireSuperAdmin();

    // ── 2. Extraer parámetros ─────────────────────────────────
    const profileId  = formData.get("profileId");
    const datasetKey = formData.get("datasetKey");
    const file       = formData.get("file");

    if (typeof profileId !== "string" || !profileId.trim()) {
      return { success: false, error: "profileId requerido." };
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
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        error: `El archivo excede el tamaño máximo de 5 MB (${(file.size / 1024 / 1024).toFixed(2)} MB recibidos).`,
      };
    }

    // ── 5. Verificar perfil — incluye credenciales para análisis DB ─
    const profile = await prisma.platformDatabaseProfile.findUnique({
      where:  { id: profileId.trim() },
      select: {
        id:                 true,
        label:              true,
        db_host:            true,
        db_port:            true,
        db_name:            true,
        db_user:            true,
        ssl_mode:           true,
        encrypted_password: true,
        organization: {
          select: { tenant_id: true },
        },
      },
    });
    if (!profile) {
      return { success: false, error: "Perfil de base de datos no encontrado." };
    }

    // ── 6. Leer buffer — sin escribir en disco ────────────────
    const arrayBuffer = await file.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);

    // ── 7. Parsear workbook en memoria ────────────────────────
    const result = parseDataOnboardingWorkbook({
      datasetKey: datasetKey as DataOnboardingDatasetKey,
      fileBuffer: buffer,
    });

    // ── 8. Análisis DB-aware (solo si hay estructura procesable) ─
    // Si el archivo tiene errores estructurales críticos (hoja faltante,
    // columnas ausentes), no tiene sentido consultar la base destino.
    // Aun con filas inválidas, sí consultamos — el analyzer maneja filas con error.

    const tenantId = profile.organization?.tenant_id;

    if (!tenantId) {
      // Sin tenant_id no podemos filtrar datos del cliente correctamente
      return {
        success:      true,
        result,
        dbAwareError: "No se puede ejecutar el análisis DB-aware: el perfil no tiene tenant_id asociado.",
      };
    }

    // Construir URL en memoria — contiene password descifrado, no loguear
    let databaseUrl: string;
    try {
      databaseUrl = buildDatabaseUrlFromProfile({
        db_host:            profile.db_host,
        db_port:            profile.db_port,
        db_name:            profile.db_name,
        db_user:            profile.db_user,
        encrypted_password: profile.encrypted_password,
        ssl_mode:           profile.ssl_mode,
      });
    } catch (urlErr) {
      return {
        success:      true,
        result,
        dbAwareError: `No se pudo construir la conexión a la base destino: ${sanitizeDatabaseError(urlErr)}.`,
      };
    }

    // Ejecutar análisis DB-aware con Prisma temporal (solo lecturas)
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
        });
      });
    } catch (dbErr) {
      // El análisis DB falló, pero devolvemos el resultado del archivo igualmente
      dbAwareError = sanitizeDatabaseError(dbErr);
    }

    return {
      success: true,
      result,
      ...(dbAwareResult ? { dbAwareResult } : {}),
      ...(dbAwareError  ? { dbAwareError  } : {}),
    };

  } catch (err) {
    const raw  = err instanceof Error ? err.message : "Error inesperado al procesar el archivo.";
    const safe = sanitizeError(raw);
    return { success: false, error: safe };
  }
}
