// commerce/dte — dte-mh.config.ts

import type { DteMhEnvironment } from "../types/dte-mh-auth.types";

const AUTH_URL_TEST      = "https://apitest.dtes.mh.gob.sv/seguridad/auth";
const AUTH_URL_PROD      = "https://api.dtes.mh.gob.sv/seguridad/auth";
const RECEPTION_URL_TEST = "https://apitest.dtes.mh.gob.sv/fesv/recepciondte";
const RECEPTION_URL_PROD = "https://api.dtes.mh.gob.sv/fesv/recepciondte";

const DEFAULT_TIMEOUT_MS      = 8_000;
const DEFAULT_TOKEN_CACHE_TTL = 3_000_000; // 50 minutes

export interface DteMhConfig {
  environment: DteMhEnvironment;
  authUrl: string;
  receptionUrl: string;
  user: string | null;
  password: string | null;
  timeoutMs: number;
  tokenCacheTtlMs: number;
}

function resolveEnvironment(): DteMhEnvironment {
  const raw = process.env["DTE_ENVIRONMENT"];
  if (raw === "PRODUCTION") return "PRODUCTION";
  return "TEST"; // safe default
}

function resolvePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getDteMhConfig(): DteMhConfig {
  const environment = resolveEnvironment();

  const authUrl =
    environment === "PRODUCTION"
      ? (process.env["DTE_MH_AUTH_URL_PROD"] ?? AUTH_URL_PROD)
      : (process.env["DTE_MH_AUTH_URL_TEST"] ?? AUTH_URL_TEST);

  const receptionUrl =
    environment === "PRODUCTION"
      ? (process.env["DTE_MH_RECEPTION_URL_PROD"] ?? RECEPTION_URL_PROD)
      : (process.env["DTE_MH_RECEPTION_URL_TEST"] ?? RECEPTION_URL_TEST);

  const user     = process.env["DTE_MH_USER"]     ?? null;
  const password = process.env["DTE_MH_PASSWORD"] ?? null;

  const timeoutMs = resolvePositiveInt(
    process.env["DTE_MH_TIMEOUT_MS"],
    DEFAULT_TIMEOUT_MS,
  );

  const tokenCacheTtlMs = resolvePositiveInt(
    process.env["DTE_MH_TOKEN_CACHE_TTL_MS"],
    DEFAULT_TOKEN_CACHE_TTL,
  );

  return { environment, authUrl, receptionUrl, user, password, timeoutMs, tokenCacheTtlMs };
}
