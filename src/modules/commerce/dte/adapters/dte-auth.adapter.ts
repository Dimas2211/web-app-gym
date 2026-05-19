// commerce/dte — dte-auth.adapter.ts
//
// Adapter de autenticación contra el Ministerio de Hacienda El Salvador.
// Endpoint: POST /seguridad/auth
//
// Comportamiento:
//   1. Devuelve token desde cache si está vigente.
//   2. Si no hay token o expiró, llama al MH y almacena en cache.
//   3. clearTokenCache() invalida el cache (usar cuando MH devuelva 401 en transmisión).
//
// Seguridad: password, token completo y Authorization nunca se loguean.

import { getDteMhConfig } from "../config/dte-mh.config";
import type {
  DteMhAuthInput,
  DteMhAuthResult,
  DteMhEnvironment,
  DteMhTokenCacheEntry,
  MhAuthApiResponse,
  MhAuthApiSuccess,
} from "../types/dte-mh-auth.types";

// ── Token cache in-memory ─────────────────────────────────────────
// Key: environment string. Lost on Vercel cold-start — acceptable for V1.

const tokenCache = new Map<string, DteMhTokenCacheEntry>();

function isCacheValid(entry: DteMhTokenCacheEntry): boolean {
  return Date.now() < entry.expiresAt;
}

// ── Response type guards ──────────────────────────────────────────

function isMhApiResponse(value: unknown): value is MhAuthApiResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof (value as Record<string, unknown>)["status"] === "string"
  );
}

function isSuccessResponse(res: MhAuthApiResponse): res is MhAuthApiSuccess {
  return (
    res.status === "OK" &&
    "body" in res &&
    typeof (res as MhAuthApiSuccess).body?.token === "string"
  );
}

// ── Token normalization ───────────────────────────────────────────
// MH may return "Bearer eyJ..." or just "eyJ...". Normalize to "Bearer <token>".

function normalizeAuthHeader(rawToken: string): { clean: string; header: string } {
  const clean = rawToken.startsWith("Bearer ")
    ? rawToken.slice(7).trim()
    : rawToken.trim();
  return { clean, header: `Bearer ${clean}` };
}

// ── Adapter ───────────────────────────────────────────────────────

export class MhAuthAdapter {
  /**
   * Returns a valid cached token or authenticates against MH.
   * Input fields override env config when provided.
   */
  async getCachedToken(environment?: DteMhEnvironment): Promise<DteMhAuthResult> {
    const config = getDteMhConfig();
    const env = environment ?? config.environment;
    const cached = tokenCache.get(env);

    if (cached && isCacheValid(cached)) {
      return {
        ok: true,
        token: cached.token,
        tokenType: "Bearer",
        authorizationHeader: cached.authorizationHeader,
        expiresAt: new Date(cached.expiresAt),
      };
    }

    return this.authenticate({ environment: env });
  }

  /**
   * Authenticates against MH /seguridad/auth and caches the token.
   * Returns DteMhAuthResult (never throws).
   */
  async authenticate(input: DteMhAuthInput = {}): Promise<DteMhAuthResult> {
    const config = getDteMhConfig();
    const env      = input.environment ?? config.environment;
    const user     = input.user     ?? config.user;
    const password = input.password ?? config.password;

    if (!user || !password) {
      return {
        ok: false,
        errorCode: "MH_AUTH_CONFIG_ERROR",
        message: "Credenciales MH no configuradas.",
      };
    }

    const authUrl =
      env === "PRODUCTION"
        ? (process.env["DTE_MH_AUTH_URL_PROD"] ?? "https://api.dtes.mh.gob.sv/seguridad/auth")
        : (process.env["DTE_MH_AUTH_URL_TEST"] ?? "https://apitest.dtes.mh.gob.sv/seguridad/auth");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    let raw: Response;
    try {
      raw = await fetch(authUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ user, pwd: password }).toString(),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, errorCode: "MH_AUTH_TIMEOUT", message: "MH no respondió en el tiempo configurado." };
      }
      return { ok: false, errorCode: "MH_AUTH_UNAVAILABLE", message: "No se pudo conectar con el MH." };
    } finally {
      clearTimeout(timer);
    }

    if (!raw.ok && raw.status !== 401) {
      return {
        ok: false,
        errorCode: "MH_AUTH_HTTP_ERROR",
        message: `MH respondió con HTTP ${raw.status}.`,
        httpStatus: raw.status,
      };
    }

    let parsed: unknown;
    try {
      parsed = await raw.json();
    } catch {
      return {
        ok: false,
        errorCode: "MH_AUTH_INVALID_RESPONSE",
        message: "Respuesta MH no es JSON válido.",
        httpStatus: raw.status,
      };
    }

    if (!isMhApiResponse(parsed)) {
      return {
        ok: false,
        errorCode: "MH_AUTH_INVALID_RESPONSE",
        message: "Respuesta MH tiene estructura inesperada.",
        httpStatus: raw.status,
      };
    }

    if (isSuccessResponse(parsed)) {
      const { clean, header } = normalizeAuthHeader(parsed.body.token);
      const expiresAt = Date.now() + config.tokenCacheTtlMs;

      tokenCache.set(env, {
        token: clean,
        authorizationHeader: header,
        expiresAt,
      });

      return {
        ok: true,
        token: clean,
        tokenType: "Bearer",
        authorizationHeader: header,
        expiresAt: new Date(expiresAt),
      };
    }

    // status !== "OK" — MH rejected credentials or returned error
    const rejected = parsed as { error?: string; message?: string };
    return {
      ok: false,
      errorCode: "MH_AUTH_REJECTED",
      message: rejected.message ?? rejected.error ?? "MH rechazó la autenticación.",
      httpStatus: raw.status,
    };
  }

  /**
   * Invalidates the token cache for the given environment (or current env).
   * Call this when MH returns 401 during document transmission.
   */
  clearTokenCache(environment?: DteMhEnvironment): void {
    const config = getDteMhConfig();
    const env = environment ?? config.environment;
    tokenCache.delete(env);
  }
}
