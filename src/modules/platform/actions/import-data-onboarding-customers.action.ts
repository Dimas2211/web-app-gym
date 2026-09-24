"use server";

// ─────────────────────────────────────────────────────────────────
// platform — import-data-onboarding-customers.action.ts
//
// E1C-C: importa clientes desde Excel hacia la base runtime de UNA
// organización (Shared o Dedicated). Solo escribe en customers.
//
// SHARED-OPS-PARITY-1: el flujo completo (super_admin, resolución
// organizationId → tenant_id → runtime server-side, Commercial
// Enforcement, re-parseo, análisis DB-aware tenant-scoped, política de
// PRODUCTION, runner transaccional, log) vive en runDataOnboardingImport.
// Esta action solo aporta la configuración del dataset.
//
// Reglas: CREATE_ONLY (no actualiza, no elimina, no upsert), sin import
// parcial, confirmación textual obligatoria en EXECUTE ("IMPORT CUSTOMERS"
// y, en PRODUCTION, + organization.code), sin exponer credenciales.
// ─────────────────────────────────────────────────────────────────

import { runDataOnboardingImport }
  from "../lib/data-onboarding/run-data-onboarding-import";
import { runCustomersImport }
  from "../lib/data-onboarding/import-runners/customers-import-runner";
import { IMPORT_CUSTOMERS_CONFIRMATION_TEXT }
  from "../lib/data-onboarding/import-runners/customers-import.constants";
import type {
  CustomersImportActionState,
  CustomersImportDryRunResult,
  CustomersImportResult,
} from "../types/platform.types";

export async function importDataOnboardingCustomersAction(
  formData: FormData,
): Promise<CustomersImportActionState> {
  return runDataOnboardingImport<CustomersImportDryRunResult, CustomersImportResult>(formData, {
    datasetKey:           "customers",
    phase:                "E1C-C",
    datasetLabel:         "clientes",
    baseConfirmationText: IMPORT_CUSTOMERS_CONFIRMATION_TEXT,
    analysisErrorMessage: (n) =>
      `El análisis server-side detectó ${n} fila(s) con error ` +
      "(duplicado por NIT/DUI/nombre u otros datos inválidos). " +
      "Corrija el archivo y vuelva a intentar.",
    nonCreateMessage: (n) =>
      `${n} fila(s) no pueden crearse ` +
      "(política CREATE_ONLY: solo se permiten registros nuevos). " +
      "El archivo contiene clientes que ya existen en la base destino.",
    unexpectedErrorMessage: "Error inesperado al importar clientes.",
    run: ({ client, parsedPreview, dbAwareResult, tenantId, isDryRun }) =>
      runCustomersImport({
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
