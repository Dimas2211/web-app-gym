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

/** Texto exacto que el operador escribe para autorizar una corrida. */
export const MH_TEST_RUN_CONFIRM_TEXT = "INICIAR PRUEBAS TEST";
