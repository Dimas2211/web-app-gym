"use server";

// ─────────────────────────────────────────────────────────────────
// platform — import-data-onboarding-categories.action.ts
//
// E1C-A: importa categorías desde Excel hacia la base runtime de UNA
// organización (Shared o Dedicated). Solo escribe en product_categories.
//
// SHARED-OPS-PARITY-1: el flujo completo (super_admin, resolución
// organizationId → tenant_id → runtime server-side, Commercial
// Enforcement, re-parseo, análisis DB-aware tenant-scoped, política de
// PRODUCTION, runner transaccional, log) vive en runDataOnboardingImport.
// Esta action solo aporta la configuración del dataset.
//
// Reglas: CREATE_ONLY (no actualiza, no elimina, no upsert), sin import
// parcial, confirmación textual obligatoria en EXECUTE ("IMPORT CATEGORIES"
// y, en PRODUCTION, + organization.code), sin exponer credenciales.
// ─────────────────────────────────────────────────────────────────

import { runDataOnboardingImport }
  from "../lib/data-onboarding/run-data-onboarding-import";
import { runCategoriesImport }
  from "../lib/data-onboarding/import-runners/categories-import-runner";
import { IMPORT_CATEGORIES_CONFIRMATION_TEXT }
  from "../lib/data-onboarding/import-runners/categories-import.constants";
import type {
  CategoriesImportActionState,
  CategoriesImportDryRunResult,
  CategoriesImportResult,
} from "../types/platform.types";

export async function importDataOnboardingCategoriesAction(
  formData: FormData,
): Promise<CategoriesImportActionState> {
  return runDataOnboardingImport<CategoriesImportDryRunResult, CategoriesImportResult>(formData, {
    datasetKey:           "categories",
    phase:                "E1C-A",
    datasetLabel:         "categorías",
    baseConfirmationText: IMPORT_CATEGORIES_CONFIRMATION_TEXT,
    analysisErrorMessage: (n) =>
      `El análisis server-side detectó ${n} fila(s) con error ` +
      "(duplicados, dependencias faltantes o datos inválidos). " +
      "Corrija el archivo y vuelva a intentar.",
    nonCreateMessage: (n) =>
      `${n} fila(s) no pueden crearse ` +
      "(política CREATE_ONLY: solo se permiten registros nuevos). " +
      "El archivo contiene categorías que ya existen en la base destino.",
    unexpectedErrorMessage: "Error inesperado al importar categorías.",
    run: ({ client, parsedPreview, dbAwareResult, tenantId, isDryRun }) =>
      runCategoriesImport({
        parsedPreview,
        dbAwareResult,
        prismaClient: client,
        tenantId,
        isDryRun,
      }),
    created: (imp) => imp.created,
    buildLogMetadata: (imp) => ({
      created:   imp.created,
      skipped:   imp.skipped,
      errors:    imp.errors,
      totalRows: imp.totalRows,
    }),
  });
}
