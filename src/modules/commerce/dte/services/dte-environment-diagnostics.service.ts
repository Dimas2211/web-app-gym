// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-environment-diagnostics.service.ts
//
// "Probar conexión y firma" por ambiente (/dashboard/settings/dte).
//
// Ejecuta DOS comprobaciones independientes para el emisor
// (tenant + location + environment) resuelto en servidor:
//
//   1. AUTENTICACIÓN MH — POST real a /seguridad/auth del ambiente pedido
//      (resolveDteMhUrls), con el usuario/contraseña API PROPIOS del
//      emisor. Deliberadamente NO usa MhAuthAdapter: ese adapter
//      devuelve tokens cacheados y, en TEST, cae a DTE_MH_USER/PASSWORD
//      globales. Aquí: sin caché, sin fallback global, una sola
//      solicitud, sin reintentos; el token recibido se descarta.
//
//   2. FIRMA — POST real al firmador del emisor (signerUrl/NIT/contraseña
//      privada/API Key propios, mismo contrato que MhHttpDteSignerAdapter)
//      con un JSON de diagnóstico generado en memoria, que NO es un DTE:
//      sin numeroControl, sin codigoGeneracion, sin datos de clientes ni
//      ventas. Se valida estructura JWS compacta y que el payload firmado
//      sea exactamente el JSON enviado; luego se descarta. La validez
//      criptográfica NO se verifica (no hay certificado público del
//      emisor disponible en la plataforma) y el resultado lo declara.
//
// Nunca crea documentos, no reserva correlativos, no transmite a
// recepción/invalidación/contingencia, no entrega a MariaDB, no cambia
// credenciales ni estados (READY_*, ACCEPTED, is_active).
//
// Nunca devuelve ni loguea contraseñas, API Keys, tokens, Authorization
// ni el JWS. Textos externos pasan por lista explícita de campos +
// saneamiento (sanitizeExternalText).
// ─────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { getDteMhConfig, resolveDteMhUrls } from "../config/dte-mh.config";
import { decryptDteCredentialPayload, type DteCredentialPayload } from "../lib/dte-credential-encryption";
import type { DteMhEnvironment } from "../types/dte-mh-auth.types";

// Mismo valor que dte-credential.service.ts (CREDENTIAL_TYPE) — un único
// registro cifrado por DteIssuerConfig.
const CREDENTIAL_TYPE = "MH_CREDENTIALS";

// Misma regla que upsertDteCredential: solo se admite la URL completa del
// endpoint /firmardocumento/ ya validada al guardar la credencial.
const SIGNER_URL_RE = /^https?:\/\/[^\s]+\/firmardocumento\/?$/i;

const MAX_TIMEOUT_MS = 15_000;
const DEFAULT_SIGNER_TIMEOUT_MS = 10_000;

// ── Tipos públicos (sin secretos) ─────────────────────────────────

export type DteDiagnosticCheckStatus = "OK" | "ERROR" | "NOT_CONFIGURED";

export type DteDiagnosticCause =
  | "ISSUER_NOT_CONFIGURED"
  | "CREDENTIALS_MISSING"
  | "CREDENTIALS_UNREADABLE"
  | "SIGNER_URL_INVALID"
  | "SIGNER_API_KEY_MISSING"
  | "MH_CREDENTIALS_REJECTED"
  | "MH_SERVICE_ERROR"
  | "PRIVATE_KEY_PASSWORD_REJECTED"
  | "CERTIFICATE_NOT_FOUND"
  | "SIGNER_API_KEY_REJECTED"
  | "TIMEOUT"
  | "TLS_ERROR"
  | "UNREACHABLE"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "SIGNATURE_MALFORMED"
  | "SIGNATURE_CONTENT_MISMATCH"
  | "REJECTED_UNSPECIFIED";

export interface DteDiagnosticCheckResult {
  status:      DteDiagnosticCheckStatus;
  cause?:      DteDiagnosticCause;
  /** Mensaje en español, generado por la plataforma (no texto externo crudo). */
  message:     string;
  httpStatus?: number;
  /** Código externo saneado (p.ej. codigo del firmador), si existe. */
  externalCode?:        string;
  /** Descripción externa saneada y truncada, si existe. */
  externalDescription?: string;
  /** Host del destino contactado (sin ruta ni credenciales). */
  targetHost?: string;
  durationMs?: number;
}

export interface DteSignatureCheckResult extends DteDiagnosticCheckResult {
  /** true solo si el payload del JWS coincide exactamente con el JSON enviado. */
  contentVerified: boolean;
  /** Siempre false: no se dispone del certificado público del emisor. */
  cryptoVerified:  false;
}

export interface DteEnvironmentDiagnosticsResult {
  environment: DteMhEnvironment;
  testedAt:    string;
  auth:        DteDiagnosticCheckResult;
  signature:   DteSignatureCheckResult;
  /** Siempre false — esta prueba nunca transmite documentos. */
  documentsTransmitted: false;
}

export type DteDiagnosticsDbClient = Pick<PrismaClient, "dteIssuerConfig" | "dteCredential">;

export interface RunDteEnvironmentDiagnosticsInput {
  tenantId:    string;
  locationId:  string;
  environment: DteMhEnvironment;
  client:      DteDiagnosticsDbClient;
}

export type RunDteEnvironmentDiagnosticsOutcome =
  | { ok: true; result: DteEnvironmentDiagnosticsResult }
  | { ok: false; error: "BUSY" };

// ── Exclusión de ejecuciones concurrentes — ALCANCE LIMITADO ──────
// Set en memoria del proceso Node actual. Solo evita que dos solicitudes
// simultáneas para el mismo tenant/location/ambiente se ejecuten dentro
// de la MISMA instancia. NO coordina entre instancias/lambdas distintas
// de Vercel (cada una tiene su propio Set) ni sobrevive a un cold start.
// La protección principal contra doble clic es la UI (botón deshabilitado
// mientras corre). Un bloqueo distribuido requeriría infraestructura
// adicional y queda fuera de este alcance. El riesgo residual es bajo:
// la prueba es idempotente (no persiste ni reserva nada).

const inFlight = new Set<string>();

// ── Saneamiento de texto externo ──────────────────────────────────

const JWT_LIKE_RE = /eyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*){1,2}/g;
const BEARER_RE   = /Bearer\s+\S+/gi;
const EXTERNAL_CODE_RE = /^[A-Za-z0-9_.-]{1,48}$/;

export function sanitizeExternalText(value: unknown, secrets: readonly string[]): string | undefined {
  let text: string | undefined;
  if (typeof value === "string") text = value;
  else if (Array.isArray(value)) {
    const parts = value.filter((v): v is string => typeof v === "string");
    text = parts.length ? parts.join("; ") : undefined;
  }
  if (!text) return undefined;

  let out = text.replace(/[\u0000-\u001f\u007f]+/g, " ");
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join("[redactado]");
  }
  out = out.replace(BEARER_RE, "Bearer [redactado]").replace(JWT_LIKE_RE, "[redactado]");
  out = out.replace(/\s+/g, " ").trim();
  if (!out) return undefined;
  return out.length > 160 ? `${out.slice(0, 157)}...` : out;
}

function sanitizeExternalCode(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const s = String(value).trim();
  return EXTERNAL_CODE_RE.test(s) ? s : undefined;
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function resolveTimeout(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  const v = Number.isFinite(n) && n > 0 ? n : fallback;
  return Math.min(v, MAX_TIMEOUT_MS);
}

// ── Clasificación de errores de red ───────────────────────────────

const TLS_ERROR_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_SSL_WRONG_VERSION_NUMBER",
  "EPROTO",
]);

type NetworkFailure = { cause: "TIMEOUT" | "TLS_ERROR" | "UNREACHABLE"; message: string };

function classifyFetchError(err: unknown, who: "Hacienda" | "el firmador"): NetworkFailure {
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
    return { cause: "TIMEOUT", message: `${who === "Hacienda" ? "Hacienda" : "El firmador"} no respondió dentro del tiempo límite.` };
  }
  const causeObj = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
  const code = typeof causeObj === "object" && causeObj !== null && "code" in causeObj
    ? String((causeObj as { code?: unknown }).code ?? "")
    : "";
  const causeMsg = causeObj instanceof Error ? causeObj.message : "";
  if (TLS_ERROR_CODES.has(code) || /certificate|ssl|tls/i.test(causeMsg)) {
    return { cause: "TLS_ERROR", message: `Error TLS/certificado HTTPS al conectar con ${who}.` };
  }
  return { cause: "UNREACHABLE", message: `No se pudo conectar con ${who}.` };
}

async function readJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ── 1. Autenticación MH ───────────────────────────────────────────

async function checkMhAuth(
  environment: DteMhEnvironment,
  payload: DteCredentialPayload,
): Promise<DteDiagnosticCheckResult> {
  const user = payload.apiUser?.trim() ?? "";
  const password = payload.apiPassword ?? "";
  if (!user || !password.trim()) {
    return {
      status:  "NOT_CONFIGURED",
      cause:   "CREDENTIALS_MISSING",
      message: "El emisor no tiene usuario y contraseña API de Hacienda guardados para este ambiente.",
    };
  }

  const { authUrl } = resolveDteMhUrls(environment);
  const targetHost = safeHost(authUrl);
  const timeoutMs = resolveTimeout(process.env["DTE_MH_TIMEOUT_MS"], getDteMhConfig().timeoutMs);
  const secrets = [password, user];

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(authUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({ user, pwd: password }).toString(),
      signal:  controller.signal,
      cache:   "no-store",
    });
  } catch (err) {
    const f = classifyFetchError(err, "Hacienda");
    return { status: "ERROR", cause: f.cause, message: f.message, targetHost, durationMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - started;
  const httpStatus = res.status;
  const body = await readJsonSafe(res);

  // Lista explícita de campos externos admitidos: status, error, message,
  // body.codigoMsg y body.descripcionMsg. Ningún otro campo se lee.
  const inner = isRecord(body) && isRecord(body["body"]) ? body["body"] : undefined;
  const externalCode = inner ? sanitizeExternalCode(inner["codigoMsg"]) : undefined;
  const externalDescription = isRecord(body)
    ? (inner ? sanitizeExternalText(inner["descripcionMsg"], secrets) : undefined)
      ?? sanitizeExternalText(body["message"], secrets)
      ?? sanitizeExternalText(body["error"], secrets)
    : undefined;

  const token = inner ? inner["token"] : undefined;
  if (res.ok && isRecord(body) && body["status"] === "OK" && typeof token === "string" && token.trim()) {
    // Token descartado: nunca se devuelve, guarda ni cachea.
    return {
      status:  "OK",
      message: "Hacienda aceptó el usuario y la contraseña API del emisor.",
      httpStatus,
      targetHost,
      durationMs,
    };
  }

  const isMhError = isRecord(body) && body["status"] === "ERROR";
  if (httpStatus === 401 || isMhError) {
    const c = classifyMhAuthRejection(httpStatus, externalCode, externalDescription);
    return { status: "ERROR", cause: c.cause, message: c.message, httpStatus, externalCode, externalDescription, targetHost, durationMs };
  }

  if (!res.ok) {
    return {
      status:  "ERROR",
      cause:   "HTTP_ERROR",
      message: `Hacienda respondió HTTP ${httpStatus}.`,
      httpStatus,
      externalCode,
      externalDescription,
      targetHost,
      durationMs,
    };
  }

  return {
    status:  "ERROR",
    cause:   "INVALID_RESPONSE",
    message: "Respuesta de Hacienda inválida: no contiene status OK con token.",
    httpStatus,
    externalCode,
    externalDescription,
    targetHost,
    durationMs,
  };
}

const MH_INVALID_CREDENTIALS_TEXT_RE = /credenciales?\s+inv[aá]lidas?/i;

/**
 * Un `status: "ERROR"` de /seguridad/auth NO prueba por sí solo que la
 * contraseña sea incorrecta. Observado en Hacienda:
 *   - codigoMsg 106 "CREDENCIALES INVÁLIDAS"           → credenciales rechazadas.
 *   - codigoMsg 101 "ERROR CONTACTAR CON SOPORTE TÉCNICO" → error del servicio MH.
 * Solo se atribuye causa específica con evidencia (código o texto conocido,
 * o HTTP 401 sin código que lo contradiga). Lo demás queda sin causa determinada.
 */
function classifyMhAuthRejection(
  httpStatus: number,
  code: string | undefined,
  description: string | undefined,
): { cause: DteDiagnosticCause; message: string } {
  if (code === "106" || (!code && description && MH_INVALID_CREDENTIALS_TEXT_RE.test(description))) {
    return { cause: "MH_CREDENTIALS_REJECTED", message: "Hacienda rechazó el usuario o la contraseña API del emisor (credenciales inválidas)." };
  }
  if (code === "101") {
    return {
      cause:   "MH_SERVICE_ERROR",
      message: "Hacienda devolvió un error de su servicio (código 101, contactar soporte técnico de MH). No indica que la contraseña sea incorrecta.",
    };
  }
  if (!code && httpStatus === 401) {
    return { cause: "MH_CREDENTIALS_REJECTED", message: "Hacienda rechazó la autenticación (HTTP 401) con el usuario y la contraseña API del emisor." };
  }
  return {
    cause:   "REJECTED_UNSPECIFIED",
    message: "Hacienda respondió ERROR; la respuesta no permite determinar la causa.",
  };
}

// ── 2. Firma ──────────────────────────────────────────────────────

function isRemoteUrl(url: string): boolean {
  return /^https?:\/\/(?!localhost|127\.0\.0\.1)/i.test(url);
}

export function buildDiagnosticJson(environment: DteMhEnvironment, now: Date): Record<string, string> {
  // Todo string: evita diferencias de serialización numérica en el firmador.
  return {
    tipo:      "ZOLVI_DIAGNOSTICO_FIRMA",
    ambiente:  environment === "PRODUCTION" ? "01" : "00",
    nonce:     randomUUID(),
    generado:  now.toISOString(),
    nota:      "Prueba de firma sin valor fiscal. No es un DTE.",
  };
}

function decodeBase64UrlJson(segment: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return undefined;
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

function deepEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqualJson(v, b[i]));
  }
  if (isRecord(a) && isRecord(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqualJson(a[k], b[k]));
  }
  return false;
}

/**
 * Verifica que `jws` sea un JWS compacto con cabecera JSON (alg ≠ none),
 * firma no vacía y payload igual al JSON enviado. No verifica la firma
 * criptográficamente.
 */
export function verifySignedDiagnostic(
  jws: string,
  expected: unknown,
): { ok: true } | { ok: false; cause: "SIGNATURE_MALFORMED" | "SIGNATURE_CONTENT_MISMATCH"; message: string } {
  const parts = jws.split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) {
    return { ok: false, cause: "SIGNATURE_MALFORMED", message: "La firma devuelta no tiene formato JWS compacto válido." };
  }
  const [h, p, s] = parts as [string, string, string];
  const header = decodeBase64UrlJson(h);
  if (!isRecord(header) || typeof header["alg"] !== "string" || header["alg"].toLowerCase() === "none") {
    return { ok: false, cause: "SIGNATURE_MALFORMED", message: "La cabecera de la firma devuelta es inválida." };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(s) || Buffer.from(s, "base64url").length < 32) {
    return { ok: false, cause: "SIGNATURE_MALFORMED", message: "La firma devuelta no contiene un valor de firma válido." };
  }
  const payload = decodeBase64UrlJson(p);
  if (payload === undefined) {
    return { ok: false, cause: "SIGNATURE_MALFORMED", message: "El contenido firmado devuelto no es JSON válido." };
  }
  if (!deepEqualJson(payload, expected)) {
    return {
      ok:      false,
      cause:   "SIGNATURE_CONTENT_MISMATCH",
      message: "El contenido firmado no corresponde al JSON de diagnóstico enviado.",
    };
  }
  return { ok: true };
}

function classifySignerRejection(code: string | undefined, description: string | undefined): {
  cause: DteDiagnosticCause; message: string;
} {
  const text = `${code ?? ""} ${description ?? ""}`;
  const mentionsCert = /certificad|llave|key|archivo|\bnit\b/i.test(text);
  if (/contrase|password|passwordpri|credencial/i.test(text)) {
    return { cause: "PRIVATE_KEY_PASSWORD_REJECTED", message: "El firmador rechazó la contraseña privada del certificado." };
  }
  if (mentionsCert && /no existe|no se encontr|no encontrad|not found|no hay/i.test(text)) {
    return { cause: "CERTIFICATE_NOT_FOUND", message: "El firmador no encontró el certificado para el NIT configurado." };
  }
  return { cause: "REJECTED_UNSPECIFIED", message: "El firmador rechazó la solicitud; la respuesta no permite determinar la causa." };
}

async function checkSignature(
  environment: DteMhEnvironment,
  payload: DteCredentialPayload,
  now: Date,
): Promise<DteSignatureCheckResult> {
  const base = { contentVerified: false, cryptoVerified: false as const };
  const url = payload.signerUrl?.trim() ?? "";
  const nit = payload.signerNit?.replace(/-/g, "").trim() ?? "";
  const passwordPri = payload.signerPrivateKeyPassword ?? "";
  const apiKey = payload.signerApiKey?.trim() ?? "";

  const missing: string[] = [];
  if (!url) missing.push("URL del firmador");
  if (!nit) missing.push("NIT del firmador");
  if (!passwordPri.trim()) missing.push("contraseña privada");
  if (missing.length) {
    return {
      ...base,
      status:  "NOT_CONFIGURED",
      cause:   "CREDENTIALS_MISSING",
      message: `Faltan datos propios del firmador del emisor: ${missing.join(", ")}.`,
    };
  }
  if (!SIGNER_URL_RE.test(url) || !safeHost(url)) {
    return {
      ...base,
      status:  "NOT_CONFIGURED",
      cause:   "SIGNER_URL_INVALID",
      message: "La URL del firmador guardada no es válida (debe terminar en /firmardocumento/).",
    };
  }
  // Nunca usar DTE_SIGNER_API_KEY global (puede pertenecer a otro cliente).
  if (isRemoteUrl(url) && !apiKey) {
    return {
      ...base,
      status:     "NOT_CONFIGURED",
      cause:      "SIGNER_API_KEY_MISSING",
      message:    "El emisor no tiene API Key propia del firmador para este ambiente.",
      targetHost: safeHost(url),
    };
  }

  const targetHost = safeHost(url);
  const timeoutMs = resolveTimeout(process.env["DTE_SIGNER_TIMEOUT_MS"], DEFAULT_SIGNER_TIMEOUT_MS);
  const secrets = [passwordPri, apiKey, payload.apiPassword ?? ""];
  const dteJson = buildDiagnosticJson(environment, now);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["X-DTE-Signer-Key"] = apiKey;

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method:  "POST",
      headers,
      body:    JSON.stringify({ nit, passwordPri, dteJson, activo: true }),
      signal:  controller.signal,
      cache:   "no-store",
    });
  } catch (err) {
    const f = classifyFetchError(err, "el firmador");
    return { ...base, status: "ERROR", cause: f.cause, message: f.message, targetHost, durationMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - started;
  const httpStatus = res.status;
  const body = await readJsonSafe(res);
  const isSignerShape = isRecord(body) && typeof body["status"] === "string" && "body" in body;

  if ((httpStatus === 401 || httpStatus === 403) && !isSignerShape) {
    return {
      ...base,
      status:  "ERROR",
      cause:   "SIGNER_API_KEY_REJECTED",
      message: "El firmador rechazó el acceso (HTTP 401/403): API Key del firmador rechazada.",
      httpStatus,
      targetHost,
      durationMs,
    };
  }

  if (!isSignerShape) {
    return {
      ...base,
      status:  "ERROR",
      cause:   res.ok ? "INVALID_RESPONSE" : "HTTP_ERROR",
      message: res.ok
        ? "Respuesta del firmador inválida (no es la estructura esperada)."
        : `El firmador respondió HTTP ${httpStatus} sin una respuesta reconocible.`,
      httpStatus,
      targetHost,
      durationMs,
    };
  }

  const signerBody = (body as Record<string, unknown>)["body"];
  if ((body as Record<string, unknown>)["status"] !== "OK") {
    // Lista explícita de campos externos admitidos: body.codigo, body.mensaje.
    const externalCode = isRecord(signerBody) ? sanitizeExternalCode(signerBody["codigo"]) : undefined;
    const externalDescription = isRecord(signerBody) ? sanitizeExternalText(signerBody["mensaje"], secrets) : undefined;
    const c = classifySignerRejection(externalCode, externalDescription);
    return {
      ...base,
      status:  "ERROR",
      cause:   c.cause,
      message: c.message,
      httpStatus,
      externalCode,
      externalDescription,
      targetHost,
      durationMs,
    };
  }

  const jws = typeof signerBody === "string" ? signerBody.trim() : "";
  if (!jws) {
    return {
      ...base,
      status:  "ERROR",
      cause:   "SIGNATURE_MALFORMED",
      message: "El firmador respondió OK pero sin firma.",
      httpStatus,
      targetHost,
      durationMs,
    };
  }

  const verified = verifySignedDiagnostic(jws, dteJson);
  // El JWS se descarta aquí: nunca se devuelve ni se persiste.
  if (!verified.ok) {
    return { ...base, status: "ERROR", cause: verified.cause, message: verified.message, httpStatus, targetHost, durationMs };
  }

  return {
    status:          "OK",
    contentVerified: true,
    cryptoVerified:  false,
    message:         "El firmador firmó el JSON de diagnóstico con el certificado del emisor; el contenido firmado coincide.",
    httpStatus,
    targetHost,
    durationMs,
  };
}

// ── Orquestador ───────────────────────────────────────────────────

function notConfiguredBoth(
  environment: DteMhEnvironment,
  testedAt: Date,
  cause: DteDiagnosticCause,
  message: string,
): DteEnvironmentDiagnosticsResult {
  return {
    environment,
    testedAt:  testedAt.toISOString(),
    auth:      { status: "NOT_CONFIGURED", cause, message },
    signature: { status: "NOT_CONFIGURED", cause, message, contentVerified: false, cryptoVerified: false },
    documentsTransmitted: false,
  };
}

export async function runDteEnvironmentDiagnostics(
  input: RunDteEnvironmentDiagnosticsInput,
): Promise<RunDteEnvironmentDiagnosticsOutcome> {
  const { tenantId, locationId, environment, client } = input;
  const lockKey = `${tenantId}:${locationId}:${environment}`;
  if (inFlight.has(lockKey)) return { ok: false, error: "BUSY" };
  inFlight.add(lockKey);

  try {
    const testedAt = new Date();

    // Emisor del ambiente pedido — sin filtrar por is_active: la prueba
    // debe funcionar con el ambiente inactivo.
    const issuer = await client.dteIssuerConfig.findFirst({
      where:  { tenant_id: tenantId, location_id: locationId, environment },
      select: { id: true },
    });
    if (!issuer) {
      return {
        ok: true,
        result: notConfiguredBoth(environment, testedAt, "ISSUER_NOT_CONFIGURED",
          "No existe configuración de emisor para este ambiente."),
      };
    }

    const row = await client.dteCredential.findFirst({
      where:  { issuer_config_id: issuer.id, credential_type: CREDENTIAL_TYPE, is_active: true },
      select: { encrypted_payload: true },
    });
    if (!row?.encrypted_payload) {
      return {
        ok: true,
        result: notConfiguredBoth(environment, testedAt, "CREDENTIALS_MISSING",
          "El emisor no tiene credenciales guardadas para este ambiente."),
      };
    }

    let payload: DteCredentialPayload;
    try {
      payload = decryptDteCredentialPayload(row.encrypted_payload);
    } catch {
      return {
        ok: true,
        result: notConfiguredBoth(environment, testedAt, "CREDENTIALS_UNREADABLE",
          "Las credenciales guardadas no se pudieron descifrar. Vuelva a guardarlas."),
      };
    }

    // Ambas comprobaciones son independientes: un fallo no impide la otra.
    const [auth, signature] = await Promise.all([
      checkMhAuth(environment, payload),
      checkSignature(environment, payload, testedAt),
    ]);

    console.info(
      `[dte-diagnostics] env=${environment} auth=${auth.status}${auth.cause ? `(${auth.cause})` : ""} ` +
      `sign=${signature.status}${signature.cause ? `(${signature.cause})` : ""} ` +
      `mhHost=${auth.targetHost ?? "-"} signerHost=${signature.targetHost ?? "-"}`,
    );

    return {
      ok: true,
      result: { environment, testedAt: testedAt.toISOString(), auth, signature, documentsTransmitted: false },
    };
  } finally {
    inFlight.delete(lockKey);
  }
}
