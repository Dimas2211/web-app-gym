// ─────────────────────────────────────────────────────────────────
// platform/dte-onboarding — signer-remote-verifier.ts
//
// FISCAL-ONBOARDING — verificación externa del firmador desde Zolvi
// (guía §03 Paso E), sin firmar ni transmitir nada:
//   DNS          — el hostname resuelve (y apunta al VPS esperado, si se conoce).
//   TLS          — certificado válido para el hostname y con > 14 días.
//   NO_KEY_403   — sin X-DTE-Signer-Key: HTTP 403.
//   BAD_KEY_403  — con clave aleatoria incorrecta: HTTP 403.
//   KEY_ACCEPTED — con la API Key del emisor: respuesta distinta de 403
//                  (405/404/200 = el request llegó al firmador).
// Nunca registra la API Key ni la incluye en mensajes.
// ─────────────────────────────────────────────────────────────────

import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import tls from "node:tls";

export type RemoteCheckStatus = "ok" | "failed" | "warning";

export interface RemoteCheck {
  code:    "DNS" | "TLS" | "NO_KEY_403" | "BAD_KEY_403" | "KEY_ACCEPTED";
  status:  RemoteCheckStatus;
  detail?: string;
}

export interface RemoteVerifierDeps {
  resolve4?: (hostname: string) => Promise<string[]>;
  tlsProbe?: (hostname: string) => Promise<{ authorized: boolean; validTo: Date | null; error?: string }>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

function defaultTlsProbe(hostname: string): Promise<{ authorized: boolean; validTo: Date | null; error?: string }> {
  return new Promise((resolve) => {
    const socket = tls.connect({ host: hostname, port: 443, servername: hostname, timeout: 8000 }, () => {
      const cert = socket.getPeerCertificate();
      const validTo = cert?.valid_to ? new Date(cert.valid_to) : null;
      resolve({ authorized: socket.authorized, validTo, error: socket.authorized ? undefined : String(socket.authorizationError ?? "") });
      socket.end();
    });
    socket.on("timeout", () => { socket.destroy(); resolve({ authorized: false, validTo: null, error: "timeout" }); });
    socket.on("error", (e) => resolve({ authorized: false, validTo: null, error: e.message }));
  });
}

async function statusOf(fetchImpl: typeof fetch, url: string, key?: string): Promise<number | null> {
  try {
    const res = await fetchImpl(url, {
      method:  "GET",
      headers: key ? { "X-DTE-Signer-Key": key } : {},
      cache:   "no-store",
      redirect: "manual",
      signal:  AbortSignal.timeout(10_000),
    });
    return res.status;
  } catch {
    return null;
  }
}

export async function verifySignerEndpoint(
  input: { hostname: string; signerUrl: string; apiKey: string | null; expectedIp?: string | null },
  deps: RemoteVerifierDeps = {},
): Promise<{ ok: boolean; checks: RemoteCheck[] }> {
  const resolve4  = deps.resolve4 ?? ((h: string) => dns.resolve4(h));
  const tlsProbe  = deps.tlsProbe ?? defaultTlsProbe;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now       = (deps.now ?? (() => new Date()))();
  const checks: RemoteCheck[] = [];

  try {
    const ips = await resolve4(input.hostname);
    if (ips.length === 0) checks.push({ code: "DNS", status: "failed", detail: "Sin registros A." });
    else if (input.expectedIp && !ips.includes(input.expectedIp)) {
      checks.push({ code: "DNS", status: "failed", detail: `Resuelve a ${ips.join(", ")}, se esperaba ${input.expectedIp}.` });
    } else checks.push({ code: "DNS", status: "ok", detail: ips.join(", ") });
  } catch {
    checks.push({ code: "DNS", status: "failed", detail: "El hostname no resuelve." });
  }

  const t = await tlsProbe(input.hostname);
  if (!t.authorized) checks.push({ code: "TLS", status: "failed", detail: `Certificado TLS no válido${t.error ? `: ${t.error}` : ""}.` });
  else if (t.validTo && t.validTo.getTime() - now.getTime() < 14 * 86_400_000) {
    checks.push({ code: "TLS", status: "warning", detail: `Certificado vence ${t.validTo.toISOString().slice(0, 10)} (< 14 días).` });
  } else checks.push({ code: "TLS", status: "ok", detail: t.validTo ? `Vence ${t.validTo.toISOString().slice(0, 10)}` : undefined });

  const noKey = await statusOf(fetchImpl, input.signerUrl);
  checks.push({ code: "NO_KEY_403", status: noKey === 403 ? "ok" : "failed", detail: `HTTP ${noKey ?? "sin respuesta"} (esperado 403).` });

  const badKey = await statusOf(fetchImpl, input.signerUrl, randomBytes(32).toString("hex"));
  checks.push({ code: "BAD_KEY_403", status: badKey === 403 ? "ok" : "failed", detail: `HTTP ${badKey ?? "sin respuesta"} (esperado 403).` });

  if (input.apiKey) {
    const withKey = await statusOf(fetchImpl, input.signerUrl, input.apiKey);
    const ok = withKey !== null && withKey !== 403 && withKey < 502;
    checks.push({
      code: "KEY_ACCEPTED",
      status: ok ? "ok" : "failed",
      detail: withKey === 403 ? "HTTP 403 con la API Key registrada: la clave de Zolvi no coincide con la del VPS."
        : `HTTP ${withKey ?? "sin respuesta"} (esperado ≠403; 405/404/200 confirman acceso al firmador).`,
    });
  } else {
    checks.push({ code: "KEY_ACCEPTED", status: "failed", detail: "No hay API Key registrada para verificar el acceso." });
  }

  return { ok: checks.every((c) => c.status !== "failed"), checks };
}
