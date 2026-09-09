// commerce/dte — dte-query.types.ts
//
// FASE IV-B.1 — Tipos para el Servicio de Consulta DTE.
// Endpoint: POST /fesv/recepcion/consultadte/
//
// El adapter normaliza la respuesta MH pero NUNCA decide el estado
// Prisma final ni el ledger de metering — eso vive en
// dte-reconciliation.service.ts.
//
// QUERY_NOT_FOUND existe como categoría RESERVADA — ningún código de
// este adapter produce este resultado todavía. La auditoría IV-B
// confirmó que el Manual Técnico y el Catálogo oficial (versión 1.2,
// 10/2025) disponibles en este proyecto NO documentan un codigoMsg
// inequívoco para "codigoGeneracion no encontrado/no recibido". Si en
// el futuro aparece evidencia oficial o empírica aprobada, se activa
// el mapping — mientras tanto, cualquier RECHAZADO de consulta cae en
// QUERY_REJECTED_OR_ERROR (fail-closed, nunca libera ledger).

import type { DteMhEnvironment } from "./dte-mh-auth.types";

export type { DteMhEnvironment };

// ── Input ─────────────────────────────────────────────────────────

export interface DteQueryInput {
  /** Ambiente destino — SIEMPRE el de DteOutgoingDocument.environment, nunca global. */
  environment: DteMhEnvironment;
  /** Determina credenciales/cache de token (ver dte-auth.adapter.ts). */
  issuerConfigId?: string;
  /** NIT del emisor, YA normalizado (solo dígitos) por el caller — nunca desde browser/env global. */
  nitEmisor: string;
  /** CAT-002 tipo de documento ("01", "03", "05", "14", ...). */
  tdte: string;
  /** codigoGeneracion del DteOutgoingDocument a consultar. */
  codigoGeneracion: string;
}

// ── Body oficial POST /fesv/recepcion/consultadte/ ─────────────────

export interface DteMhQueryBody {
  nitEmisor: string;
  tdte: string;
  codigoGeneracion: string;
}

// ── Raw response shape (manual-tecnico-firma-transmision.md, §8) ──

export interface MhQueryApiResponse {
  version?: number;
  ambiente?: string;
  versionApp?: number;
  estado?: string;
  codigoGeneracion?: string;
  selloRecibido?: string | null;
  fhProcesamiento?: string | null;
  clasificaMsg?: string | null;
  codigoMsg?: string | null;
  descripcionMsg?: string | null;
  observaciones?: unknown[] | null;
}

// ── Resultado normalizado ───────────────────────────────────────────

export interface DteQueryProcessedResult {
  kind: "QUERY_PROCESSED";
  mhEstado: string;
  ambiente: string | undefined;
  codigoGeneracion: string;
  selloRecibido: string;
  fhProcesamiento: string | null;
  codigoMsg: string | null;
  descripcionMsg: string | null;
  observaciones: unknown[] | null;
  /** Respuesta MH cruda (sin Authorization/token). */
  rawResponse: unknown;
  httpStatus: number;
}

export interface DteQueryRejectedOrErrorResult {
  kind: "QUERY_REJECTED_OR_ERROR";
  mhEstado: string | null;
  codigoMsg: string | null;
  descripcionMsg: string | null;
  rawResponse: unknown;
  httpStatus: number;
}

/**
 * RESERVADO — ningún código produce este kind todavía (ver comentario
 * de archivo). Definido para no rediseñar el tipo el día que exista
 * evidencia oficial/empírica aprobada.
 */
export interface DteQueryNotFoundResult {
  kind: "QUERY_NOT_FOUND";
  codigoMsg: string | null;
  descripcionMsg: string | null;
  rawResponse: unknown;
  httpStatus: number;
}

export type DteQueryTechnicalErrorCode =
  | "MH_QUERY_AUTH_FAILED"
  | "MH_QUERY_TIMEOUT"
  | "MH_QUERY_UNAVAILABLE"
  | "MH_QUERY_INVALID_RESPONSE"
  | "MH_QUERY_HTTP_ERROR";

export interface DteQueryTechnicalErrorResult {
  kind: "QUERY_TECHNICAL_ERROR";
  errorCode: DteQueryTechnicalErrorCode;
  message: string;
  httpStatus?: number;
}

export interface DteQueryInconsistentResult {
  kind: "QUERY_INCONSISTENT";
  reason: string;
  rawResponse: unknown;
  httpStatus: number;
}

export type DteQueryResult =
  | DteQueryProcessedResult
  | DteQueryRejectedOrErrorResult
  | DteQueryNotFoundResult
  | DteQueryTechnicalErrorResult
  | DteQueryInconsistentResult;
