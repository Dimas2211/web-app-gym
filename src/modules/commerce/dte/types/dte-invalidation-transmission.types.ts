// commerce/dte — dte-invalidation-transmission.types.ts
//
// Tipos para transmisión del evento de invalidación DTE al Ministerio de Hacienda.
// Endpoint: POST /fesv/anulardte
//
// Body wrapper: { ambiente, idEnvio, version, documento }
// No incluye tipoDte ni codigoGeneracion en el wrapper de anulación.

import type { DteMhEnvironment } from "./dte-mh-auth.types";

// Re-export para consumers
export type { DteMhEnvironment };

// ── Input ─────────────────────────────────────────────────────────

export interface DteInvalidationTransmissionInput {
  environment?: DteMhEnvironment;
  /** JWS firmado del evento de invalidación */
  signedJws: string;
  /** version del evento — siempre 2 según spec MH anulacion-schema-v2 */
  version?: number;
  /** Correlativo de envío. Si omite, el adapter genera uno seguro (1–999 999). */
  idEnvio?: number;
}

// ── Body oficial POST /fesv/anulardte ─────────────────────────────

/** Estructura del body enviado a MH. Solo para tipado interno del fetch. */
export interface DteMhInvalidationBody {
  ambiente: "00" | "01";
  idEnvio: number;
  version: number;
  documento: string;
}

// ── Resultados normalizados ───────────────────────────────────────

export interface DteInvalidationTransmissionSuccessResult {
  ok: true;
  /** Estado fiscal MH: "PROCESADO" | "RECHAZADO" | otro */
  mhEstado: string;
  selloRecibido?: string | null;
  codigoMsg?: string | null;
  descripcionMsg?: string | null;
  observaciones?: unknown[] | null;
  httpStatus: number;
  idEnvio: number;
  rawResponse: unknown;
}

export interface DteInvalidationTransmissionErrorResult {
  ok: false;
  errorCode: DteInvalidationAdapterError | string;
  message: string;
  httpStatus?: number;
  rawResponse?: unknown;
}

export type DteInvalidationTransmissionResult =
  | DteInvalidationTransmissionSuccessResult
  | DteInvalidationTransmissionErrorResult;

// ── Códigos de error técnicos ─────────────────────────────────────

export type DteInvalidationAdapterError =
  | "MH_INVALIDATION_AUTH_FAILED"
  | "MH_INVALIDATION_TIMEOUT"
  | "MH_INVALIDATION_UNAVAILABLE"
  | "MH_INVALIDATION_INVALID_RESPONSE"
  | "MH_INVALIDATION_HTTP_ERROR";
