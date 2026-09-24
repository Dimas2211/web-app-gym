// ─────────────────────────────────────────────────────────────────
// platform/lib/data-onboarding — data-onboarding-execution-policy.ts
//
// SHARED-OPS-PARITY-1. Política central de ejecución de imports del
// Data Onboarding Center. Pura: no conecta, no escribe.
//
// No-PRODUCTION: delega sin cambios en el Safety Gate D0
// (evaluateDatabaseExecutionSafety) — mismo comportamiento histórico.
//
// PRODUCTION (antes: hard block en cada action):
//   DRY_RUN  → permitido (sin escrituras). Las guardas de super_admin,
//              organización, tenant, runtime activo y conexión resoluble
//              ya las aplicó el pipeline antes de llegar aquí.
//   EXECUTE  → permitido SOLO si:
//              - importPolicy CREATE_ONLY;
//              - módulo comercial del dataset habilitado para la org;
//              - conexión verificada (test reciente exitoso o análisis
//                DB-aware completado en esta misma operación);
//              - análisis DB-aware sin errores y solo filas CREATE;
//              - confirmación textual exacta que incluye organization.code
//                (leído server-side, nunca del navegador).
// El Safety Gate D0 global NO se modifica: sigue bloqueando PRODUCTION
// para seeds, repairs, migraciones, etc.
// ─────────────────────────────────────────────────────────────────

import { evaluateDatabaseExecutionSafety } from "../database-execution-safety";
import { buildDataOnboardingConfirmationText } from "./data-onboarding-confirmation";
import type {
  DatabaseExecutionSafetyResult,
  PlatformDatabaseProfileEnvironment,
} from "../../types/platform.types";

export type DataOnboardingImportDatasetKey =
  | "categories"
  | "lines"
  | "sublines"
  | "customers"
  | "suppliers"
  | "products"
  | "inventory_initial";

/** Módulo comercial que debe estar habilitado para importar cada dataset. */
export const DATA_ONBOARDING_DATASET_MODULE: Record<DataOnboardingImportDatasetKey, string> = {
  categories:        "commerce.products",
  lines:             "commerce.products",
  sublines:          "commerce.products",
  products:          "commerce.products",
  suppliers:         "commerce.suppliers",
  customers:         "core.customers",
  inventory_initial: "commerce.inventory",
};

export interface DataOnboardingExecutionPolicyInput {
  mode:                              "DRY_RUN" | "EXECUTE";
  environment:                       string;
  importPolicy:                      string;
  baseConfirmationText:              string;
  confirmationText:                  string | null;
  /** Leído del Control Plane — nunca del navegador. */
  organizationCode:                  string;
  moduleEnabled:                     boolean;
  hasRecentSuccessfulConnectionTest: boolean;
  /** true si el análisis DB-aware de ESTA operación se completó contra la base destino. */
  connectionVerifiedInOperation:     boolean;
  analysisErrorRows:                 number;
  analysisNonCreateRows:             number;
}

function blocked(blockers: string[], warnings: string[] = []): DatabaseExecutionSafetyResult {
  return {
    allowed:              false,
    blocked:              true,
    requiresConfirmation: true,
    requiresBackup:       false,
    requiresDryRunFirst:  false,
    riskLevel:            "MEDIUM",
    environmentPolicy:    "CONFIRMATION_REQUIRED",
    messages:             [],
    blockers,
    warnings,
  };
}

export function evaluateDataOnboardingExecutionPolicy(
  input: DataOnboardingExecutionPolicyInput,
): DatabaseExecutionSafetyResult {
  if (input.importPolicy !== "CREATE_ONLY") {
    return blocked([`Solo se permite la política CREATE_ONLY. Recibida: '${input.importPolicy}'.`]);
  }

  const isDryRun = input.mode === "DRY_RUN";
  const expected = buildDataOnboardingConfirmationText(
    input.baseConfirmationText,
    input.environment,
    input.organizationCode,
  );

  // ── No PRODUCTION: Safety Gate D0 histórico, sin cambios ────────
  if (input.environment !== "PRODUCTION") {
    return evaluateDatabaseExecutionSafety({
      actionType:                        "RUN_IMPORT",
      profileEnvironment:                input.environment as PlatformDatabaseProfileEnvironment,
      targetType:                        "CLIENT_RUNTIME",
      isDryRun,
      confirmationText:                  isDryRun ? undefined : (input.confirmationText ?? ""),
      expectedConfirmationText:          isDryRun ? undefined : expected,
      hasRecentSuccessfulConnectionTest: input.hasRecentSuccessfulConnectionTest,
      // El análisis DB-aware server-side verificó conectividad con la base destino.
      hasRecentPreflight:                true,
    });
  }

  // ── PRODUCTION ──────────────────────────────────────────────────
  const warnings = [
    "Base destino PRODUCTION. Se recomienda un backup reciente antes de ejecutar.",
  ];

  if (isDryRun) {
    return {
      allowed:              true,
      blocked:              false,
      requiresConfirmation: false,
      requiresBackup:       false,
      requiresDryRunFirst:  false,
      riskLevel:            "MEDIUM",
      environmentPolicy:    "CONFIRMATION_REQUIRED",
      messages:             ["PRODUCTION: dry-run permitido. No se escribirán datos."],
      blockers:             [],
      warnings,
    };
  }

  const blockers: string[] = [];

  if (!input.moduleEnabled) {
    blockers.push(
      "El módulo comercial requerido para este dataset no está habilitado para la organización destino.",
    );
  }

  if (!input.hasRecentSuccessfulConnectionTest && !input.connectionVerifiedInOperation) {
    blockers.push(
      "PRODUCTION requiere una conexión verificada (test exitoso reciente o análisis completado en esta operación).",
    );
  }

  if (input.analysisErrorRows > 0 || input.analysisNonCreateRows > 0) {
    blockers.push(
      "PRODUCTION requiere un análisis DB-aware sin errores y con solo filas nuevas (CREATE).",
    );
  }

  const provided = (input.confirmationText ?? "").trim();
  if (!provided) {
    blockers.push(`PRODUCTION requiere confirmación textual exacta: "${expected}".`);
  } else if (provided !== expected) {
    blockers.push(
      provided === input.baseConfirmationText.trim()
        ? `En PRODUCTION la confirmación debe identificar la organización destino: "${expected}".`
        : "El texto de confirmación no coincide con la organización destino. Verifica el texto y vuelve a intentarlo.",
    );
  }

  if (blockers.length > 0) return blocked(blockers, warnings);

  return {
    allowed:              true,
    blocked:              false,
    requiresConfirmation: true,
    requiresBackup:       false,
    requiresDryRunFirst:  false,
    riskLevel:            "MEDIUM",
    environmentPolicy:    "CONFIRMATION_REQUIRED",
    messages:             [
      "Confirmación textual verificada correctamente (organización destino incluida).",
      "PRODUCTION: importación controlada CREATE_ONLY habilitada para esta organización.",
    ],
    blockers:             [],
    warnings,
  };
}
