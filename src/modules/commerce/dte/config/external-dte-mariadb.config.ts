// commerce/dte — external-dte-mariadb.config.ts
//
// Configuración leída exclusivamente desde variables de entorno.
// Nunca hardcodea credenciales ni imprime password.
// Si EXTERNAL_DTE_MARIADB_TABLE o EXTERNAL_DTE_MARIADB_DATABASE no están
// configuradas, el adapter rechaza la operación con error explícito (no hay
// fallback silencioso a ningún nombre de tabla).

import type { ExternalDteMariaDbConfig } from "../types/external-dte-delivery.types";

const DEFAULT_PORT       = 3306;
const DEFAULT_TIMEOUT_MS = 10_000;

function resolvePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveBoolean(raw: string | undefined): boolean {
  return raw?.toLowerCase() === "true";
}

export function getExternalDteMariaDbConfig(): ExternalDteMariaDbConfig {
  return {
    host:              process.env["EXTERNAL_DTE_MARIADB_HOST"]                 ?? "",
    port:              resolvePositiveInt(process.env["EXTERNAL_DTE_MARIADB_PORT"], DEFAULT_PORT),
    user:              process.env["EXTERNAL_DTE_MARIADB_USER"]                 ?? "",
    password:          process.env["EXTERNAL_DTE_MARIADB_PASSWORD"]             ?? "",
    database:          process.env["EXTERNAL_DTE_MARIADB_DATABASE"]             ?? "",
    table:             process.env["EXTERNAL_DTE_MARIADB_TABLE"]                ?? "",
    invalidationTable: process.env["EXTERNAL_DTE_MARIADB_INVALIDATION_TABLE"]   ?? "",
    enabled:           resolveBoolean(process.env["EXTERNAL_DTE_MARIADB_ENABLED"]),
    timeoutMs:         resolvePositiveInt(process.env["EXTERNAL_DTE_MARIADB_TIMEOUT_MS"], DEFAULT_TIMEOUT_MS),
  };
}
