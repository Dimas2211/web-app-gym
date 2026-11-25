// ─────────────────────────────────────────────────────────────────
// DTE-MH-TEST-RUNS — feature flag y secreto del tick.
//
// DTE_MH_TEST_RUNS_ENABLED (default: deshabilitado). Solo "true" exacto
// habilita crear/avanzar corridas.
//
// IMPORTANTE: el flag NO controla las barreras de exclusión por propósito
// (dte-document-purpose.ts). Deshabilitar la función deja las barreras
// activas. Tampoco pausa las corridas existentes: con el flag apagado el
// tick responde 404 y las acciones rechazan, pero el estado persistido de
// cada corrida NO cambia (no se pasa a PAUSED).
// ─────────────────────────────────────────────────────────────────

export function isMhTestRunsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DTE_MH_TEST_RUNS_ENABLED === "true";
}

export const MH_TEST_TICK_SECRET_MIN_LENGTH = 32;

/** Secreto del tick HTTPS (VPS → Control Plane). null si falta o es corto. */
export function getMhTestTickSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const s = env.DTE_MH_TEST_TICK_SECRET;
  return s && s.length >= MH_TEST_TICK_SECRET_MIN_LENGTH ? s : null;
}

export const MH_TEST_RUNS_DISABLED_MESSAGE =
  "Las pruebas automáticas de Hacienda están deshabilitadas (DTE_MH_TEST_RUNS_ENABLED).";

/**
 * MH20 (Fase 8) — M4 (platform_dte_mh_test_run_profiles) aplicada en el
 * Control Plane. Solo "true" exacto. Apagado → los planes v2 (perfil
 * explícito/cadena) se rechazan al crear; los v1 siguen igual que hoy.
 */
export function isMhTestRunsM4Applied(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DTE_MH_TEST_RUNS_M4_APPLIED === "true";
}

export const MH_TEST_RUNS_M4_REQUIRED_MESSAGE =
  "Los planes con perfil normativo o cadena requieren la migración M4 en el Control Plane (DTE_MH_TEST_RUNS_M4_APPLIED).";

/**
 * MH20 (Fase 8) — corridas MH TEST con perfil MH_2_0: solo dry-run. La
 * creación y el procesamiento quedan bloqueados hasta la fase de activación
 * (Fase 9): el interruptor global sigue OFF y el camino runtime de firma /
 * transmisión 2.0 del onboarding no está habilitado.
 */
export const MH20_TEST_RUNS_BLOCKED_MESSAGE =
  "Corridas MH TEST con perfil MH 2.0: solo validación previa (dry-run). La ejecución real requiere la fase de activación autorizada.";

// ── MH20 (Fase 9.0): puerta de ejecución de corridas MH_2_0 ───────
//
// El runtime 2.0 del onboarding está cableado (perfil persistido de la
// corrida → builders/NC/invalidación/firma) pero queda APAGADO. Una corrida
// MH_2_0 solo se crea y procesa si TODAS estas condiciones se cumplen en el
// Control Plane (el interruptor global DTE_MH20_PROFILE_ENABLED NO
// interviene y sigue OFF):
//   1. DTE_MH_TEST_RUNS_ENABLED=true              (existente)
//   2. DTE_MH_TEST_RUNS_M4_APPLIED=true           (M4 en el CP)
//   3. DTE_MH_TEST_RUNS_MH20_ENABLED=true         (nuevo, default OFF)
//   4. organización en DTE_MH_TEST_RUNS_MH20_ORGANIZATIONS (lista explícita)
//   5. corrida TEST con fila M4 MH_2_0 coherente con el plan y snapshot
// El resto (M1/M1b/M2, catálogos, credenciales, firmador, códigos AT,
// emisor sin cambios) lo verifica el preflight runtime de cada tick.

export function isMhTestRunsMh20Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DTE_MH_TEST_RUNS_MH20_ENABLED === "true";
}

/** Lista explícita de organizaciones autorizadas para corridas MH 2.0 (ids separados por coma). */
export function mh20AuthorizedOrganizations(env: NodeJS.ProcessEnv = process.env): ReadonlySet<string> {
  return new Set((env.DTE_MH_TEST_RUNS_MH20_ORGANIZATIONS ?? "").split(",").map((x) => x.trim()).filter(Boolean));
}

/** Confirmación exacta, distinta de la 1.2, para crear una corrida MH 2.0. */
export const MH20_TEST_RUN_CONFIRM_TEXT = "INICIAR PRUEBAS TEST MH 2.0";

export interface Mh20RunGateInput {
  organizationId: string;
  environment:    string;
  planProfile:    string | undefined;
  /** Fila M4; undefined = no consultada (sin M4). */
  runProfile?:    { mh_spec_profile: string; issuer_snapshot: Record<string, string | null> } | null;
  /** true en el motor (exige fila M4); false al crear (la fila aún no existe). */
  requireRunProfile: boolean;
}

/** Puerta pura de ejecución MH_2_0. Lista vacía = permitido. */
export function evaluateMh20RunGate(input: Mh20RunGateInput, env: NodeJS.ProcessEnv = process.env): string[] {
  const errors: string[] = [];
  if (!isMhTestRunsEnabled(env)) errors.push("DTE_MH_TEST_RUNS_ENABLED apagado.");
  if (!isMhTestRunsM4Applied(env)) errors.push("M4 no confirmada en el Control Plane (DTE_MH_TEST_RUNS_M4_APPLIED).");
  if (!isMhTestRunsMh20Enabled(env)) errors.push("Ejecución MH 2.0 apagada (DTE_MH_TEST_RUNS_MH20_ENABLED).");
  if (!mh20AuthorizedOrganizations(env).has(input.organizationId)) errors.push("Organización no autorizada para corridas MH 2.0 (DTE_MH_TEST_RUNS_MH20_ORGANIZATIONS).");
  if (input.environment !== "TEST") errors.push("Las corridas MH 2.0 solo existen en ambiente TEST.");
  if (input.planProfile !== "MH_2_0") errors.push("El plan no declara el perfil MH_2_0.");
  if (input.requireRunProfile) {
    if (!input.runProfile) errors.push("Falta la fila M4 (perfil persistido) de la corrida.");
    else {
      if (input.runProfile.mh_spec_profile !== input.planProfile) errors.push("El perfil persistido (M4) no coincide con el plan.");
      const snap = input.runProfile.issuer_snapshot ?? {};
      if (!snap.cod_estable_mh || !snap.cod_punto_venta_mh) errors.push("El snapshot del emisor (M4) no tiene códigos AT.");
    }
  }
  return errors;
}

/** Texto exacto que el operador escribe para autorizar una corrida. */
export const MH_TEST_RUN_CONFIRM_TEXT = "INICIAR PRUEBAS TEST";
