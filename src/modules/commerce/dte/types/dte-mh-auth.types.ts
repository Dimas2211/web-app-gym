// commerce/dte — dte-mh-auth.types.ts

export type DteMhEnvironment = "TEST" | "PRODUCTION";

// ── Input ─────────────────────────────────────────────────────────

export interface DteMhAuthInput {
  environment?: DteMhEnvironment;
  /**
   * DteIssuerConfig.id del emisor que autentica. Determina qué
   * DteCredential se usa y aísla el cache de token por emisor
   * (ver dte-auth.adapter.ts). Opcional por compatibilidad con
   * llamadas existentes (dev scripts, invalidación/contingencia)
   * que todavía no lo pasan — en ese caso se usa el fallback TEST
   * de .env (nunca en PRODUCTION).
   */
  issuerConfigId?: string;
  user?: string;
  password?: string;
}

// ── Results ───────────────────────────────────────────────────────

export interface DteMhAuthSuccessResult {
  ok: true;
  token: string;
  tokenType: "Bearer";
  authorizationHeader: string;
  expiresAt: Date;
}

export interface DteMhAuthErrorResult {
  ok: false;
  errorCode: DteMhAuthAdapterError | string;
  message: string;
  httpStatus?: number;
}

export type DteMhAuthResult = DteMhAuthSuccessResult | DteMhAuthErrorResult;

// ── Token cache ───────────────────────────────────────────────────

export interface DteMhTokenCacheEntry {
  token: string;
  authorizationHeader: string;
  /** Unix timestamp ms when the entry expires */
  expiresAt: number;
}

// ── Adapter error codes ───────────────────────────────────────────

export type DteMhAuthAdapterError =
  | "MH_AUTH_CONFIG_ERROR"
  | "MH_AUTH_TIMEOUT"
  | "MH_AUTH_UNAVAILABLE"
  | "MH_AUTH_HTTP_ERROR"
  | "MH_AUTH_INVALID_RESPONSE"
  | "MH_AUTH_REJECTED";

// ── Raw MH API response shapes ────────────────────────────────────

/** Response when status === "OK" */
export interface MhAuthApiSuccess {
  status: "OK";
  body: {
    user?: string;
    token: string;
    tokenType?: string;
    token_type?: string;
  };
}

/** Response when status === "ERROR" */
export interface MhAuthApiError {
  status: "ERROR" | string;
  error?: string;
  message?: string;
}

export type MhAuthApiResponse = MhAuthApiSuccess | MhAuthApiError;
