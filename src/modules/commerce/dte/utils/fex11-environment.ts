// ─────────────────────────────────────────────────────────────────
// commerce/dte — fex11-environment.ts
//
// FEX11-FINAL-CLOSURE — FEX 11 es un tipo DTE normal de fiscal.dte.
// No hay feature flags ni capability propia: el acceso lo da el módulo
// fiscal.dte + un DteIssuerConfig activo único en la location, y el
// ambiente fiscal (TEST / PRODUCTION) se deriva de
// DteIssuerConfig.environment y queda fijado en
// DteOutgoingDocument.environment — igual que FE/CCFE/NC/FSE.
//
// Este helper solo valida que un documento FEX tenga un ambiente fiscal
// reconocido antes de generar / firmar / transmitir / entregar. Nunca
// depende de NODE_ENV ni de variables de entorno.
// ─────────────────────────────────────────────────────────────────

export type Fex11Environment = "TEST" | "PRODUCTION";

export interface Fex11EnvironmentParams {
  dte_type_code: string;
  environment:   string;
}

/** Mensaje de negocio uniforme — ambiente fiscal del documento no reconocido. */
export const FEX11_INVALID_ENVIRONMENT_ERROR =
  "El documento de exportación no tiene un ambiente fiscal válido (TEST / PRODUCTION).";

export function isFex11Environment(environment: string | null | undefined): environment is Fex11Environment {
  return environment === "TEST" || environment === "PRODUCTION";
}

/** true si el documento es FEX 11 y su ambiente fiscal es TEST o PRODUCTION. */
export function canUseFex11InServerFlow(params: Fex11EnvironmentParams): boolean {
  if (params.dte_type_code !== "11") return false;
  return isFex11Environment(params.environment);
}
