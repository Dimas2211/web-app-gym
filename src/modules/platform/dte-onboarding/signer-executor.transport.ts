// ─────────────────────────────────────────────────────────────────
// platform/dte-onboarding — signer-executor.transport.ts
//
// FISCAL-ONBOARDING — canal Zolvi -> ejecutor del VPS. Solo envía una de
// las 4 operaciones predefinidas; el ejecutor revalida todo. Firma
// HMAC-SHA256 del cuerpo con timestamp + nonce (anti-replay).
//
// Variables (server-only, nunca expuestas al browser):
//   ZOLVI_SIGNER_EXECUTOR_URL     https://<host-ops>/v1/execute
//   ZOLVI_SIGNER_EXECUTOR_SECRET  >= 32 caracteres, compartido con el VPS
// Sin variables -> transporte NOT_CONFIGURED: INSPECT/APPLY/VERIFY/ROLLBACK
// fallan explícitamente; PLAN sigue funcionando sin observación.
// ─────────────────────────────────────────────────────────────────

import { randomBytes } from "node:crypto";
import { signExecutorRequest } from "../../../../ops/dte-signer-executor/lib/executor-auth.mjs";
import type { SignerSpec } from "../../../../ops/dte-signer-executor/lib/signer-core.mjs";

export type SignerExecutorOp = "inspect" | "apply" | "verify" | "rollback";

export interface SignerExecutorParams {
  spec:    SignerSpec;
  runId?:  string;
  /** Solo en el primer APPLY. Viaja por HTTPS firmado; nunca se registra. */
  apiKey?: string;
}

export interface SignerExecutorStep {
  op:      string;
  status:  string;
  detail?: string;
}

export interface SignerExecutorObserved {
  names?:     { id: string; containerName: string; dir: string; vhostIncludePath: string };
  container?: { name: string; state: string; managed: boolean; templateVersion: string | null; loopbackOnly: boolean; boundToExpectedPort: boolean } | null;
  protected?: boolean;
  /** Includes en el directorio del vhost que no son el de este firmador. */
  vhostForeignIncludes?: string[];
  portInUse?: boolean;
  portOwners?: string[];
  dirExists?: boolean;
  cert?:      { present: boolean; fingerprint: string | null };
  apiKey?:    { present: boolean; fingerprint: string | null };
  compose?:   { present: boolean; templateVersion: string | null; matches: boolean };
  vhost?:     { present: boolean; templateVersion: string | null; matches: boolean };
  listeningPorts?: number[];
  allContainers?: Array<{ name: string; managed: boolean; ports: string }>;
}

export interface SignerExecutorResponse {
  ok:        boolean;
  op?:       string;
  code?:     string;
  message?:  string;
  steps?:    SignerExecutorStep[];
  checks?:   Array<{ code: string; status: string; detail?: string }>;
  observed?: SignerExecutorObserved;
}

export interface SignerExecutorTransport {
  readonly configured: boolean;
  call(op: SignerExecutorOp, params: SignerExecutorParams): Promise<SignerExecutorResponse>;
}

export class NotConfiguredSignerExecutorTransport implements SignerExecutorTransport {
  readonly configured = false;
  async call(): Promise<SignerExecutorResponse> {
    return {
      ok: false,
      code: "EXECUTOR_NOT_CONFIGURED",
      message: "El ejecutor del VPS no está configurado (ZOLVI_SIGNER_EXECUTOR_URL / ZOLVI_SIGNER_EXECUTOR_SECRET).",
    };
  }
}

/**
 * Para observabilidad de fallos de red en Vercel: solamente codigos
 * estructurados de Node/Undici. No registrar mensajes, URL, headers,
 * cuerpos HMAC, certificados ni secretos.
 */
const SAFE_NETWORK_CAUSE_CODES = new Set([
  "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT",
  "ENETUNREACH", "EHOSTUNREACH", "EPIPE", "ECONNABORTED",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET",
  "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_SSL_WRONG_VERSION_NUMBER", "ERR_HTTP2_ERROR",
]);

function safeTransportCauseCodes(error: unknown): string {
  const codes = new Set<string>();
  const walk = (value: unknown, depth: number) => {
    if (depth > 3 || !value || typeof value !== "object") return;
    const item = value as { code?: unknown; cause?: unknown; errors?: unknown };
    if (typeof item.code === "string") {
      // Allowlist fija: nunca imprimir el contenido de un codigo arbitrario.
      codes.add(SAFE_NETWORK_CAUSE_CODES.has(item.code) ? item.code : "UNKNOWN_CAUSE_CODE");
    }
    if (item.cause) walk(item.cause, depth + 1);
    if (Array.isArray(item.errors)) {
      for (const nested of item.errors.slice(0, 4)) walk(nested, depth + 1);
    }
  };
  walk(error, 0);
  return Array.from(codes).slice(0, 4).join(",") || "NO_CAUSE_CODE";
}

export class HttpSignerExecutorTransport implements SignerExecutorTransport {
  readonly configured = true;
  constructor(
    private readonly url: string,
    private readonly secret: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 180_000,
  ) {}

  async call(op: SignerExecutorOp, params: SignerExecutorParams): Promise<SignerExecutorResponse> {
    const body = JSON.stringify({ op, params, ts: Date.now(), nonce: randomBytes(16).toString("hex") });
    const signature = signExecutorRequest(this.secret, body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.url, {
        method:  "POST",
        headers: { "content-type": "application/json", "x-zolvi-signature": signature },
        body,
        signal:  controller.signal,
        cache:   "no-store",
      });
      const json = (await res.json().catch(() => null)) as SignerExecutorResponse | null;
      if (!json) return { ok: false, code: "EXECUTOR_BAD_RESPONSE", message: `Respuesta no JSON del ejecutor (HTTP ${res.status}).` };
      return json;
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      console.warn(
        `[signer-executor-transport] op=${op} result=${aborted ? "TIMEOUT" : "UNREACHABLE"} cause_codes=${safeTransportCauseCodes(err)}`,
      );
      return {
        ok: false,
        code: aborted ? "EXECUTOR_TIMEOUT" : "EXECUTOR_UNREACHABLE",
        message: aborted
          ? "El ejecutor no respondió a tiempo; el estado del VPS es incierto. Ejecute INSPECT antes de reintentar."
          : "No se pudo contactar al ejecutor del VPS.",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function getSignerExecutorTransport(): SignerExecutorTransport {
  const url = process.env["ZOLVI_SIGNER_EXECUTOR_URL"]?.trim();
  const secret = process.env["ZOLVI_SIGNER_EXECUTOR_SECRET"]?.trim();
  if (!url || !secret || secret.length < 32 || !/^https:\/\//i.test(url)) {
    return new NotConfiguredSignerExecutorTransport();
  }
  return new HttpSignerExecutorTransport(url, secret);
}
