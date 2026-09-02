// commerce/dte — dte-signer.config.ts

import type { DteMhEnvironment } from "../types/dte-mh-auth.types";

export interface DteSignerConfig {
  signerUrl:  string;
  timeoutMs:  number;
  healthUrl:  string;
  /**
   * DTE_SIGNER_API_KEY — clave compartida exigida por el firmador
   * detrás de Apache/cPanel en el VPS (header X-DTE-Signer-Key).
   * undefined si la variable no está configurada; nunca se loguea.
   */
  apiKey?: string;
}

// Error explícito de configuración — nunca se resuelve con fallback
// silencioso entre ambientes. Si falta la URL del ambiente pedido, esto
// se lanza y el caller (signDteDocument, etc.) debe propagarlo como
// fallo de negocio, no adivinar un signer distinto.
export class DteSignerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DteSignerConfigError";
  }
}

function resolveHealthUrl(signerUrl: string): string {
  const base = signerUrl.endsWith("/") ? signerUrl : `${signerUrl}/`;
  return `${base}status`;
}

function resolvePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveTimeoutMs(): number {
  return resolvePositiveInt(process.env["DTE_SIGNER_TIMEOUT_MS"], 10_000);
}

// VPS-SIGNER-APIKEY — el firmador detrás de Apache/cPanel exige el
// header X-DTE-Signer-Key en cada request. Ausencia de la variable no
// es un error de configuración: mantiene compatible el uso local sin
// protección. Se resuelve igual para TEST y PRODUCTION (una sola clave
// compartida a nivel de proceso, no por ambiente).
function resolveApiKey(): string | undefined {
  const raw = process.env["DTE_SIGNER_API_KEY"]?.trim();
  return raw ? raw : undefined;
}

// ── Resolución por ambiente — fuente única de verdad ────────────────
//
// FSE14-DUAL-SIGNER — antes de esta función, todo el módulo firmaba
// siempre contra un único DTE_SIGNER_URL global (dte-signer.adapter.ts
// lo resolvía internamente), sin importar el `environment` real del
// DteOutgoingDocument que se estaba firmando. Eso permitía que un DTE
// TEST fuera firmado accidentalmente con el signer/certificado de
// PRODUCTION (o viceversa) con solo cambiar DTE_SIGNER_URL en el
// entorno del proceso. resolveDteSignerConfig(environment) es ahora la
// única forma soportada de obtener la config del firmador: exige el
// ambiente explícito del documento, nunca UI ni env global, y falla
// explícitamente si falta la URL del ambiente pedido — sin fallback
// cruzado TEST↔PRODUCTION.
export function resolveDteSignerConfig(environment: DteMhEnvironment): DteSignerConfig {
  const envVarName =
    environment === "PRODUCTION" ? "DTE_SIGNER_URL_PRODUCTION" : "DTE_SIGNER_URL_TEST";

  const signerUrl = process.env[envVarName];

  if (!signerUrl) {
    throw new DteSignerConfigError(
      `No hay firmador configurado para el ambiente ${environment}. ` +
      `Defina ${envVarName} en las variables de entorno del proceso.`,
    );
  }

  return buildDteSignerConfig(signerUrl);
}

// ── SIGNERPROFILE-MULTITENANT ────────────────────────────────────────
//
// Construye un DteSignerConfig a partir de una signerUrl explícita (por
// ejemplo, la guardada por emisor en DteCredential.encrypted_payload vía
// resolveDteSignerConfigForIssuer en dte-credential.service.ts), en lugar
// de resolverla desde DTE_SIGNER_URL_TEST/PRODUCTION.
//
// apiKey es opcional: si el emisor no tiene su propia clave configurada,
// cae al DTE_SIGNER_API_KEY global de proceso (mismo comportamiento que
// resolveDteSignerConfig). timeoutMs siempre viene de DTE_SIGNER_TIMEOUT_MS
// global — no forma parte del payload por-emisor en este bloque.
//
// Pura y sin fallback cruzado de ambiente: quien llama ya decidió la
// signerUrl correcta para el ambiente que corresponde.
export function buildDteSignerConfig(signerUrl: string, apiKey?: string): DteSignerConfig {
  return {
    signerUrl,
    timeoutMs: resolveTimeoutMs(),
    healthUrl: resolveHealthUrl(signerUrl),
    apiKey:    apiKey ?? resolveApiKey(),
  };
}

// Resumen seguro para logs — nunca imprime apiKey, solo si está configurada.
// Usado por resolveDteSignerConfigForIssuer para dejar trazabilidad de qué
// firmador se resolvió (origen, host/ruta, timeout) sin exponer secretos.
export function summarizeDteSignerConfigForLog(config: DteSignerConfig, source: string): string {
  let hostPath = "(url no parseable)";
  try {
    const u = new URL(config.signerUrl);
    hostPath = `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    // deja el valor por defecto — nunca lanzar desde una función de logging
  }
  return (
    `[dte-signer] source=${source} url=${hostPath} ` +
    `apiKey=${config.apiKey ? "configurada" : "no configurada"} timeoutMs=${config.timeoutMs}`
  );
}

// ── DEPRECATED ────────────────────────────────────────────────────
//
// getDteSignerConfig() resuelve un único DTE_SIGNER_URL global, sin
// noción de ambiente. Se mantiene solo por compatibilidad histórica
// (scripts dev antiguos, lectura directa de .env). Ningún flujo de
// firma real (signDteDocument, signContingencyEvent,
// signInvalidationEvent, support-dte-sign-runner) debe depender de
// esta función — todos usan resolveDteSignerConfig(environment).
/** @deprecated Usar resolveDteSignerConfig(environment). No tiene noción de ambiente TEST/PRODUCTION. */
export function getDteSignerConfig(): DteSignerConfig {
  const signerUrl =
    process.env["DTE_SIGNER_URL"] ?? "http://localhost:8113/firmardocumento/";

  return {
    signerUrl,
    timeoutMs: resolveTimeoutMs(),
    healthUrl: resolveHealthUrl(signerUrl),
    apiKey:    resolveApiKey(),
  };
}
