"use server";

// ─────────────────────────────────────────────────────────────────
// platform — import-data-onboarding-sublines.action.ts
//
// E1C-B: importa sublíneas desde Excel hacia la base runtime de UNA
// organización (Shared o Dedicated). Solo escribe en product_sublines.
//
// SHARED-OPS-PARITY-1: el flujo completo (super_admin, resolución
// organizationId → tenant_id → runtime server-side, Commercial
// Enforcement, re-parseo, análisis DB-aware tenant-scoped, política de
// PRODUCTION, runner transaccional, log) vive en runDataOnboardingImport.
// Esta action solo aporta la configuración del dataset.
//
// Reglas: CREATE_ONLY (no actualiza, no elimina, no upsert), sin import
// parcial, confirmación textual obligatoria en EXECUTE ("IMPORT SUBLINES"
// y, en PRODUCTION, + organization.code), sin exponer credenciales.
// ─────────────────────────────────────────────────────────────────

import { runDataOnboardingImport }
  from "../lib/data-onboarding/run-data-onboarding-import";
import { runSublinesImport }
  from "../lib/data-onboarding/import-runners/sublines-import-runner";
import { IMPORT_SUBLINES_CONFIRMATION_TEXT }
  from "../lib/data-onboarding/import-runners/sublines-import.constants";
import type {
  SublinesImportActionState,
  SublinesImportDryRunResult,
  SublinesImportResult,
} from "../types/platform.types";

export async function importDataOnboardingSublinesAction(
  formData: FormData,
): Promise<SublinesImportActionState> {
  return runDataOnboardingImport<SublinesImportDryRunResult, SublinesImportResult>(formData, {
    datasetKey:           "sublines",
    phase:                "E1C-B",
    datasetLabel:         "sublíneas",
    baseConfirmationText: IMPORT_SUBLINES_CONFIRMATION_TEXT,
    analysisErrorMessage: (n) =>
      `El análisis server-side detectó ${n} fila(s) con error ` +
      "(línea inexistente o ambigua, duplicados u otros datos inválidos). " +
      "Corrija el archivo y vuelva a intentar.",
    nonCreateMessage: (n) =>
      `${n} fila(s) no pueden crearse ` +
      "(política CREATE_ONLY: solo se permiten registros nuevos). " +
      "El archivo contiene sublíneas que ya existen en la base destino.",
    unexpectedErrorMessage: "Error inesperado al importar sublíneas.",
    run: ({ client, parsedPreview, dbAwareResult, tenantId, isDryRun }) =>
      runSublinesImport({
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
