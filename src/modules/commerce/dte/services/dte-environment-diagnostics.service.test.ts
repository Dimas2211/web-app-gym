// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-environment-diagnostics.service.test.ts
//
// "Probar conexión y firma": fetch SIEMPRE simulado — nunca red real,
// nunca MH real. El descifrado se mockea para inyectar payloads.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";

const { decryptSpy } = vi.hoisted(() => ({ decryptSpy: vi.fn() }));
vi.mock("../lib/dte-credential-encryption", () => ({ decryptDteCredentialPayload: decryptSpy }));

import {
  runDteEnvironmentDiagnostics,
  sanitizeExternalText,
  verifySignedDiagnostic,
  type DteDiagnosticsDbClient,
} from "./dte-environment-diagnostics.service";

const AUTH_TEST = "https://apitest.dtes.mh.gob.sv/seguridad/auth";
const AUTH_PROD = "https://api.dtes.mh.gob.sv/seguridad/auth";
const SIGNER_TEST = "https://signer-test.example.com/firmardocumento/";
const SIGNER_PROD = "https://signer-prod.example.com/firmardocumento/";

const SECRETS = {
  apiPassword: "MhPassw0rd!secret",
  passwordPri: "PrivKeyPass#secret",
  apiKey:      "signer-api-key-secret-123",
  token:       "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJ0b2tlbiJ9.c2lnbmF0dXJl",
};

function payloadFor(env: "TEST" | "PRODUCTION", overrides: Record<string, string | undefined> = {}) {
  return {
    apiUser:                  "06140101001010",
    apiPassword:              SECRETS.apiPassword,
    signerUrl:                env === "TEST" ? SIGNER_TEST : SIGNER_PROD,
    signerNit:                "0614-010100-101-0",
    signerPrivateKeyPassword: SECRETS.passwordPri,
    signerApiKey:             SECRETS.apiKey,
    ...overrides,
  };
}

function b64url(v: unknown): string {
  return Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
}
function makeJws(payload: unknown): string {
  return `${b64url({ alg: "RS512" })}.${b64url(payload)}.${randomBytes(256).toString("base64url")}`;
}

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError("not json");
      return body;
    },
  } as unknown as Response;
}

type Handler = (url: string, init: RequestInit) => Promise<Response> | Response;

const authOk: Handler = () => res(200, { status: "OK", body: { token: SECRETS.token } });
const signOk: Handler = (_url, init) => {
  const sent = JSON.parse(String(init.body)) as { dteJson: unknown };
  return res(200, { status: "OK", body: makeJws(sent.dteJson) });
};

function installFetch(auth: Handler, sign: Handler) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (url.includes("/seguridad/auth")) return auth(url, init);
    if (url.includes("/firmardocumento")) return sign(url, init);
    throw new Error(`Unexpected URL ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function makeClient(opts: { issuer?: { id: string } | null; credential?: { encrypted_payload: string } | null } = {}) {
  const issuerFindFirst = vi.fn(async (args: { where: { environment: string } }) =>
    opts.issuer === undefined ? { id: `issuer-${args.where.environment}` } : opts.issuer,
  );
  const credentialFindFirst = vi.fn(async (args: { where: Record<string, unknown> }) => {
    void args;
    return opts.credential === undefined ? { encrypted_payload: "enc" } : opts.credential;
  });
  const client = {
    dteIssuerConfig: { findFirst: issuerFindFirst },
    dteCredential:   { findFirst: credentialFindFirst },
  } as unknown as DteDiagnosticsDbClient;
  return { client, issuerFindFirst, credentialFindFirst };
}

async function run(env: "TEST" | "PRODUCTION", client: DteDiagnosticsDbClient) {
  const out = await runDteEnvironmentDiagnostics({ tenantId: "tenant-1", locationId: "loc-1", environment: env, client });
  if (!out.ok) throw new Error("unexpected BUSY");
  return out.result;
}

const logSpies: Array<ReturnType<typeof vi.spyOn>> = [];

beforeEach(() => {
  vi.unstubAllGlobals();
  decryptSpy.mockReset();
  for (const k of ["DTE_MH_AUTH_URL_TEST", "DTE_MH_AUTH_URL_PROD", "DTE_MH_USER", "DTE_MH_PASSWORD",
    "DTE_SIGNER_NIT", "DTE_SIGNER_PASSWORD", "DTE_SIGNER_API_KEY", "DTE_SIGNER_URL_TEST", "DTE_SIGNER_URL_PRODUCTION"]) {
    delete process.env[k];
  }
  logSpies.length = 0;
  for (const m of ["info", "log", "warn", "error", "debug"] as const) {
    logSpies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
  }
});

afterEach(() => {
  // Ningún secreto en logs.
  const logged = logSpies.flatMap((s) => s.mock.calls.map((c) => JSON.stringify(c))).join("\n");
  for (const secret of Object.values(SECRETS)) expect(logged).not.toContain(secret);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("runDteEnvironmentDiagnostics — destinos por ambiente", () => {
  it("TEST llama únicamente al auth TEST y al firmador TEST del emisor", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    const fetchMock = installFetch(authOk, signOk);
    const { client, issuerFindFirst } = makeClient();

    const r = await run("TEST", client);

    expect(r.auth.status).toBe("OK");
    expect(r.signature.status).toBe("OK");
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls.sort()).toEqual([AUTH_TEST, SIGNER_TEST].sort());
    expect(issuerFindFirst.mock.calls[0]![0].where).toEqual({ tenant_id: "tenant-1", location_id: "loc-1", environment: "TEST" });
  });

  it("PRODUCTION llama únicamente al auth PRODUCTION y al firmador PRODUCTION del emisor", async () => {
    decryptSpy.mockImplementation(() => payloadFor("PRODUCTION"));
    const fetchMock = installFetch(authOk, signOk);
    const { client } = makeClient();

    const r = await run("PRODUCTION", client);

    expect(r.environment).toBe("PRODUCTION");
    expect(r.auth.status).toBe("OK");
    expect(r.signature.status).toBe("OK");
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls.sort()).toEqual([AUTH_PROD, SIGNER_PROD].sort());
    expect(urls.some((u) => u.includes("apitest"))).toBe(false);
  });

  it("funciona con ambiente inactivo: el lookup del emisor no filtra por is_active", async () => {
    decryptSpy.mockImplementation(() => payloadFor("PRODUCTION"));
    installFetch(authOk, signOk);
    const { client, issuerFindFirst } = makeClient({ issuer: { id: "issuer-prod-inactive" } });

    const r = await run("PRODUCTION", client);

    expect(issuerFindFirst.mock.calls[0]![0].where).not.toHaveProperty("is_active");
    expect(r.auth.status).toBe("OK");
    expect(r.signature.status).toBe("OK");
  });
});

describe("Autenticación MH", () => {
  it("fuerza llamada real en cada ejecución (sin token cacheado)", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    const fetchMock = installFetch(authOk, signOk);
    const { client } = makeClient();

    await run("TEST", client);
    await run("TEST", client);

    expect(fetchMock.mock.calls.filter((c) => c[0] === AUTH_TEST)).toHaveLength(2);
    const init = fetchMock.mock.calls.find((c) => c[0] === AUTH_TEST)![1];
    expect(init.cache).toBe("no-store");
  });

  it("credenciales MH ausentes NO usan fallback global (.env), ni en TEST", async () => {
    process.env["DTE_MH_USER"] = "global-user";
    process.env["DTE_MH_PASSWORD"] = "global-pass";
    decryptSpy.mockImplementation(() => payloadFor("TEST", { apiUser: "", apiPassword: "" }));
    const fetchMock = installFetch(authOk, signOk);
    const { client } = makeClient();

    const r = await run("TEST", client);

    expect(r.auth.status).toBe("NOT_CONFIGURED");
    expect(r.auth.cause).toBe("CREDENTIALS_MISSING");
    expect(fetchMock.mock.calls.some((c) => c[0] === AUTH_TEST)).toBe(false);
    // La firma se comprueba igualmente.
    expect(r.signature.status).toBe("OK");
  });

  it("HTTP 200 con status ERROR no pasa y, sin evidencia, no atribuye contraseña incorrecta", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    installFetch(() => res(200, { status: "ERROR", error: "Error en el servicio" }), signOk);
    const { client } = makeClient();

    const r = await run("TEST", client);

    expect(r.auth.status).toBe("ERROR");
    expect(r.auth.cause).toBe("REJECTED_UNSPECIFIED");
    expect(r.auth.httpStatus).toBe(200);
  });

  it("MH codigoMsg 106 CREDENCIALES INVÁLIDAS → credenciales rechazadas", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    installFetch(
      () => res(200, { status: "ERROR", body: { codigoMsg: "106", descripcionMsg: "CREDENCIALES INVÁLIDAS" } }),
      signOk,
    );
    const { client } = makeClient();

    const r = await run("TEST", client);

    expect(r.auth.status).toBe("ERROR");
    expect(r.auth.cause).toBe("MH_CREDENTIALS_REJECTED");
    expect(r.auth.externalCode).toBe("106");
    expect(r.auth.externalDescription).toBe("CREDENCIALES INVÁLIDAS");
    expect(r.signature.status).toBe("OK");
  });

  it("MH codigoMsg 101 CONTACTAR SOPORTE → error del servicio MH, NO contraseña incorrecta", async () => {
    decryptSpy.mockImplementation(() => payloadFor("PRODUCTION"));
    installFetch(
      () => res(200, { status: "ERROR", body: { codigoMsg: "101", descripcionMsg: "ERROR CONTACTAR CON SOPORTE TÉCNICO" } }),
      signOk,
    );
    const { client } = makeClient();

    const r = await run("PRODUCTION", client);

    expect(r.auth.status).toBe("ERROR");
    expect(r.auth.cause).toBe("MH_SERVICE_ERROR");
    expect(r.auth.cause).not.toBe("MH_CREDENTIALS_REJECTED");
    expect(r.auth.externalCode).toBe("101");
    expect(r.auth.externalDescription).toBe("ERROR CONTACTAR CON SOPORTE TÉCNICO");
  });

  it("HTTP 401 con codigoMsg desconocido no se atribuye a credenciales", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    installFetch(() => res(401, { status: "ERROR", body: { codigoMsg: "999", descripcionMsg: "OTRO" } }), signOk);
    const { client } = makeClient();

    const r = await run("TEST", client);
    expect(r.auth.cause).toBe("REJECTED_UNSPECIFIED");
  });

  it("solo lee campos permitidos de la respuesta MH (no vuelca el cuerpo)", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    installFetch(
      () => res(200, { status: "ERROR", body: { codigoMsg: "106", descripcionMsg: "CREDENCIALES INVÁLIDAS", interno: "STACKTRACE-XYZ" }, traza: "DEBUG-ABC" }),
      signOk,
    );
    const { client } = makeClient();

    const serialized = JSON.stringify(await run("TEST", client));
    expect(serialized).not.toContain("STACKTRACE-XYZ");
    expect(serialized).not.toContain("DEBUG-ABC");
  });

  it("HTTP 200 con status OK pero sin token no pasa", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    installFetch(() => res(200, { status: "OK", body: {} }), signOk);
    const { client } = makeClient();

    const r = await run("TEST", client);
    expect(r.auth.status).toBe("ERROR");
    expect(r.auth.cause).toBe("INVALID_RESPONSE");
  });

  it("auth fallida no impide comprobar la firma", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    installFetch(() => res(401, { status: "ERROR", error: "Unauthorized" }), signOk);
    const { client } = makeClient();

    const r = await run("TEST", client);

    expect(r.auth.status).toBe("ERROR");
    expect(r.auth.cause).toBe("MH_CREDENTIALS_REJECTED");
    expect(r.signature.status).toBe("OK");
  });

  it("HTTP 5xx se informa como error HTTP sin atribuir causa de credenciales", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    installFetch(() => res(503, undefined), signOk);
    const { client } = makeClient();

    const r = await run("TEST", client);
    expect(r.auth.cause).toBe("HTTP_ERROR");
    expect(r.auth.httpStatus).toBe(503);
  });

  it("timeout y TLS se clasifican", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const tls = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("certificate has expired"), { code: "CERT_HAS_EXPIRED" }) });
    installFetch(() => { throw abort; }, () => { throw tls; });
    const { client } = makeClient();

    const r = await run("TEST", client);
    expect(r.auth.cause).toBe("TIMEOUT");
    expect(r.signature.cause).toBe("TLS_ERROR");
  });
});

describe("Firma", () => {
  it("firma fallida no impide la autenticación; contraseña privada rechazada se identifica", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    installFetch(authOk, () => res(200, { status: "ERROR", body: { codigo: "COD_812", mensaje: "Contraseña de llave privada no valida" } }));
    const { client } = makeClient();

    const r = await run("TEST", client);

    expect(r.auth.status).toBe("OK");
    expect(r.signature.status).toBe("ERROR");
    expect(r.signature.cause).toBe("PRIVATE_KEY_PASSWORD_REJECTED");
    expect(r.signature.externalCode).toBe("COD_812");
  });

  it("certificado no encontrado se identifica", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    installFetch(authOk, () => res(200, { status: "ERROR", body: { codigo: "COD_803", mensaje: "No existe certificado para el nit" } }));
    const { client } = makeClient();

    const r = await run("TEST", client);
    expect(r.signature.cause).toBe("CERTIFICATE_NOT_FOUND");
  });

  it("rechazo sin causa distinguible no se atribuye a una causa específica", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    installFetch(authOk, () => res(200, { status: "ERROR", body: { codigo: "COD_899", mensaje: "Error interno" } }));
    const { client } = makeClient();

    const r = await run("TEST", client);
    expect(r.signature.cause).toBe("REJECTED_UNSPECIFIED");
  });

  it("HTTP 403 del proxy se reporta como API Key rechazada", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    installFetch(authOk, () => res(403, undefined));
    const { client } = makeClient();

    const r = await run("TEST", client);
    expect(r.signature.cause).toBe("SIGNER_API_KEY_REJECTED");
    expect(r.signature.httpStatus).toBe(403);
  });

  it("envía NIT sin guiones, contraseña privada, API Key propia y un JSON que no es un DTE", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    const fetchMock = installFetch(authOk, signOk);
    const { client } = makeClient();

    await run("TEST", client);

    const init = fetchMock.mock.calls.find((c) => c[0] === SIGNER_TEST)![1];
    const sent = JSON.parse(String(init.body));
    expect(sent.nit).toBe("06140101001010");
    expect(sent.passwordPri).toBe(SECRETS.passwordPri);
    expect((init.headers as Record<string, string>)["X-DTE-Signer-Key"]).toBe(SECRETS.apiKey);
    expect(sent.dteJson).not.toHaveProperty("identificacion");
    expect(sent.dteJson).not.toHaveProperty("numeroControl");
    expect(sent.dteJson).not.toHaveProperty("codigoGeneracion");
    expect(sent.dteJson).not.toHaveProperty("receptor");
    expect(sent.dteJson.tipo).toBe("ZOLVI_DIAGNOSTICO_FIRMA");
  });

  it.each([
    ["firma ausente (body vacío)", () => res(200, { status: "OK", body: "" })],
    ["firma malformada", () => res(200, { status: "OK", body: "no-es-un-jws" })],
    ["cabecera alg none", (_u: string, init: RequestInit) =>
      res(200, { status: "OK", body: `${b64url({ alg: "none" })}.${b64url(JSON.parse(String(init.body)).dteJson)}.${randomBytes(64).toString("base64url")}` })],
    ["contenido distinto", () => res(200, { status: "OK", body: makeJws({ tipo: "OTRO" }) })],
    ["status OK sin body string", () => res(200, { status: "OK", body: { foo: 1 } })],
  ] as Array<[string, Handler]>)("%s no pasa", async (_name, handler) => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    installFetch(authOk, handler);
    const { client } = makeClient();

    const r = await run("TEST", client);
    expect(r.signature.status).toBe("ERROR");
    expect(r.signature.contentVerified).toBe(false);
    expect(["SIGNATURE_MALFORMED", "SIGNATURE_CONTENT_MISMATCH"]).toContain(r.signature.cause);
  });

  it("datos del firmador ausentes NO usan DTE_SIGNER_* globales", async () => {
    process.env["DTE_SIGNER_NIT"] = "06140101001010";
    process.env["DTE_SIGNER_PASSWORD"] = "global-priv";
    process.env["DTE_SIGNER_URL_TEST"] = "https://global.example.com/firmardocumento/";
    decryptSpy.mockImplementation(() => payloadFor("TEST", { signerUrl: "", signerNit: "", signerPrivateKeyPassword: "" }));
    const fetchMock = installFetch(authOk, signOk);
    const { client } = makeClient();

    const r = await run("TEST", client);

    expect(r.signature.status).toBe("NOT_CONFIGURED");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("firmardocumento"))).toBe(false);
    expect(r.auth.status).toBe("OK");
  });

  it("firmador remoto sin API Key propia NO usa DTE_SIGNER_API_KEY global", async () => {
    process.env["DTE_SIGNER_API_KEY"] = "global-key";
    decryptSpy.mockImplementation(() => payloadFor("PRODUCTION", { signerApiKey: "" }));
    const fetchMock = installFetch(authOk, signOk);
    const { client } = makeClient();

    const r = await run("PRODUCTION", client);

    expect(r.signature.status).toBe("NOT_CONFIGURED");
    expect(r.signature.cause).toBe("SIGNER_API_KEY_MISSING");
    expect(fetchMock.mock.calls.some((c) => c[0] === SIGNER_PROD)).toBe(false);
  });

  it("URL de firmador no admitida no se contacta", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST", { signerUrl: "https://evil.example.com/otra-ruta" }));
    const fetchMock = installFetch(authOk, signOk);
    const { client } = makeClient();

    const r = await run("TEST", client);
    expect(r.signature.cause).toBe("SIGNER_URL_INVALID");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("evil"))).toBe(false);
  });
});

describe("Contexto, aislamiento y efectos", () => {
  it("sin emisor para el ambiente → ambas NO CONFIGURADA, sin llamadas externas", async () => {
    const fetchMock = installFetch(authOk, signOk);
    const { client, credentialFindFirst } = makeClient({ issuer: null });

    const r = await run("PRODUCTION", client);
    expect(r.auth.status).toBe("NOT_CONFIGURED");
    expect(r.signature.status).toBe("NOT_CONFIGURED");
    expect(credentialFindFirst).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin credencial del emisor → no hay fallback global, sin llamadas externas", async () => {
    process.env["DTE_MH_USER"] = "global-user";
    process.env["DTE_MH_PASSWORD"] = "global-pass";
    const fetchMock = installFetch(authOk, signOk);
    const { client, credentialFindFirst } = makeClient({ credential: null });

    const r = await run("TEST", client);
    expect(r.auth.cause).toBe("CREDENTIALS_MISSING");
    expect(r.signature.cause).toBe("CREDENTIALS_MISSING");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(credentialFindFirst.mock.calls[0]![0]).toMatchObject({
      where: { issuer_config_id: "issuer-TEST", credential_type: "MH_CREDENTIALS", is_active: true },
    });
  });

  it("credencial no descifrable → CREDENTIALS_UNREADABLE explícito", async () => {
    decryptSpy.mockImplementation(() => { throw new Error("bad key"); });
    const fetchMock = installFetch(authOk, signOk);
    const { client } = makeClient();

    const r = await run("TEST", client);
    expect(r.auth.cause).toBe("CREDENTIALS_UNREADABLE");
    expect(r.signature.cause).toBe("CREDENTIALS_UNREADABLE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("solo lee emisor/credencial: no hay escrituras, reservas ni transmisiones", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    const fetchMock = installFetch(authOk, signOk);
    const accessed = new Set<string>();
    const { client } = makeClient();
    const proxied = new Proxy(client as object, {
      get(target, prop: string) {
        accessed.add(prop);
        return (target as Record<string, unknown>)[prop];
      },
    }) as DteDiagnosticsDbClient;

    const r = await run("TEST", proxied);

    expect([...accessed].sort()).toEqual(["dteCredential", "dteIssuerConfig"]);
    expect(r.documentsTransmitted).toBe(false);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => /recepcion|anulardte|contingencia|consultadte/i.test(u))).toBe(false);
    expect(urls).toHaveLength(2);
  });

  it("solicitudes concurrentes del mismo ambiente → la segunda devuelve BUSY", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    installFetch(async (u, i) => { await gate; return authOk(u, i); }, signOk);
    const { client } = makeClient();

    const first = runDteEnvironmentDiagnostics({ tenantId: "tenant-1", locationId: "loc-1", environment: "TEST", client });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    const second = await runDteEnvironmentDiagnostics({ tenantId: "tenant-1", locationId: "loc-1", environment: "TEST", client });
    expect(second).toEqual({ ok: false, error: "BUSY" });

    release();
    const done = await first;
    expect(done.ok).toBe(true);

    // Liberado el lock, se puede volver a ejecutar.
    const third = await runDteEnvironmentDiagnostics({ tenantId: "tenant-1", locationId: "loc-1", environment: "TEST", client });
    expect(third.ok).toBe(true);
  });

  it("ningún secreto, token ni JWS aparece en el resultado, aunque el externo los repita", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    let jwsSeen = "";
    installFetch(
      () => res(401, { status: "ERROR", message: `pwd ${SECRETS.apiPassword} invalida Bearer ${SECRETS.token}` }),
      (_u, init) => {
        const sent = JSON.parse(String(init.body));
        jwsSeen = makeJws(sent.dteJson);
        return res(200, { status: "ERROR", body: { codigo: "X1", mensaje: `clave ${SECRETS.passwordPri} key ${SECRETS.apiKey} ${jwsSeen}` } });
      },
    );
    const { client } = makeClient();

    const r = await run("TEST", client);
    const serialized = JSON.stringify(r);
    for (const secret of Object.values(SECRETS)) expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(jwsSeen);
    expect(serialized).toContain("[redactado]");
  });

  it("en éxito no se devuelve token ni JWS", async () => {
    decryptSpy.mockImplementation(() => payloadFor("TEST"));
    installFetch(authOk, signOk);
    const { client } = makeClient();

    const r = await run("TEST", client);
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain(SECRETS.token);
    expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
    expect(r.signature.cryptoVerified).toBe(false);
    expect(r.signature.contentVerified).toBe(true);
  });
});

describe("helpers", () => {
  it("sanitizeExternalText trunca, elimina control y redacta", () => {
    const out = sanitizeExternalText(`a\u0000b ${"x".repeat(300)} secretvalue`, ["secretvalue"]);
    expect(out!.length).toBeLessThanOrEqual(160);
    expect(out).not.toContain("\u0000");
    expect(sanitizeExternalText({ nested: "x" }, [])).toBeUndefined();
  });

  it("verifySignedDiagnostic acepta mismo contenido con distinto orden de claves", () => {
    const jws = makeJws({ b: "2", a: "1" });
    expect(verifySignedDiagnostic(jws, { a: "1", b: "2" })).toEqual({ ok: true });
    expect(verifySignedDiagnostic(jws, { a: "1", b: "3" }).ok).toBe(false);
  });
});
