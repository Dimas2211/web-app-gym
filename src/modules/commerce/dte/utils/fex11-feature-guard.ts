// ─────────────────────────────────────────────────────────────────
// commerce/dte — fex11-feature-guard.ts
//
// F3-C17 — habilitación controlada server-side de FEX 11 en TEST.
// F3-C21 — se agrega DTE_FEX11_ENABLED como flag comercial explícito,
// además del flag de consola de prueba DTE_FEX11_TEST_ENABLED.
//
// FEX-PROD-1 — routing TEST/PRODUCTION por ambiente fiscal explícito:
//   DTE_FEX11_TEST_ENABLED=YES       → habilita TEST.
//   DTE_FEX11_ENABLED=YES            → habilita TEST (compatibilidad
//                                      comercial F3-C21). NUNCA PROD.
//   DTE_FEX11_PRODUCTION_ENABLED=YES → única habilitación de PRODUCTION.
//
// Solo el literal "YES" habilita. El ambiente fiscal lo decide el
// documento / emisor (DteOutgoingDocument.environment,
// DteIssuerConfig.environment) — nunca NODE_ENV. NODE_ENV solo sigue
// bloqueando la consola de prueba dev-only (isFex11TestConsoleEnabled),
// que crea datos sintéticos y no es un flujo fiscal.
//
// No lee ni imprime credenciales — solo evalúa flags/estado.
// ─────────────────────────────────────────────────────────────────

export type Fex11Environment = "TEST" | "PRODUCTION";

export interface Fex11GuardParams {
  dte_type_code: string;
  environment:   string;
}

/** Mensaje de negocio uniforme — no expone variables de entorno al usuario. */
export const FEX11_NOT_ENABLED_ERROR =
  "Ventas de exportación no están habilitadas para esta organización.";

function flagIsYes(name: string): boolean {
  return process.env[name] === "YES";
}

/** true solo si DTE_FEX11_TEST_ENABLED=YES. Aplica únicamente a TEST. */
export function isFex11TestEnabled(): boolean {
  return flagIsYes("DTE_FEX11_TEST_ENABLED");
}

/** true solo si DTE_FEX11_ENABLED=YES. Compatibilidad comercial — aplica únicamente a TEST. */
export function isFex11CommercialEnabled(): boolean {
  return flagIsYes("DTE_FEX11_ENABLED");
}

/** true solo si DTE_FEX11_PRODUCTION_ENABLED=YES. Única habilitación de PRODUCTION. */
export function isFex11ProductionEnabled(): boolean {
  return flagIsYes("DTE_FEX11_PRODUCTION_ENABLED");
}

/** true si FEX 11 está habilitada para el ambiente fiscal exacto indicado. */
export function isFex11EnvironmentEnabled(environment: string | null | undefined): boolean {
  if (environment === "TEST")       return isFex11TestEnabled() || isFex11CommercialEnabled();
  if (environment === "PRODUCTION") return isFex11ProductionEnabled();
  return false;
}

/**
 * Gate grueso (UI / entrada de actions): true si FEX 11 está habilitada
 * en al menos un ambiente. No concede permiso fiscal por sí mismo — el
 * ambiente efectivo se valida después con isFex11EnvironmentEnabled.
 */
export function isFex11Enabled(): boolean {
  return isFex11EnvironmentEnabled("TEST") || isFex11EnvironmentEnabled("PRODUCTION");
}

/** Consola de prueba dev-only (/dashboard/dte/fex11-test): TEST flag y fuera de NODE_ENV=production. */
export function isFex11TestConsoleEnabled(): boolean {
  if (process.env["NODE_ENV"] === "production") return false;
  return isFex11TestEnabled();
}

/** true si el documento/flujo puede operar sobre FEX 11 en su ambiente fiscal. */
export function canUseFex11InServerFlow(params: Fex11GuardParams): boolean {
  if (params.dte_type_code !== "11") return false;
  return isFex11EnvironmentEnabled(params.environment);
}

/**
 * Devuelve un mensaje de error uniforme cuando FEX 11 no está habilitada
 * para el ambiente del documento. `null` si sí lo está o si no es FEX.
 */
export function assertFex11EnabledOrReturnError(
  params: Fex11GuardParams,
): string | null {
  if (params.dte_type_code !== "11") return null;
  return canUseFex11InServerFlow(params) ? null : FEX11_NOT_ENABLED_ERROR;
}
