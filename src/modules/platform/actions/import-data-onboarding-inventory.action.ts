"use server";

// ─────────────────────────────────────────────────────────────────
// platform — import-data-onboarding-inventory.action.ts
//
// E1C-E1: importa inventario inicial desde Excel hacia la base runtime de UNA
// organización (Shared o Dedicated). Solo escribe en product_locations + inventory_movements (INITIAL_LOAD).
//
// SHARED-OPS-PARITY-1: el flujo completo (super_admin, resolución
// organizationId → tenant_id → runtime server-side, Commercial
// Enforcement, re-parseo, análisis DB-aware tenant-scoped, política de
// PRODUCTION, runner transaccional, log) vive en runDataOnboardingImport.
// Esta action solo aporta la configuración del dataset.
//
// Reglas: CREATE_ONLY (no actualiza, no elimina, no upsert), sin import
// parcial, confirmación textual obligatoria en EXECUTE ("IMPORT INITIAL INVENTORY"
// y, en PRODUCTION, + organization.code), sin exponer credenciales.
// ─────────────────────────────────────────────────────────────────

import { runDataOnboardingImport }
  from "../lib/data-onboarding/run-data-onboarding-import";
import { runInventoryImport }
  from "../lib/data-onboarding/import-runners/inventory-import-runner";
import { IMPORT_INVENTORY_CONFIRMATION_TEXT }
  from "../lib/data-onboarding/import-runners/inventory-import.constants";
import type {
  InventoryImportActionState,
  InventoryImportDryRunResult,
  InventoryImportResult,
} from "../types/platform.types";

export async function importDataOnboardingInventoryAction(
  formData: FormData,
): Promise<InventoryImportActionState> {
  return runDataOnboardingImport<InventoryImportDryRunResult, InventoryImportResult>(formData, {
    datasetKey:           "inventory_initial",
    phase:                "E1C-E1",
    datasetLabel:         "inventario inicial",
    baseConfirmationText: IMPORT_INVENTORY_CONFIRMATION_TEXT,
    analysisErrorMessage: (n) =>
      `El análisis server-side detectó ${n} fila(s) con error ` +
      "(producto o sucursal inexistente/ambigua, producto no elegible, inventario " +
      "inicial ya existente u otros datos inválidos). Corrija el archivo y vuelva a intentar.",
    nonCreateMessage: (n) =>
      `${n} fila(s) no pueden crearse ` +
      "(política CREATE_ONLY: solo se permiten registros nuevos). " +
      "El archivo contiene inventario inicial que ya existe en la base destino.",
    unexpectedErrorMessage: "Error inesperado al importar inventario inicial.",
    run: ({ client, parsedPreview, dbAwareResult, tenantId, isDryRun }) =>
      runInventoryImport({
        parsedPreview,
        dbAwareResult,
        prismaClient: client,
        tenantId,
        isDryRun,
        performedBy:  null,
      }),
    created: (imp) => imp.created,
    buildLogMetadata: (imp) => ({
      productLocationsCreated: imp.productLocationsCreated,
      movementsCreated:        imp.movementsCreated,
      errors:                  imp.errors,
      totalRows:               imp.totalRows,
    }),
  });
}
