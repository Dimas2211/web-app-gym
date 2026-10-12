// ─────────────────────────────────────────────────────────────────
// commerce/dte/certification/harness — fake-fiscal-network.ts
//
// DTE-INTERNAL-CERTIFICATION — SOLO TESTS / CERTIFICACIÓN. No es una
// feature runtime, no se registra en ningún flujo productivo y no
// existe flag/env que lo active fuera de un test.
//
// Sustituye ÚNICAMENTE la frontera de red (`globalThis.fetch`) para que
// los adapters productivos reales (MhHttpDteSignerAdapter, MhAuthAdapter,
// MhDteTransmissionAdapter, MhInvalidationTransmissionAdapter) se
// ejecuten completos — construcción de request, timeouts, parsing,
// normalización — contra un firmador y un MH falsos en proceso.
//
// Fail-closed:
// - Cualquier URL que no sea el firmador sintético o un endpoint MH
//   TEST conocido → violación registrada + error de red.
// - Endpoints MH PRODUCTION → violación (nunca se responde).
// - La `fetch` original NUNCA se invoca: ningún byte sale del proceso.
//
// Registro saneado: nunca guarda JWS, passwords, tokens ni payloads
// completos — solo identificadores fiscales, longitudes y SHA-256.
// ─────────────────────────────────────────────────────────────────

import { createHash, randomBytes } from "node:crypto";

export type FakeReceptionScenario =
  | "PROCESADO"
  | "PROCESADO_EMPTY_OBSERVATIONS"
  | "PROCESADO_OBSERVED"
  | "RECHAZADO"
  | "TIMEOUT"
  | "UNEXPECTED_ESTADO";

export interface FakeSignerIdentity {
  signerUrl: string;
  signerNit: string;
  signerPrivateKeyPassword: string;
  mhUser: string;
  mhPassword: string;
}

export interface FakeNetworkCall {
  kind: "SIGNER" | "MH_AUTH" | "MH_RECEPTION" | "MH_ANULAR";
  endpoint: string;
  ambiente: string | null;
  tipoDte: string | null;
  version: number | null;
  codigoGeneracion: string | null;
  numeroControl: string | null;
  scenario: string | null;
  jwsSha256: string | null;
  payloadBytes: number;
  authorizedAs: string | null;
}

const MH_TEST_HOST = "apitest.dtes.mh.gob.sv";
const MH_PROD_HOST = "api.dtes.mh.gob.sv";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

function abortError(): Error {
  const err = new Error("The operation was aborted (certification timeout).");
  err.name = "AbortError";
  return err;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Sello de recepción ficticio: 40 caracteres, prefijo CERT para que nunca se confunda con uno real. */
function fakeSello(): string {
  return ("CERT" + randomBytes(18).toString("hex").toUpperCase()).slice(0, 40);
}

function decodeFakeJws(jws: string): Record<string, unknown> | null {
  const parts = jws.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export class FakeFiscalNetwork {
  readonly calls: FakeNetworkCall[] = [];
  readonly violations: string[] = [];
  private readonly identities = new Map<string, FakeSignerIdentity>(); // por signerNit
  private readonly mhTokens = new Map<string, string>();               // token → mhUser
  private receptionQueue: FakeReceptionScenario[] = [];
  private anularQueue: Array<"PROCESADO" | "RECHAZADO"> = [];
  private originalFetch: typeof fetch | null = null;

  registerIdentity(identity: FakeSignerIdentity) {
    this.identities.set(identity.signerNit, identity);
  }

  /** Programa la próxima respuesta de /fesv/recepciondte (FIFO). Default: PROCESADO. */
  enqueueReception(...scenarios: FakeReceptionScenario[]) {
    this.receptionQueue.push(...scenarios);
  }

  /** Programa la próxima respuesta de /fesv/anulardte (FIFO). Default: PROCESADO. */
  enqueueAnular(...scenarios: Array<"PROCESADO" | "RECHAZADO">) {
    this.anularQueue.push(...scenarios);
  }

  install() {
    if (this.originalFetch) throw new Error("FakeFiscalNetwork ya instalado.");
    this.originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
      this.handle(input, init)) as typeof fetch;
  }

  uninstall() {
    if (this.originalFetch) globalThis.fetch = this.originalFetch;
    this.originalFetch = null;
  }

  callsOf(kind: FakeNetworkCall["kind"]) {
    return this.calls.filter((c) => c.kind === kind);
  }

  // ── Router ──────────────────────────────────────────────────────

  private async handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      this.violations.push(`URL inválida solicitada: "${rawUrl.slice(0, 80)}"`);
      throw new TypeError("fetch failed (certification: URL inválida)");
    }
    const endpoint = `${url.protocol}//${url.host}${url.pathname}`;
    const body = typeof init?.body === "string" ? init.body : "";

    const signer = [...this.identities.values()].find((i) => i.signerUrl === rawUrl);
    if (signer) return this.signer(endpoint, body);

    if (url.host === MH_PROD_HOST) {
      this.violations.push(`Intento de llamada a MH PRODUCTION bloqueado: ${endpoint}`);
      throw new TypeError("fetch failed (certification: MH PRODUCTION bloqueado)");
    }
    if (url.host === MH_TEST_HOST) {
      if (url.pathname === "/seguridad/auth") return this.mhAuth(endpoint, body);
      if (url.pathname === "/fesv/recepciondte") return this.mhReception(endpoint, body, init);
      if (url.pathname === "/fesv/anulardte") return this.mhAnular(endpoint, body, init);
    }
    this.violations.push(`Llamada de red no permitida en certificación: ${endpoint}`);
    throw new TypeError("fetch failed (certification: destino no permitido)");
  }

  // ── Firmador falso ──────────────────────────────────────────────

  private signer(endpoint: string, body: string): Response {
    const req = JSON.parse(body) as { nit?: string; passwordPri?: string; dteJson?: Record<string, unknown> };
    const identity = req.nit ? this.identities.get(req.nit) : undefined;
    const ident = (req.dteJson?.identificacion ?? {}) as Record<string, unknown>;
    this.calls.push({
      kind: "SIGNER",
      endpoint,
      ambiente: (ident.ambiente as string) ?? null,
      tipoDte: (ident.tipoDte as string) ?? null,
      version: (ident.version as number) ?? null,
      codigoGeneracion: (ident.codigoGeneracion as string) ?? null,
      numeroControl: (ident.numeroControl as string) ?? null,
      scenario: identity ? "OK" : "BAD_CREDENTIALS",
      jwsSha256: null,
      payloadBytes: body.length,
      authorizedAs: identity ? identity.signerNit : null,
    });
    if (!identity || identity.signerPrivateKeyPassword !== req.passwordPri) {
      return json({ status: "ERROR", body: { codigo: "CERT_SIGNER_AUTH", mensaje: "Credenciales de firmador inválidas (certificación)." } });
    }
    if (!req.dteJson || typeof req.dteJson !== "object") {
      return json({ status: "ERROR", body: { codigo: "CERT_SIGNER_PAYLOAD", mensaje: "dteJson ausente." } });
    }
    const header = b64url(JSON.stringify({ alg: "CERT-FAKE", typ: "JWS" }));
    const payload = b64url(JSON.stringify(req.dteJson));
    const signature = b64url(`cert-fake-signature:${sha256(payload)}`);
    return json({ status: "OK", body: `${header}.${payload}.${signature}` });
  }

  // ── MH auth falso ───────────────────────────────────────────────

  private mhAuth(endpoint: string, body: string): Response {
    const form = new URLSearchParams(body);
    const user = form.get("user") ?? "";
    const pwd = form.get("pwd") ?? "";
    const identity = [...this.identities.values()].find((i) => i.mhUser === user);
    const ok = !!identity && identity.mhPassword === pwd;
    this.calls.push({
      kind: "MH_AUTH", endpoint, ambiente: "00", tipoDte: null, version: null, codigoGeneracion: null,
      numeroControl: null, scenario: ok ? "OK" : "REJECTED", jwsSha256: null, payloadBytes: body.length,
      authorizedAs: ok ? user : null,
    });
    if (!ok) return json({ status: "ERROR", error: "Usuario o contraseña inválidos (certificación)." }, 401);
    const token = `CERT-FAKE-TOKEN-${randomBytes(8).toString("hex")}`;
    this.mhTokens.set(token, user);
    return json({ status: "OK", body: { user, token: `Bearer ${token}` } });
  }

  private authorizedUser(init?: RequestInit): string | null {
    const headers = new Headers(init?.headers);
    const auth = headers.get("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    return this.mhTokens.get(token) ?? null;
  }

  // ── MH recepción falsa ──────────────────────────────────────────

  private mhReception(endpoint: string, body: string, init?: RequestInit): Response {
    const req = JSON.parse(body) as {
      ambiente?: string; idEnvio?: number; version?: number; tipoDte?: string; documento?: string; codigoGeneracion?: string;
    };
    const scenario = this.receptionQueue.shift() ?? "PROCESADO";
    const user = this.authorizedUser(init);
    const signed = decodeFakeJws(req.documento ?? "");
    const ident = (signed?.identificacion ?? {}) as Record<string, unknown>;
    this.calls.push({
      kind: "MH_RECEPTION", endpoint, ambiente: req.ambiente ?? null, tipoDte: req.tipoDte ?? null,
      version: req.version ?? null, codigoGeneracion: req.codigoGeneracion ?? null,
      numeroControl: (ident.numeroControl as string) ?? null, scenario,
      jwsSha256: req.documento ? sha256(req.documento) : null, payloadBytes: body.length, authorizedAs: user,
    });
    if (!user) return json({ status: "ERROR", error: "No autorizado (certificación)." }, 401);

    // Coherencia sobre-JWS: lo transmitido debe ser exactamente lo firmado.
    const mismatch: string[] = [];
    if (!signed) mismatch.push("documento no es un JWS de certificación");
    if (ident.codigoGeneracion !== req.codigoGeneracion) mismatch.push("codigoGeneracion");
    if (ident.tipoDte !== req.tipoDte) mismatch.push("tipoDte");
    if (ident.version !== req.version) mismatch.push("version");
    if (ident.ambiente !== req.ambiente) mismatch.push("ambiente");
    if (mismatch.length > 0) {
      this.violations.push(`Transmisión incoherente con el JWS firmado: ${mismatch.join(", ")}`);
      return json(this.reception(req, "RECHAZADO", "CERT: sobre de transmisión incoherente con el JWS firmado."), 400);
    }

    switch (scenario) {
      case "TIMEOUT":
        throw abortError();
      case "UNEXPECTED_ESTADO":
        return json({ ...this.reception(req, "EN_REVISION_CERT", null), selloRecibido: null });
      case "RECHAZADO":
        return json({ ...this.reception(req, "RECHAZADO", "CERT: rechazo fiscal simulado."), selloRecibido: null, codigoMsg: "096" }, 400);
      case "PROCESADO_EMPTY_OBSERVATIONS":
        return json({ ...this.reception(req, "PROCESADO", "RECIBIDO"), observaciones: ["", ""] });
      case "PROCESADO_OBSERVED":
        return json({ ...this.reception(req, "PROCESADO", "RECIBIDO CON OBSERVACIONES"), codigoMsg: "002", observaciones: ["CERT: observación fiscal simulada."] });
      default:
        return json(this.reception(req, "PROCESADO", "RECIBIDO"));
    }
  }

  private reception(req: { ambiente?: string; version?: number; codigoGeneracion?: string }, estado: string, descripcionMsg: string | null) {
    return {
      version: req.version ?? null,
      ambiente: req.ambiente ?? null,
      versionApp: 2,
      estado,
      codigoGeneracion: req.codigoGeneracion ?? null,
      selloRecibido: estado === "PROCESADO" ? fakeSello() : null,
      fhProcesamiento: "12/10/2026 10:00:00",
      clasificaMsg: "10",
      codigoMsg: "001",
      descripcionMsg,
      observaciones: [],
    };
  }

  // ── MH anulación falsa ──────────────────────────────────────────

  private mhAnular(endpoint: string, body: string, init?: RequestInit): Response {
    const req = JSON.parse(body) as { ambiente?: string; version?: number; documento?: string };
    const scenario = this.anularQueue.shift() ?? "PROCESADO";
    const user = this.authorizedUser(init);
    const signed = decodeFakeJws(req.documento ?? "");
    const ident = (signed?.identificacion ?? {}) as Record<string, unknown>;
    const doc = (signed?.documento ?? {}) as Record<string, unknown>;
    this.calls.push({
      kind: "MH_ANULAR", endpoint, ambiente: req.ambiente ?? null, tipoDte: (doc.tipoDte as string) ?? null,
      version: req.version ?? null, codigoGeneracion: (ident.codigoGeneracion as string) ?? null,
      numeroControl: (doc.numeroControl as string) ?? null, scenario,
      jwsSha256: req.documento ? sha256(req.documento) : null, payloadBytes: body.length, authorizedAs: user,
    });
    if (!user) return json({ status: "ERROR", error: "No autorizado (certificación)." }, 401);
    if (!signed || ident.version !== req.version || ident.ambiente !== req.ambiente) {
      this.violations.push("Evento de invalidación transmitido incoherente con el JWS firmado.");
    }
    if (scenario === "RECHAZADO") {
      return json({ estado: "RECHAZADO", selloRecibido: null, codigoMsg: "098", descripcionMsg: "CERT: rechazo de anulación simulado.", observaciones: [] }, 400);
    }
    return json({ estado: "PROCESADO", selloRecibido: fakeSello(), codigoMsg: "001", descripcionMsg: "RECIBIDO", observaciones: [] });
  }
}
