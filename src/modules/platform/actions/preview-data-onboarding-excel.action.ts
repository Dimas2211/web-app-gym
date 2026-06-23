"use server";

// ─────────────────────────────────────────────────────────────────
// platform — preview-data-onboarding-excel.action.ts
//
// E1B: Server action para recibir, validar y parsear un archivo
// Excel del Data Onboarding Center. Devuelve un preview con
// resumen y errores por fila.
//
// Reglas de seguridad E1B:
// - requireSuperAdmin() obligatorio.
// - No construye DATABASE_URL.
// - No carga encrypted_password.
// - No usa Prisma dinámico.
// - No escribe datos en ninguna base.
// - No persiste el archivo.
// - No ejecuta seeds ni migraciones.
// - Sanitiza mensajes de error antes de retornar.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma }            from "@/lib/db/prisma";
import { IMPORT_DATASETS }   from "../lib/data-onboarding/data-onboarding-definitions";
import { parseDataOnboardingWorkbook } from "../lib/data-onboarding/excel-preview-parser";
import type {
  DataOnboardingDatasetKey,
  DataOnboardingPreviewActionState,
} from "../types/platform.types";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// Patrones de datos sensibles a sanitizar en mensajes de error
const SENSITIVE_PATTERNS: [RegExp, string][] = [
  [/postgresql:\/\/[^\s]*/gi,  "***"],
  [/password[=:\s]+[^\s,}]*/gi, "***"],
  [/DATABASE_URL[=:\s]+[^\s]*/gi, "***"],
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

    // ── 5. Verificar perfil — solo metadatos, sin credenciales ─
    const profile = await prisma.platformDatabaseProfile.findUnique({
      where:  { id: profileId.trim() },
      select: { id: true, label: true },
    });
    if (!profile) {
      return { success: false, error: "Perfil de base de datos no encontrado." };
    }

    // ── 6. Leer buffer — sin escribir en disco ────────────────
    const arrayBuffer = await file.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);

    // ── 7. Parsear workbook en memoria — sin Prisma, sin writes ─
    const result = parseDataOnboardingWorkbook({
      datasetKey: datasetKey as DataOnboardingDatasetKey,
      fileBuffer: buffer,
    });

    return { success: true, result };

  } catch (err) {
    const raw  = err instanceof Error ? err.message : "Error inesperado al procesar el archivo.";
    const safe = sanitizeError(raw);
    return { success: false, error: safe };
  }
}
