// commerce/dte — dte-contingency-transmission.adapter.ts
//
// Adapter HTTP para transmitir un Evento de Contingencia firmado al MH.
// Endpoint: POST /fesv/contingencia
//
// Body: { nit, documento } — wrapper distinto al de /fesv/anulardte
// (NO incluye ambiente, idEnvio ni version; confirmado contra
// docs/dte-official/extracts/manual-tecnico-firma-transmision.md §10).
//
// Seguridad:
//   - Authorization, token y signed_jws completo nunca se loguean.
//   - No escribe en DB. No actualiza estados. No toca Prisma.

import { getDteMhConfig }  from "../config/dte-mh.config";
import { MhAuthAdapter }   from "./dte-auth.adapter";
import type {
  DteContingencyAdapterError,
  DteContingencyTransmissionErrorResult,
  DteContingencyTransmissionInput,
  DteContingencyTransmissionResult,
  DteContingencyTransmissionSuccessResult,
  DteMhContingencyBody,
} from "../types/dte-contingency-transmission.types";

// ── Constantes de URL ─────────────────────────────────────────────

const CONTINGENCIA_URL_TEST = "https://apitest.dtes.mh.gob.sv/fesv/contingencia";
const CONTINGENCIA_URL_PROD = "https://api.dtes.mh.gob.sv/fesv/contingencia";

// ── Helpers ───────────────────────────────────────────────────────

function makeError(
  errorCode: DteContingencyAdapterError | string,
  message: string,
  extras: Partial<DteContingencyTransmissionErrorResult> = {},
): DteContingencyTransmissionErrorResult {
  return { ok: false, errorCode, message, ...extras };
}

// ── Raw MH response shape ─────────────────────────────────────────
// Confirmado en el manual: estado, fechaHora, mensaje, selloRecibido, observaciones.

interface MhContingenciaApiResponse {
  estado?: string;
  fechaHora?: string | null;
  mensaje?: string | null;
  selloRecibido?: string | null;
  observaciones?: unknown[] | null;
}

function isMhContingenciaResponse(v: unknown): v is MhContingenciaApiResponse {
  return typeof v === "object" && v !== null;
}

// ── Adapter ───────────────────────────────────────────────────────

export class MhContingencyTransmissionAdapter {
  private readonly authAdapter: MhAuthAdapter;

  constructor(authAdapter?: MhAuthAdapter) {
    this.authAdapter = authAdapter ?? new MhAuthAdapter();
  }

  /**
   * Transmite un Evento de Contingencia firmado a MH /fesv/contingencia.
   * Nunca lanza excepción — siempre devuelve DteContingencyTransmissionResult.
   * Reintenta autenticación una sola vez si MH devuelve 401.
   */
  async transmit(
    input: DteContingencyTransmissionInput,
  ): Promise<DteContingencyTransmissionResult> {
    return this._transmitWithRetry(input, false);
  }

  // ── Internal ──────────────────────────────────────────────────

  private async _transmitWithRetry(
    input: DteContingencyTransmissionInput,
    isRetry: boolean,
  ): Promise<DteContingencyTransmissionResult> {
    const config = getDteMhConfig();
    const env    = input.environment ?? config.environment;

    // 1. Obtener token MH
    const authResult = await this.authAdapter.getCachedToken(env);
    if (!authResult.ok) {
      return makeError("MH_CONTINGENCY_AUTH_FAILED", authResult.message);
    }
    const authorizationHeader = authResult.authorizationHeader;

    // 2. Construir URL y body — SOLO { nit, documento }
    const contingenciaUrl =
      env === "PRODUCTION"
        ? (process.env["DTE_MH_CONTINGENCIA_URL_PROD"] ?? CONTINGENCIA_URL_PROD)
        : (process.env["DTE_MH_CONTINGENCIA_URL_TEST"] ?? CONTINGENCIA_URL_TEST);

    const body: DteMhContingencyBody = {
      nit:       input.nit,
      documento: input.signedJws,
    };

    // 3. Fetch con timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    let raw: Response;
    try {
      raw = await fetch(contingenciaUrl, {
        method:  "POST",
        headers: {
          Authorization:  authorizationHeader,
          "Content-Type": "application/json",
          "User-Agent":   "web-app-gym-dte",
        },
        body:   JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        return makeError("MH_CONTINGENCY_TIMEOUT", "MH no respondió en el tiempo configurado.");
      }
      return makeError("MH_CONTINGENCY_UNAVAILABLE", "No se pudo conectar con el MH.");
    } finally {
      clearTimeout(timer);
    }

    // 4. Reintento único en 401
    if (raw.status === 401 && !isRetry) {
      this.authAdapter.clearTokenCache(env);
      return this._transmitWithRetry(input, true);
    }

    // 5. Parsear JSON
    let parsed: unknown;
    try {
      parsed = await raw.json();
    } catch {
      return makeError(
        "MH_CONTINGENCY_INVALID_RESPONSE",
        "Respuesta MH no es JSON válido.",
        { httpStatus: raw.status },
      );
    }

    // 6. Normalizar respuesta
    return this._normalizeResponse(parsed, raw.status);
  }

  private _normalizeResponse(
    parsed: unknown,
    httpStatus: number,
  ): DteContingencyTransmissionResult {
    if (!isMhContingenciaResponse(parsed)) {
      return makeError(
        "MH_CONTINGENCY_INVALID_RESPONSE",
        "Respuesta MH tiene estructura inesperada.",
        { httpStatus, rawResponse: parsed },
      );
    }

    const estado = parsed.estado ?? "";

    if (httpStatus === 200 || estado) {
      const success: DteContingencyTransmissionSuccessResult = {
        ok:            true,
        mhEstado:      estado,
        fechaHora:     parsed.fechaHora     ?? null,
        mensaje:       parsed.mensaje       ?? null,
        selloRecibido: parsed.selloRecibido ?? null,
        observaciones: parsed.observaciones ?? null,
        rawResponse:   parsed,
        httpStatus,
      };
      return success;
    }

    return makeError(
      "MH_CONTINGENCY_HTTP_ERROR",
      `MH respondió con HTTP ${httpStatus}${estado ? ` (${estado})` : ""}.`,
      { httpStatus, rawResponse: parsed },
    );
  }
}
