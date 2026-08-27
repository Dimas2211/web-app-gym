// commerce/dte — dte-transmission.adapter.ts
//
// Adapter HTTP para transmitir un DTE firmado al Ministerio de Hacienda.
// Endpoint: POST /fesv/recepciondte
//
// Flujo principal:
//   signed_jws → token MH → POST /fesv/recepciondte → DteTransmissionResult
//
// Seguridad:
//   - Authorization, token y signed_jws completo nunca se loguean.
//   - rawResponse no incluye datos sensibles del request.
//   - No escribe en DB. No actualiza estados. No toca Prisma.

import { getDteMhConfig, resolveDteMhUrls } from "../config/dte-mh.config";
import { MhAuthAdapter } from "./dte-auth.adapter";
import type {
  DteTransmissionAdapterError,
  DteTransmissionDebugInfo,
  DteTransmissionErrorResult,
  DteTransmissionInput,
  DteTransmissionResult,
  DteTransmissionSuccessResult,
  DteMhAmbienteCode,
  DteMhReceptionBody,
} from "../types/dte-transmission.types";

// ── Helpers ───────────────────────────────────────────────────────

function toAmbienteCode(env: string): DteMhAmbienteCode {
  return env === "PRODUCTION" ? "01" : "00";
}

/**
 * Genera un idEnvio pseudo-aleatorio dentro del rango 1-999 999.
 * Suficiente para V1 donde no hay correlativo persistido por sesión.
 */
function generateIdEnvio(): number {
  return Math.floor(Math.random() * 999_999) + 1;
}

function makeError(
  errorCode: DteTransmissionAdapterError | string,
  message: string,
  extras: Partial<DteTransmissionErrorResult> = {},
): DteTransmissionErrorResult {
  return { ok: false, errorCode, message, ...extras };
}

// ── Raw MH response shape ─────────────────────────────────────────
// Tipado parcial; el adapter solo consume los campos necesarios.

interface MhReceptionApiResponse {
  estado?: string;
  codigoGeneracion?: string;
  selloRecibido?: string | null;
  fhProcesamiento?: string | null;
  codigoMsg?: string | null;
  descripcionMsg?: string | null;
  observaciones?: unknown[] | null;
}

function isMhReceptionResponse(v: unknown): v is MhReceptionApiResponse {
  return typeof v === "object" && v !== null;
}

// ── Adapter ───────────────────────────────────────────────────────

export class MhDteTransmissionAdapter {
  private readonly authAdapter: MhAuthAdapter;

  constructor(authAdapter?: MhAuthAdapter) {
    this.authAdapter = authAdapter ?? new MhAuthAdapter();
  }

  /**
   * Transmite un DTE firmado a MH y devuelve la respuesta normalizada.
   *
   * Garantías:
   *  - Nunca lanza excepción: siempre devuelve DteTransmissionResult.
   *  - Reintenta autenticación una sola vez si MH devuelve 401.
   *  - No escribe en ninguna base de datos.
   */
  async transmit(input: DteTransmissionInput): Promise<DteTransmissionResult> {
    return this._transmitWithRetry(input, false);
  }

  // ── Internal ──────────────────────────────────────────────────

  private async _transmitWithRetry(
    input: DteTransmissionInput,
    isRetry: boolean,
  ): Promise<DteTransmissionResult> {
    const config = getDteMhConfig();
    const env = input.environment ?? config.environment;

    // 1. Obtener token MH (cache o autenticación nueva) — aislado por
    // issuerConfigId además de environment (ver dte-auth.adapter.ts).
    const authResult = await this.authAdapter.getCachedToken(env, input.issuerConfigId);
    if (!authResult.ok) {
      return makeError("MH_TRANSMISSION_AUTH_FAILED", authResult.message);
    }
    const authorizationHeader = authResult.authorizationHeader;

    // 2. Construir URL y body — resolución centralizada (evita el bug
    // latente donde el fallback dependía de DTE_ENVIRONMENT global en
    // vez del `env` real del documento; ver dte-mh.config.ts).
    const { receptionUrl } = resolveDteMhUrls(env);

    const ambiente = toAmbienteCode(env);
    const idEnvio  = input.idEnvio ?? generateIdEnvio();

    const body: DteMhReceptionBody = {
      ambiente,
      idEnvio,
      version: input.version,
      tipoDte: input.dteTypeCode,
      documento: input.signedJws,
      codigoGeneracion: input.codigoGeneracion,
    };

    // Debug info sin datos sensibles
    const _debug: DteTransmissionDebugInfo = {
      ambiente,
      idEnvio,
      version: input.version,
      tipoDte: input.dteTypeCode,
      codigoGeneracion: input.codigoGeneracion,
      documentoLength: input.signedJws.length,
    };
    void _debug; // disponible para instrumentación futura

    // 3. Fetch con timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    let raw: Response;
    try {
      raw = await fetch(receptionUrl, {
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
        return makeError("MH_TRANSMISSION_TIMEOUT", "MH no respondió en el tiempo configurado.");
      }
      return makeError("MH_TRANSMISSION_UNAVAILABLE", "No se pudo conectar con el MH.");
    } finally {
      clearTimeout(timer);
    }

    // 4. Reintento único en 401
    if (raw.status === 401 && !isRetry) {
      this.authAdapter.clearTokenCache(env, input.issuerConfigId);
      return this._transmitWithRetry(input, true);
    }

    // 5. Parsear JSON
    let parsed: unknown;
    try {
      parsed = await raw.json();
    } catch {
      return makeError(
        "MH_TRANSMISSION_INVALID_RESPONSE",
        "Respuesta MH no es JSON válido.",
        { httpStatus: raw.status },
      );
    }

    // 6. Normalizar respuesta fiscal
    return this._normalizeResponse(parsed, raw.status, idEnvio);
  }

  private _normalizeResponse(
    parsed: unknown,
    httpStatus: number,
    idEnvio: number,
  ): DteTransmissionResult {
    if (!isMhReceptionResponse(parsed)) {
      return makeError(
        "MH_TRANSMISSION_INVALID_RESPONSE",
        "Respuesta MH tiene estructura inesperada.",
        { httpStatus, rawResponse: parsed },
      );
    }

    const estado = parsed.estado ?? "";

    // HTTP 400 con estado RECHAZADO es una respuesta fiscal válida (no fallo técnico).
    // HTTP 200 con PROCESADO o PROCESADO CON OBSERVACIONES también ok:true.
    if (estado === "PROCESADO" || estado === "RECHAZADO" || httpStatus === 200) {
      const success: DteTransmissionSuccessResult = {
        ok: true,
        mhEstado: estado,
        codigoGeneracion: parsed.codigoGeneracion,
        selloRecibido:    parsed.selloRecibido    ?? null,
        fhProcesamiento:  parsed.fhProcesamiento  ?? null,
        codigoMsg:        parsed.codigoMsg        ?? null,
        descripcionMsg:   parsed.descripcionMsg   ?? null,
        observaciones:    parsed.observaciones    ?? null,
        rawResponse:      parsed,
        httpStatus,
        idEnvio,
      };
      return success;
    }

    // Cualquier otro HTTP no esperado
    return makeError(
      "MH_TRANSMISSION_HTTP_ERROR",
      `MH respondió con HTTP ${httpStatus}${estado ? ` (${estado})` : ""}.`,
      { httpStatus, rawResponse: parsed },
    );
  }
}
