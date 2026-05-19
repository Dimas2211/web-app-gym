// commerce/dte — dte-transmission.types.ts
//
// Tipos para la transmisión de DTE firmado al Ministerio de Hacienda.
// Endpoint: POST /fesv/recepciondte
//
// El adapter normaliza la respuesta MH pero NO decide el estado Prisma final.
// Esa decisión queda para el service/action posterior (4I-6C).

import type { DteMhEnvironment } from "./dte-mh-auth.types";

// ── Códigos MH ────────────────────────────────────────────────────

/** Código de ambiente que va en el body del POST a MH */
export type DteMhAmbienteCode = "00" | "01";

/** tipoDte aceptado por recepciondte */
export type DteTypeCode = "01" | "03";

// Re-exportar para comodidad de consumers
export type { DteMhEnvironment };

// ── Input ─────────────────────────────────────────────────────────

export interface DteTransmissionInput {
  /** Ambiente destino. Si omite, usa DTE_ENVIRONMENT del config. */
  environment?: DteMhEnvironment;
  /** "01" = FE, "03" = CCFE */
  dteTypeCode: DteTypeCode;
  /** version del DTE: FE 01 → 1, CCFE 03 → 3 */
  version: number;
  /** codigoGeneracion del DteOutgoingDocument */
  codigoGeneracion: string;
  /** JWS firmado completo */
  signedJws: string;
  /**
   * Entero de correlativo de envío.
   * Si no se proporciona, el adapter genera uno seguro (1-999 999).
   */
  idEnvio?: number;
}

// ── Body oficial POST /fesv/recepciondte ──────────────────────────

/** Solo para tipado interno del body que va al fetch. No exportar al cliente. */
export interface DteMhReceptionBody {
  ambiente: DteMhAmbienteCode;
  idEnvio: number;
  version: number;
  tipoDte: DteTypeCode;
  documento: string;
  codigoGeneracion: string;
}

// ── Resultado normalizado ─────────────────────────────────────────

export interface DteTransmissionSuccessResult {
  ok: true;
  /** Estado fiscal que devuelve MH: "PROCESADO" | "RECHAZADO" | etc. */
  mhEstado: string;
  codigoGeneracion?: string;
  /** Sello de recibido MH (presente solo en PROCESADO). */
  selloRecibido?: string | null;
  fhProcesamiento?: string | null;
  codigoMsg?: string | null;
  descripcionMsg?: string | null;
  /** Array de observaciones MH (presente en RECIBIDO CON OBSERVACIONES). */
  observaciones?: unknown[] | null;
  /** Respuesta MH cruda (sin signed_jws ni Authorization). */
  rawResponse: unknown;
  httpStatus: number;
  /** Correlativo de envío usado en el POST. Necesario para persistencia en 4I-6C. */
  idEnvio: number;
}

export interface DteTransmissionErrorResult {
  ok: false;
  errorCode: DteTransmissionAdapterError | string;
  message: string;
  httpStatus?: number;
  /** Respuesta MH cruda cuando el error es fiscal (ej. HTTP 400 inesperado). */
  rawResponse?: unknown;
}

export type DteTransmissionResult =
  | DteTransmissionSuccessResult
  | DteTransmissionErrorResult;

// ── Códigos de error técnicos ─────────────────────────────────────

export type DteTransmissionAdapterError =
  | "MH_TRANSMISSION_AUTH_FAILED"
  | "MH_TRANSMISSION_TIMEOUT"
  | "MH_TRANSMISSION_UNAVAILABLE"
  | "MH_TRANSMISSION_INVALID_RESPONSE"
  | "MH_TRANSMISSION_HTTP_ERROR";

// ── Debug payload (sin datos sensibles) ──────────────────────────

/** Para trazas internas. Nunca incluir Authorization ni signedJws completo. */
export interface DteTransmissionDebugInfo {
  ambiente: DteMhAmbienteCode;
  idEnvio: number;
  version: number;
  tipoDte: DteTypeCode;
  codigoGeneracion: string;
  documentoLength: number;
}
