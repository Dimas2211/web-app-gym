"use server";

// ─────────────────────────────────────────────────────────────────
// platform — import-data-onboarding-gym-clients.action.ts
//
// GYM-ONBOARDING: importa socios del gimnasio (modelo Client de la
// vertical GYM) desde Excel hacia la base runtime de UNA organización
// (Shared o Dedicated). Solo escribe en clients. NO usa el importador de
// Customer (commerce).
//
// El flujo completo (super_admin, organizationId → tenant_id → runtime
// server-side, Commercial Enforcement + vertical GYM efectiva, re-parseo,
// análisis DB-aware tenant-scoped, política de PRODUCTION, runner
// transaccional, log) vive en runDataOnboardingImport.
//
// Reglas: CREATE_ONLY, sin import parcial, confirmación textual
// obligatoria en EXECUTE ("IMPORT GYM CLIENTS" y, en PRODUCTION,
// + organization.code). Nunca crea User, membresías ni pagos.
// ─────────────────────────────────────────────────────────────────

import { runDataOnboardingImport }
  from "../lib/data-onboarding/run-data-onboarding-import";
import { runGymClientsImport }
  from "../lib/data-onboarding/import-runners/gym-clients-import-runner";
import { IMPORT_GYM_CLIENTS_CONFIRMATION_TEXT }
  from "../lib/data-onboarding/import-runners/gym-clients-import.constants";
import type {
  GymClientsImportActionState,
  GymImportDryRunResult,
  GymClientsImportResult,
} from "../types/platform.types";

export async function importDataOnboardingGymClientsAction(
  formData: FormData,
): Promise<GymClientsImportActionState> {
  return runDataOnboardingImport<GymImportDryRunResult, GymClientsImportResult>(formData, {
    datasetKey:           "gym_clients",
    phase:                "GYM-ONBOARDING",
    datasetLabel:         "clientes GYM",
    baseConfirmationText: IMPORT_GYM_CLIENTS_CONFIRMATION_TEXT,
    analysisErrorMessage: (n) =>
      `El análisis server-side detectó ${n} fila(s) con error ` +
      "(sucursal/deporte/objetivo inexistente o ambiguo, código o documento ya existente, " +
      "posible duplicado u otros datos inválidos). Corrija el archivo y vuelva a intentar.",
    nonCreateMessage: (n) =>
      `${n} fila(s) no pueden crearse ` +
      "(política CREATE_ONLY: solo se permiten registros nuevos).",
    unexpectedErrorMessage: "Error inesperado al importar clientes GYM.",
    run: ({ client, parsedPreview, dbAwareResult, tenantId, isDryRun }) =>
      runGymClientsImport({
        parsedPreview,
        dbAwareResult,
        prismaClient: client,
        tenantId,
        isDryRun,
      }),
    created: (imp) => imp.created,
    // Solo conteos — sin nombres, documentos ni contenido del archivo.
    buildLogMetadata: (imp) => ({
      created:   imp.created,
      skipped:   imp.skipped,
      errors:    imp.errors,
      totalRows: imp.totalRows,
    }),
  });
}
