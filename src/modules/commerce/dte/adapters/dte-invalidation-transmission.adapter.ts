// commerce/dte — dte-invalidation-transmission.adapter.ts
//
// Adapter HTTP para transmitir un evento de invalidación DTE firmado al MH.
// Endpoint: POST /fesv/anulardte
//
// Body: { ambiente, idEnvio, version, documento }
// No incluye tipoDte ni codigoGeneracion en el wrapper de anulación.
//
// Seguridad:
//   - Authorization, token y signed_jws completo nunca se loguean.
//   - No escribe en DB. No actualiza estados. No toca Prisma.

import { getDteMhConfig }  from "../config/dte-mh.config";
import { MhAuthAdapter }   from "./dte-auth.adapter";
import type {
  DteInvalidationAdapterError,
  DteInvalidationTransmissionErrorResult,
  DteInvalidationTransmissionInput,
  DteInvalidationTransmissionResult,
  DteInvalidationTransmissionSuccessResult,
  DteMhInvalidationBody,
} from "../types/dte-invalidation-transmission.types";

// ── Constantes de URL ─────────────────────────────────────────────

const ANULAR_URL_TEST = "https://apitest.dtes.mh.gob.sv/fesv/anulardte";
const ANULAR_URL_PROD = "https://api.dtes.mh.gob.sv/fesv/anulardte";

// ── Helpers ───────────────────────────────────────────────────────

function toAmbienteCode(env: string): "00" | "01" {
  return env === "PRODUCTION" ? "01" : "00";
}

function generateIdEnvio(): number {
  return Math.floor(Math.random() * 999_999) + 1;
}

function makeError(
  errorCode: DteInvalidationAdapterError | string,
  message: string,
  extras: Partial<DteInvalidationTransmissionErrorResult> = {},
): DteInvalidationTransmissionErrorResult {
  return { ok: false, errorCode, message, ...extras };
}

// ── Raw MH response shape ─────────────────────────────────────────

interface MhAnulacionApiResponse {
  estado?: string;
  selloRecibido?: string | null;
  codigoMsg?: string | null;
  descripcionMsg?: string | null;
  observaciones?: unknown[] | null;
}

function isMhAnulacionResponse(v: unknown): v is MhAnulacionApiResponse {
  return typeof v === "object" && v !== null;
}

// ── Adapter ───────────────────────────────────────────────────────

export class MhInvalidationTransmissionAdapter {
  private readonly authAdapter: MhAuthAdapter;

  constructor(authAdapter?: MhAuthAdapter) {
    this.authAdapter = authAdapter ?? new MhAuthAdapter();
  }

  /**
   * Transmite un evento de invalidación firmado a MH /fesv/anulardte.
   * Nunca lanza excepción — siempre devuelve DteInvalidationTransmissionResult.
   * Reintenta autenticación una sola vez si MH devuelve 401.
   */
  async transmit(
    input: DteInvalidationTransmissionInput,
  ): Promise<DteInvalidationTransmissionResult> {
    return this._transmitWithRetry(input, false);
  }

  // ── Internal ──────────────────────────────────────────────────

  private async _transmitWithRetry(
    input: DteInvalidationTransmissionInput,
    isRetry: boolean,
  ): Promise<DteInvalidationTransmissionResult> {
    const config = getDteMhConfig();
    const env    = input.environment ?? config.environment;

    // 1. Obtener token MH
    const authResult = await this.authAdapter.getCachedToken(env);
    if (!authResult.ok) {
      return makeError("MH_INVALIDATION_AUTH_FAILED", authResult.message);
    }
    const authorizationHeader = authResult.authorizationHeader;

    // 2. Construir URL y body
    const anularUrl =
      env === "PRODUCTION"
        ? (process.env["DTE_MH_ANULAR_URL_PROD"] ?? ANULAR_URL_PROD)
        : (process.env["DTE_MH_ANULAR_URL_TEST"] ?? ANULAR_URL_TEST);

    const ambiente = toAmbienteCode(env);
    const idEnvio  = input.idEnvio ?? generateIdEnvio();
    const version  = input.version ?? 2;

    const body: DteMhInvalidationBody = {
      ambiente,
      idEnvio,
      version,
      documento: input.signedJws,
    };

    // 3. Fetch con timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    let raw: Response;
    try {
      raw = await fetch(anularUrl, {
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
        return makeError("MH_INVALIDATION_TIMEOUT", "MH no respondió en el tiempo configurado.");
      }
      return makeError("MH_INVALIDATION_UNAVAILABLE", "No se pudo conectar con el MH.");
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
        "MH_INVALIDATION_INVALID_RESPONSE",
        "Respuesta MH no es JSON válido.",
        { httpStatus: raw.status },
      );
    }

    // 6. Normalizar respuesta
    return this._normalizeResponse(parsed, raw.status, idEnvio);
  }

  private _normalizeResponse(
    parsed: unknown,
    httpStatus: number,
    idEnvio: number,
  ): DteInvalidationTransmissionResult {
    if (!isMhAnulacionResponse(parsed)) {
      return makeError(
        "MH_INVALIDATION_INVALID_RESPONSE",
        "Respuesta MH tiene estructura inesperada.",
        { httpStatus, rawResponse: parsed },
      );
    }

    const estado = parsed.estado ?? "";

    if (estado === "PROCESADO" || estado === "RECHAZADO" || httpStatus === 200) {
      const success: DteInvalidationTransmissionSuccessResult = {
        ok:            true,
        mhEstado:      estado,
        selloRecibido: parsed.selloRecibido  ?? null,
        codigoMsg:     parsed.codigoMsg      ?? null,
        descripcionMsg: parsed.descripcionMsg ?? null,
        observaciones: parsed.observaciones  ?? null,
        rawResponse:   parsed,
        httpStatus,
        idEnvio,
      };
      return success;
    }

    return makeError(
      "MH_INVALIDATION_HTTP_ERROR",
      `MH respondió con HTTP ${httpStatus}${estado ? ` (${estado})` : ""}.`,
      { httpStatus, rawResponse: parsed },
    );
  }
}
