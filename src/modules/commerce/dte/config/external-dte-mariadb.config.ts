// commerce/dte — external-dte-mariadb.config.ts
//
// Configuración leída exclusivamente desde variables de entorno.
// Nunca hardcodea credenciales ni imprime password.

import type { ExternalDteMariaDbConfig } from "../types/external-dte-delivery.types";

const DEFAULT_PORT       = 3306;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_DATABASE   = "tecnicodhcp_db_fe";
const DEFAULT_TABLE      = "dtes_cit";

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
    database:          process.env["EXTERNAL_DTE_MARIADB_DATABASE"]             ?? DEFAULT_DATABASE,
    table:             process.env["EXTERNAL_DTE_MARIADB_TABLE"]                ?? DEFAULT_TABLE,
    invalidationTable: process.env["EXTERNAL_DTE_MARIADB_INVALIDATION_TABLE"]   ?? "",
    enabled:           resolveBoolean(process.env["EXTERNAL_DTE_MARIADB_ENABLED"]),
    timeoutMs:         resolvePositiveInt(process.env["EXTERNAL_DTE_MARIADB_TIMEOUT_MS"], DEFAULT_TIMEOUT_MS),
  };
}
