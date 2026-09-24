"use server";

// ─────────────────────────────────────────────────────────────────
// platform — import-data-onboarding-products.action.ts
//
// E1C-D: importa productos desde Excel hacia la base runtime de UNA
// organización (Shared o Dedicated). Solo escribe en products (sin inventario inicial, stock ni movimientos).
//
// SHARED-OPS-PARITY-1: el flujo completo (super_admin, resolución
// organizationId → tenant_id → runtime server-side, Commercial
// Enforcement, re-parseo, análisis DB-aware tenant-scoped, política de
// PRODUCTION, runner transaccional, log) vive en runDataOnboardingImport.
// Esta action solo aporta la configuración del dataset.
//
// Reglas: CREATE_ONLY (no actualiza, no elimina, no upsert), sin import
// parcial, confirmación textual obligatoria en EXECUTE ("IMPORT PRODUCTS"
// y, en PRODUCTION, + organization.code), sin exponer credenciales.
// ─────────────────────────────────────────────────────────────────

import { runDataOnboardingImport }
  from "../lib/data-onboarding/run-data-onboarding-import";
import { runProductsImport }
  from "../lib/data-onboarding/import-runners/products-import-runner";
import { IMPORT_PRODUCTS_CONFIRMATION_TEXT }
  from "../lib/data-onboarding/import-runners/products-import.constants";
import type {
  ProductsImportActionState,
  ProductsImportDryRunResult,
  ProductsImportResult,
} from "../types/platform.types";

export async function importDataOnboardingProductsAction(
  formData: FormData,
): Promise<ProductsImportActionState> {
  return runDataOnboardingImport<ProductsImportDryRunResult, ProductsImportResult>(formData, {
    datasetKey:           "products",
    phase:                "E1C-D",
    datasetLabel:         "productos",
    baseConfirmationText: IMPORT_PRODUCTS_CONFIRMATION_TEXT,
    analysisErrorMessage: (n) =>
      `El análisis server-side detectó ${n} fila(s) con error ` +
      "(duplicado por product_code, dependencia faltante/ambigua u otros datos inválidos). " +
      "Corrija el archivo y vuelva a intentar.",
    nonCreateMessage: (n) =>
      `${n} fila(s) no pueden crearse ` +
      "(política CREATE_ONLY: solo se permiten registros nuevos). " +
      "El archivo contiene productos que ya existen en la base destino.",
    unexpectedErrorMessage: "Error inesperado al importar productos.",
    run: ({ client, parsedPreview, dbAwareResult, tenantId, isDryRun, commercialCtx }) =>
      runProductsImport({
        parsedPreview,
        dbAwareResult,
        prismaClient: client,
        tenantId,
        isDryRun,
        commercialCtx,
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
