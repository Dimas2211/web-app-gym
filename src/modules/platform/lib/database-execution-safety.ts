/**
 * D0: Execution Safety Gate
 *
 * Compuerta de seguridad reutilizable para futuras acciones de escritura
 * contra bases de datos cliente. Esta función es pura — no escribe datos,
 * no ejecuta migraciones, no ejecuta seeds, no conecta a bases cliente.
 *
 * Uso previsto: cualquier acción futura (seed runner, migration runner,
 * importación Excel, correcciones automáticas) debe pasar primero por
 * evaluateDatabaseExecutionSafety() y solo proceder si allowed === true.
 *
 * D0 garantías:
 * - No escribe en bases cliente.
 * - No ejecuta seeds.
 * - No ejecuta migraciones.
 * - No conecta a bases externas.
 * - Producción bloqueado por defecto.
 * - CONTROL_PLANE y UNKNOWN bloqueados siempre.
 */

import type {
  DatabaseExecutionActionType,
  DatabaseExecutionRiskLevel,
  DatabaseExecutionEnvironmentPolicy,
  DatabaseExecutionSafetyInput,
  DatabaseExecutionSafetyResult,
  DatabaseRemediationRisk,
} from "../types/platform.types";

// ─── Matriz de riesgo: acción → nivel de riesgo base ─────────────────────────

export const ACTION_EXECUTION_RISK: Record<
  DatabaseExecutionActionType,
  DatabaseExecutionRiskLevel
> = {
  SEED_DTE_CATALOGS:           "LOW",
  SEED_GLOBAL_CATALOGS:        "LOW",
  SEED_TENANT_BASE:            "MEDIUM",
  CREATE_TENANT_FISCAL_CONFIG: "MEDIUM",
  RUN_MIGRATIONS:              "HIGH",
  RUN_IMPORT:                  "MEDIUM",
  RUN_REPAIR:                  "HIGH",
  CREATE_SUPPORT_SALE:         "HIGH",
  CREATE_SUPPORT_DTE:          "HIGH",
  GENERATE_SUPPORT_DTE_JSON:   "MEDIUM",
  MANUAL_OPERATION:            "CRITICAL",
};

// ─── Matriz de política: ambiente × riesgo → política ────────────────────────
//
// LOCAL/SANDBOX: permitir LOW, confirmar MEDIUM+, bloquear CRITICAL.
// TEST:          confirmar LOW+, bloquear CRITICAL.
// STAGING:       confirmar LOW/MEDIUM, bloquear HIGH/CRITICAL.
// PRODUCTION:    bloquear todo (D0 — habilitación futura en D1 con controles adicionales).

type KnownEnvironment = "LOCAL" | "SANDBOX" | "TEST" | "STAGING" | "PRODUCTION";

const ENV_POLICY_MATRIX: Record<
  KnownEnvironment,
  Record<DatabaseExecutionRiskLevel, DatabaseExecutionEnvironmentPolicy>
> = {
  LOCAL: {
    LOW:      "ALLOWED",
    MEDIUM:   "CONFIRMATION_REQUIRED",
    HIGH:     "CONFIRMATION_REQUIRED",
    CRITICAL: "BLOCKED",
  },
  SANDBOX: {
    LOW:      "ALLOWED",
    MEDIUM:   "CONFIRMATION_REQUIRED",
    HIGH:     "CONFIRMATION_REQUIRED",
    CRITICAL: "BLOCKED",
  },
  TEST: {
    LOW:      "CONFIRMATION_REQUIRED",
    MEDIUM:   "CONFIRMATION_REQUIRED",
    HIGH:     "CONFIRMATION_REQUIRED",
    CRITICAL: "BLOCKED",
  },
  STAGING: {
    LOW:      "CONFIRMATION_REQUIRED",
    MEDIUM:   "CONFIRMATION_REQUIRED",
    HIGH:     "BLOCKED",
    CRITICAL: "BLOCKED",
  },
  PRODUCTION: {
    LOW:      "BLOCKED",
    MEDIUM:   "BLOCKED",
    HIGH:     "BLOCKED",
    CRITICAL: "BLOCKED",
  },
};

// ─── Helper: mapear riesgo de remediación a riesgo de ejecución ───────────────
// Los valores son idénticos (LOW|MEDIUM|HIGH|CRITICAL) — puente semántico explícito.

export function remediationRiskToExecutionRisk(
  risk: DatabaseRemediationRisk,
): DatabaseExecutionRiskLevel {
  return risk as DatabaseExecutionRiskLevel;
}

// ─── Helper: preview de seguridad por riesgo + ambiente (para UI) ────────────
//
// Útil para mostrar requisitos de una acción futura sin construir un input
// completo. Recibe el riesgo del item de remediación y el contexto del perfil.

export function getExecutionSafetyPreview(
  risk: DatabaseRemediationRisk,
  environment: string,
  targetType: string,
): {
  environmentPolicy:    DatabaseExecutionEnvironmentPolicy;
  requiresConfirmation: boolean;
  requiresBackup:       boolean;
  requiresDryRunFirst:  boolean;
  isBlockedNow:         boolean;
  statusLabel:          string;
} {
  const BLOCKED_RESULT = {
    environmentPolicy:    "BLOCKED" as DatabaseExecutionEnvironmentPolicy,
    requiresConfirmation: false,
    requiresBackup:       false,
    requiresDryRunFirst:  false,
    isBlockedNow:         true,
    statusLabel:          "Bloqueado",
  };

  if (targetType === "CONTROL_PLANE" || targetType === "UNKNOWN") {
    return BLOCKED_RESULT;
  }

  const riskLevel = risk as DatabaseExecutionRiskLevel;
  const env = environment as KnownEnvironment;
  const policy: DatabaseExecutionEnvironmentPolicy =
    ENV_POLICY_MATRIX[env]?.[riskLevel] ?? "BLOCKED";

  // DEMO: mínimo CONFIRMATION_REQUIRED aunque la política base sea ALLOWED
  const effectivePolicy: DatabaseExecutionEnvironmentPolicy =
    targetType === "DEMO" && policy === "ALLOWED" ? "CONFIRMATION_REQUIRED" : policy;

  const requiresBackup =
    env === "PRODUCTION" ||
    env === "STAGING" ||
    riskLevel === "HIGH" ||
    riskLevel === "CRITICAL";

  const requiresDryRunFirst = riskLevel === "HIGH" || riskLevel === "CRITICAL";
  const requiresConfirmation = effectivePolicy === "CONFIRMATION_REQUIRED";

  const statusLabel =
    effectivePolicy === "BLOCKED"               ? "Bloqueado en D0" :
    effectivePolicy === "CONFIRMATION_REQUIRED" ? "Requiere confirmación" :
                                                  "Permitido con validaciones";

  return {
    environmentPolicy: effectivePolicy,
    requiresConfirmation,
    requiresBackup,
    requiresDryRunFirst,
    isBlockedNow: effectivePolicy === "BLOCKED",
    statusLabel,
  };
}

// ─── Evaluación principal de la compuerta ────────────────────────────────────

export function evaluateDatabaseExecutionSafety(
  input: DatabaseExecutionSafetyInput,
): DatabaseExecutionSafetyResult {
  const messages: string[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  const riskLevel = ACTION_EXECUTION_RISK[input.actionType];

  // ── 1. Bloqueo por target type ─────────────────────────────────────────────

  if (input.targetType === "CONTROL_PLANE") {
    blockers.push(
      "Acción bloqueada: el target es CONTROL_PLANE. " +
      "No se permiten acciones de escritura sobre la base de control plane.",
    );
    return buildBlocked(riskLevel, blockers, warnings, messages);
  }

  if (input.targetType === "UNKNOWN") {
    blockers.push(
      "Acción bloqueada: target UNKNOWN. " +
      "Clasificar el tipo de base en el perfil antes de ejecutar acciones.",
    );
    return buildBlocked(riskLevel, blockers, warnings, messages);
  }

  // ── 2. Política de ambiente ────────────────────────────────────────────────

  const env = input.profileEnvironment as KnownEnvironment;
  const basePolicy: DatabaseExecutionEnvironmentPolicy =
    ENV_POLICY_MATRIX[env]?.[riskLevel] ?? "BLOCKED";

  // DEMO: mínimo CONFIRMATION_REQUIRED
  const effectivePolicy: DatabaseExecutionEnvironmentPolicy =
    input.targetType === "DEMO" && basePolicy === "ALLOWED"
      ? "CONFIRMATION_REQUIRED"
      : basePolicy;

  if (effectivePolicy === "BLOCKED") {
    const reason =
      input.profileEnvironment === "PRODUCTION"
        ? "Ejecución bloqueada en PRODUCTION en D0. " +
          "La habilitación en producción estará disponible en D1 con controles adicionales " +
          "(backup obligatorio, confirmación textual, dry-run previo, aprobación de segunda persona)."
        : `Acción ${riskLevel} bloqueada en ambiente ${input.profileEnvironment}. ` +
          "Usa un ambiente de menor riesgo (LOCAL/SANDBOX/TEST) para esta operación.";
    blockers.push(reason);
    return buildBlocked(riskLevel, blockers, warnings, messages, effectivePolicy);
  }

  // ── 3. Derivar flags de requisitos ────────────────────────────────────────

  const requiresConfirmation = effectivePolicy === "CONFIRMATION_REQUIRED";
  const requiresBackup =
    input.profileEnvironment === "PRODUCTION" ||
    input.profileEnvironment === "STAGING" ||
    riskLevel === "HIGH" ||
    riskLevel === "CRITICAL";
  const requiresDryRunFirst = riskLevel === "HIGH" || riskLevel === "CRITICAL";

  // ── 4. Validar requisitos ─────────────────────────────────────────────────

  let canProceed = true;

  // Test de conexión reciente
  if (!input.hasRecentSuccessfulConnectionTest) {
    if (riskLevel === "HIGH" || riskLevel === "CRITICAL") {
      blockers.push(
        "Se requiere test de conexión exitoso reciente contra este perfil " +
        "antes de ejecutar una acción de riesgo alto o crítico.",
      );
      canProceed = false;
    } else {
      warnings.push(
        "No hay test de conexión reciente registrado. " +
        "Se recomienda verificar la conexión desde Perfiles antes de proceder.",
      );
    }
  }

  // Preflight reciente
  if (!input.hasRecentPreflight) {
    if (riskLevel === "MEDIUM" || riskLevel === "HIGH" || riskLevel === "CRITICAL") {
      blockers.push(
        "Se requiere preflight reciente contra este perfil antes de ejecutar " +
        "acciones de riesgo medio, alto o crítico.",
      );
      canProceed = false;
    } else {
      warnings.push(
        "No hay preflight reciente. Se recomienda ejecutar preflight antes de proceder " +
        "para verificar el estado de la base objetivo.",
      );
    }
  }

  // Dry-run — se satisface con isDryRun=true (la llamada actual) o con
  // hasRecentSuccessfulDryRun=true (ya se ejecutó un dry-run vigente antes
  // de esta llamada EXECUTE, ej: preview del cliente sin cambios posteriores).
  if (requiresDryRunFirst && !input.isDryRun && !input.hasRecentSuccessfulDryRun) {
    blockers.push(
      "Esta acción requiere ejecución previa en modo dry-run antes de la ejecución real. " +
      "Ejecuta primero con isDryRun=true para verificar el resultado esperado.",
    );
    canProceed = false;
  }

  // Backup
  if (requiresBackup && !input.hasBackupConfirmation) {
    blockers.push(
      "Se requiere confirmar que existe un backup reciente y verificado " +
      "de la base objetivo antes de proceder con esta acción.",
    );
    canProceed = false;
  }

  // Confirmación textual — no aplica en dry-run (sin escrituras)
  if (requiresConfirmation && !input.isDryRun) {
    const confirmProvided = input.confirmationText && input.expectedConfirmationText;
    if (!confirmProvided) {
      blockers.push(
        "Esta acción requiere texto de confirmación explícito. " +
        "Proporciona confirmationText y expectedConfirmationText.",
      );
      canProceed = false;
    } else if (
      input.confirmationText!.trim() !== input.expectedConfirmationText!.trim()
    ) {
      blockers.push(
        "El texto de confirmación no coincide con el esperado. " +
        "Verifica el texto y vuelve a intentarlo.",
      );
      canProceed = false;
    } else {
      messages.push("Confirmación textual verificada correctamente.");
    }
  }

  // ── 5. Mensajes informativos ──────────────────────────────────────────────

  if (input.isDryRun) {
    messages.push("Modo dry-run activo. No se escribirán datos reales en esta ejecución.");
  }

  if (riskLevel === "LOW") {
    messages.push("Acción de bajo riesgo. Operación idempotente: puede ejecutarse de forma segura.");
  }

  if (input.targetType === "DEMO") {
    messages.push("Base DEMO: requiere confirmación aunque el riesgo sea bajo.");
  }

  // ── 6. Resultado final ────────────────────────────────────────────────────

  const allowed = canProceed && blockers.length === 0;

  return {
    allowed,
    blocked:              false,
    requiresConfirmation,
    requiresBackup,
    requiresDryRunFirst,
    riskLevel,
    environmentPolicy:    effectivePolicy,
    messages,
    blockers,
    warnings,
  };
}

// ─── Helpers internos ────────────────────────────────────────────────────────

function buildBlocked(
  riskLevel:         DatabaseExecutionRiskLevel,
  blockers:          string[],
  warnings:          string[],
  messages:          string[],
  environmentPolicy: DatabaseExecutionEnvironmentPolicy = "BLOCKED",
): DatabaseExecutionSafetyResult {
  return {
    allowed:              false,
    blocked:              true,
    requiresConfirmation: false,
    requiresBackup:       false,
    requiresDryRunFirst:  false,
    riskLevel,
    environmentPolicy,
    messages,
    blockers,
    warnings,
  };
}
