// ─────────────────────────────────────────────────────────────────
// commerce/dte — fex11-feature-guard.ts
//
// F3-C17 — habilitación controlada server-side de FEX 11 en TEST.
//
// FEX 11 se habilita solo para TEST mediante DTE_FEX11_TEST_ENABLED
// hasta que exista UI y validaciones completas de catálogos.
//
// No lee ni imprime credenciales — solo evalúa flags/estado.
// ─────────────────────────────────────────────────────────────────

export interface Fex11GuardParams {
  dte_type_code: string;
  environment:   string;
}

/** true solo si el flag de habilitación TEST está activo y no estamos en producción. */
export function isFex11TestEnabled(): boolean {
  if (process.env["NODE_ENV"] === "production") return false;
  return process.env["DTE_FEX11_TEST_ENABLED"] === "YES";
}

/** true si el documento/flujo puede operar sobre FEX 11 en este servidor. */
export function canUseFex11InServerFlow(params: Fex11GuardParams): boolean {
  if (params.dte_type_code !== "11") return false;
  if (params.environment !== "TEST") return false;
  return isFex11TestEnabled();
}

/**
 * Devuelve un mensaje de error uniforme cuando FEX 11 no cumple las
 * condiciones de habilitación controlada. `null` si sí las cumple.
 */
export function assertFex11TestEnabledOrReturnError(
  params: Fex11GuardParams,
): string | null {
  if (params.dte_type_code !== "11") return null;

  if (!canUseFex11InServerFlow(params)) {
    return "FEX 11 solo está habilitada para pruebas controladas en ambiente TEST.";
  }

  return null;
}
