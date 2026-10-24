"use server";

// ─────────────────────────────────────────────────────────────────
// platform — import-data-onboarding-gym-trainers.action.ts
//
// GYM-ONBOARDING: importa entrenadores (modelo Trainer de la vertical
// GYM) desde Excel hacia la base runtime de UNA organización (Shared o
// Dedicated). Solo escribe en trainers (user_id = null).
//
// El flujo completo vive en runDataOnboardingImport; además de la
// vertical GYM efectiva exige el módulo gym.trainers de la organización
// DESTINO en cualquier ambiente.
//
// Reglas: CREATE_ONLY, sin import parcial, confirmación textual
// obligatoria en EXECUTE ("IMPORT GYM TRAINERS" y, en PRODUCTION,
// + organization.code). Nunca crea User, disponibilidad ni sesiones.
// ─────────────────────────────────────────────────────────────────

import { runDataOnboardingImport }
  from "../lib/data-onboarding/run-data-onboarding-import";
import { runGymTrainersImport }
  from "../lib/data-onboarding/import-runners/gym-trainers-import-runner";
import { IMPORT_GYM_TRAINERS_CONFIRMATION_TEXT }
  from "../lib/data-onboarding/import-runners/gym-trainers-import.constants";
import type {
  GymTrainersImportActionState,
  GymImportDryRunResult,
  GymTrainersImportResult,
} from "../types/platform.types";

export async function importDataOnboardingGymTrainersAction(
  formData: FormData,
): Promise<GymTrainersImportActionState> {
  return runDataOnboardingImport<GymImportDryRunResult, GymTrainersImportResult>(formData, {
    datasetKey:           "gym_trainers",
    phase:                "GYM-ONBOARDING",
    datasetLabel:         "entrenadores",
    baseConfirmationText: IMPORT_GYM_TRAINERS_CONFIRMATION_TEXT,
    analysisErrorMessage: (n) =>
      `El análisis server-side detectó ${n} fila(s) con error ` +
      "(sucursal inexistente o ambigua, entrenador ya existente u otros datos inválidos). " +
      "Corrija el archivo y vuelva a intentar.",
    nonCreateMessage: (n) =>
      `${n} fila(s) no pueden crearse ` +
      "(política CREATE_ONLY: solo se permiten registros nuevos).",
    unexpectedErrorMessage: "Error inesperado al importar entrenadores.",
    run: ({ client, parsedPreview, dbAwareResult, tenantId, isDryRun }) =>
      runGymTrainersImport({
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
