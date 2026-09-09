// commerce/dte — dte-query.adapter.ts
//
// FASE IV-B.1 — Adapter HTTP puro para el Servicio de Consulta DTE.
// Endpoint: POST /fesv/recepcion/consultadte/
//
// Responsabilidad estrictamente HTTP — NUNCA Prisma, NUNCA decide
// estado DteOutgoingDocument, NUNCA toca el ledger de metering. Eso
// vive en dte-reconciliation.service.ts.
//
// Reutiliza MhAuthAdapter tal cual (mismo cache aislado por
// issuerConfigId+environment que ya usa la transmisión).
//
// Seguridad: Authorization, token y NIT completo del request nunca se
// exponen en el resultado normalizado más allá de lo necesario para
// auditoría — `rawResponse` es la respuesta MH, nunca el request.

import { getDteMhConfig, resolveDteMhUrls } from "../config/dte-mh.config";
import { MhAuthAdapter } from "./dte-auth.adapter";
import type {
  DteMhQueryBody,
  DteQueryInput,
  DteQueryResult,
  MhQueryApiResponse,
} from "../types/dte-query.types";

function isMhQueryResponse(v: unknown): v is MhQueryApiResponse {
  return typeof v === "object" && v !== null;
}

/** CAT-001 ambiente esperado en la respuesta según el environment consultado. */
function expectedAmbienteCode(environment: "TEST" | "PRODUCTION"): "00" | "01" {
  return environment === "PRODUCTION" ? "01" : "00";
}

export class MhDteQueryAdapter {
  private readonly authAdapter: MhAuthAdapter;

  constructor(authAdapter?: MhAuthAdapter) {
    this.authAdapter = authAdapter ?? new MhAuthAdapter();
  }

  /**
   * Consulta el estado de un DTE por codigoGeneracion.
   * Garantías: nunca lanza excepción (siempre DteQueryResult), reintenta
   * autenticación una sola vez si MH devuelve 401, no escribe DB.
   */
  async query(input: DteQueryInput): Promise<DteQueryResult> {
    return this._queryWithRetry(input, false);
  }

  private async _queryWithRetry(input: DteQueryInput, isRetry: boolean): Promise<DteQueryResult> {
    const config = getDteMhConfig();
    const { environment } = input;

    const authResult = await this.authAdapter.getCachedToken(environment, input.issuerConfigId);
    if (!authResult.ok) {
      return { kind: "QUERY_TECHNICAL_ERROR", errorCode: "MH_QUERY_AUTH_FAILED", message: authResult.message };
    }
    const authorizationHeader = authResult.authorizationHeader;

    const { queryDteUrl } = resolveDteMhUrls(environment);

    const body: DteMhQueryBody = {
      nitEmisor: input.nitEmisor,
      tdte: input.tdte,
      codigoGeneracion: input.codigoGeneracion,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    let raw: Response;
    try {
      raw = await fetch(queryDteUrl, {
        method: "POST",
        headers: {
          Authorization: authorizationHeader,
          "Content-Type": "application/json",
          "User-Agent": "web-app-gym-dte",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        return { kind: "QUERY_TECHNICAL_ERROR", errorCode: "MH_QUERY_TIMEOUT", message: "MH no respondió en el tiempo configurado." };
      }
      return { kind: "QUERY_TECHNICAL_ERROR", errorCode: "MH_QUERY_UNAVAILABLE", message: "No se pudo conectar con el MH." };
    } finally {
      clearTimeout(timer);
    }

    // Reintento único en 401 (mismo patrón que MhDteTransmissionAdapter).
    if (raw.status === 401 && !isRetry) {
      this.authAdapter.clearTokenCache(environment, input.issuerConfigId);
      return this._queryWithRetry(input, true);
    }
    if (raw.status === 401 && isRetry) {
      return { kind: "QUERY_TECHNICAL_ERROR", errorCode: "MH_QUERY_AUTH_FAILED", message: "MH rechazó la autenticación tras reintento (401).", httpStatus: 401 };
    }

    if (raw.status >= 500) {
      return { kind: "QUERY_TECHNICAL_ERROR", errorCode: "MH_QUERY_HTTP_ERROR", message: `MH respondió con HTTP ${raw.status}.`, httpStatus: raw.status };
    }

    let parsed: unknown;
    try {
      parsed = await raw.json();
    } catch {
      return { kind: "QUERY_TECHNICAL_ERROR", errorCode: "MH_QUERY_INVALID_RESPONSE", message: "Respuesta MH no es JSON válido.", httpStatus: raw.status };
    }

    return this._normalizeResponse(parsed, raw.status, input);
  }

  private _normalizeResponse(parsed: unknown, httpStatus: number, input: DteQueryInput): DteQueryResult {
    if (!isMhQueryResponse(parsed)) {
      return { kind: "QUERY_TECHNICAL_ERROR", errorCode: "MH_QUERY_INVALID_RESPONSE", message: "Respuesta MH tiene estructura inesperada.", httpStatus };
    }

    const estado = parsed.estado ?? "";

    // HTTP 400 + RECHAZADO — respuesta fiscal documentada, pero NO
    // concluyente sobre el destino del DTE original (ver auditoría
    // IV-B, Corrección 1). Fail-closed: nunca CONSUMED por esto.
    if (estado === "RECHAZADO") {
      return {
        kind: "QUERY_REJECTED_OR_ERROR",
        mhEstado: estado,
        codigoMsg: parsed.codigoMsg ?? null,
        descripcionMsg: parsed.descripcionMsg ?? null,
        rawResponse: parsed,
        httpStatus,
      };
    }

    if (estado === "PROCESADO") {
      // FASE IV-B.3 — Corrección empírica: el Manual documenta HTTP 200
      // como ejemplo de éxito, pero MH TEST devolvió HTTP 202 para un
      // consultadte PROCESADO real (09/09/2026, ver docs/modules/
      // platform-phase-4b-dte-query-reconciliation.md). Zolvi acepta
      // cualquier 2xx consistente — nunca exige exactamente 200 — pero
      // tampoco confía ciegamente en `estado` si el HTTP no es de éxito
      // (3xx/4xx/5xx con estado=PROCESADO sería contradictorio).
      const isHttpSuccess = httpStatus >= 200 && httpStatus < 300;
      if (!isHttpSuccess) {
        return {
          kind: "QUERY_INCONSISTENT",
          reason: `estado=PROCESADO pero httpStatus=${httpStatus} no es un código de éxito (2xx) — respuesta contradictoria.`,
          rawResponse: parsed,
          httpStatus,
        };
      }

      // Consistencia: codigoGeneracion (case-insensitive) y ambiente deben coincidir.
      const returnedGen = (parsed.codigoGeneracion ?? "").toUpperCase();
      const expectedGen = input.codigoGeneracion.toUpperCase();
      if (returnedGen !== expectedGen) {
        return {
          kind: "QUERY_INCONSISTENT",
          reason: `codigoGeneracion devuelto ("${parsed.codigoGeneracion}") no coincide con el solicitado ("${input.codigoGeneracion}").`,
          rawResponse: parsed,
          httpStatus,
        };
      }

      const expectedAmbiente = expectedAmbienteCode(input.environment);
      if (parsed.ambiente != null && parsed.ambiente !== expectedAmbiente) {
        return {
          kind: "QUERY_INCONSISTENT",
          reason: `ambiente devuelto ("${parsed.ambiente}") no coincide con el esperado ("${expectedAmbiente}") para environment=${input.environment}.`,
          rawResponse: parsed,
          httpStatus,
        };
      }

      // PROCESADO sin selloRecibido es contradictorio — nunca asumir aceptación.
      const sello = parsed.selloRecibido;
      if (!sello || !sello.trim()) {
        return {
          kind: "QUERY_INCONSISTENT",
          reason: 'estado=PROCESADO pero selloRecibido está vacío/null — no se puede confirmar aceptación fiscal.',
          rawResponse: parsed,
          httpStatus,
        };
      }

      return {
        kind: "QUERY_PROCESSED",
        mhEstado: estado,
        ambiente: parsed.ambiente,
        codigoGeneracion: parsed.codigoGeneracion ?? input.codigoGeneracion,
        selloRecibido: sello,
        fhProcesamiento: parsed.fhProcesamiento ?? null,
        codigoMsg: parsed.codigoMsg ?? null,
        descripcionMsg: parsed.descripcionMsg ?? null,
        observaciones: parsed.observaciones ?? null,
        rawResponse: parsed,
        httpStatus,
      };
    }

    // Cualquier otro estado (incluido HTTP 200 con estado distinto de
    // PROCESADO/RECHAZADO) — no conclusivo, nunca CONSUMED por esto.
    return {
      kind: "QUERY_REJECTED_OR_ERROR",
      mhEstado: estado || null,
      codigoMsg: parsed.codigoMsg ?? null,
      descripcionMsg: parsed.descripcionMsg ?? null,
      rawResponse: parsed,
      httpStatus,
    };
  }
}
