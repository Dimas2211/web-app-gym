// commerce/dte — dte-contingency-transmission.types.ts
//
// Tipos para transmisión del Evento de Contingencia al Ministerio de Hacienda.
// Endpoint: POST /fesv/contingencia
//
// Contrato confirmado en docs/dte-official/extracts/manual-tecnico-firma-transmision.md
// (sección 10 — Contingencia):
//   Body:     { nit, documento }               (NO ambiente/idEnvio/version — wrapper
//                                                distinto al de /fesv/anulardte)
//   Response: { estado, fechaHora, mensaje, selloRecibido, observaciones }

import type { DteMhEnvironment } from "./dte-mh-auth.types";

// Re-export para consumers
export type { DteMhEnvironment };

// ── Input ─────────────────────────────────────────────────────────

export interface DteContingencyTransmissionInput {
  environment?: DteMhEnvironment;
  /** NIT del emisor, sin guiones */
  nit: string;
  /** JWS firmado del Evento de Contingencia */
  signedJws: string;
}

// ── Body oficial POST /fesv/contingencia ──────────────────────────

/** Estructura del body enviado a MH. Solo para tipado interno del fetch. */
export interface DteMhContingencyBody {
  nit: string;
  documento: string;
}

// ── Resultados normalizados ───────────────────────────────────────

export interface DteContingencyTransmissionSuccessResult {
  ok: true;
  /** Estado fiscal MH: "RECIBIDO" | "PROCESADO" | "RECHAZADO" | otro literal MH */
  mhEstado: string;
  fechaHora?: string | null;
  mensaje?: string | null;
  selloRecibido?: string | null;
  observaciones?: unknown[] | null;
  httpStatus: number;
  rawResponse: unknown;
}

export interface DteContingencyTransmissionErrorResult {
  ok: false;
  errorCode: DteContingencyAdapterError | string;
  message: string;
  httpStatus?: number;
  rawResponse?: unknown;
}

export type DteContingencyTransmissionResult =
  | DteContingencyTransmissionSuccessResult
  | DteContingencyTransmissionErrorResult;

// ── Códigos de error técnicos ─────────────────────────────────────

export type DteContingencyAdapterError =
  | "MH_CONTINGENCY_AUTH_FAILED"
  | "MH_CONTINGENCY_TIMEOUT"
  | "MH_CONTINGENCY_UNAVAILABLE"
  | "MH_CONTINGENCY_INVALID_RESPONSE"
  | "MH_CONTINGENCY_HTTP_ERROR";
