// ─────────────────────────────────────────────────────────────────
// platform — fiscal-onboarding.diagnostics.action.test.ts
//
// runFiscalEnvironmentDiagnosticsAction (Platform Admin → Onboarding
// fiscal): permisos, read-only, aislamiento tenant/sucursal/emisor,
// ambientes inactivos, reutilización del servicio y resultados sin
// secretos. Sin red: el servicio real corre con fetch simulado.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";

const h = vi.hoisted(() => ({
  requireSuperAdmin:     vi.fn(),
  isRuntimeReadOnly:     vi.fn(),
  orgFindUnique:         vi.fn(),
  withOrgRuntime:        vi.fn(),
  decrypt:               vi.fn(),
  serviceSpy:            vi.fn(),
  realService:           null as null | ((...args: never[]) => unknown),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions/guards", () => ({ requireSuperAdmin: h.requireSuperAdmin }));
vi.mock("@/modules/platform/runtime/runtime-session", () => ({
  isRuntimeReadOnlyActive: h.isRuntimeReadOnly,
  RUNTIME_READONLY_MESSAGE: "Modo solo lectura.",
}));
vi.mock("@/modules/platform/runtime/control-plane-prisma", () => ({
  controlPlanePrisma: { platformOrganization: { findUnique: h.orgFindUnique } },
}));
vi.mock("@/modules/platform/runtime/runtime-database-router", () => ({
  withOrganizationRuntimePrisma: h.withOrgRuntime,
}));
vi.mock("@/modules/commerce/dte/lib/dte-credential-encryption", () => ({ decryptDteCredentialPayload: h.decrypt }));
// Spy que delega en el servicio REAL: prueba la reutilización sin duplicar lógica.
vi.mock("@/modules/commerce/dte/services/dte-environment-diagnostics.service", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/modules/commerce/dte/services/dte-environment-diagnostics.service")>();
  h.realService = real.runDteEnvironmentDiagnostics as (...args: never[]) => unknown;
  return { ...real, runDteEnvironmentDiagnostics: h.serviceSpy };
});
// Dependencias del módulo de acciones que esta prueba no ejercita.
vi.mock("@/modules/platform/dte-onboarding/fiscal-onboarding-status.service", () => ({ getFiscalOnboardingStatus: vi.fn() }));
vi.mock("@/modules/platform/dte-onboarding/signer-provisioning.service", () => ({}));
vi.mock("@/modules/platform/dte-onboarding/dte-mariadb-integration.service", () => ({}));
vi.mock("@/modules/commerce/dte/outbox/external-delivery-processor.service", () => ({}));
vi.mock("@/modules/commerce/dte/outbox/external-delivery-ledger", () => ({}));

import { runFiscalEnvironmentDiagnosticsAction } from "./fiscal-onboarding.action";

const SECRETS = {
  apiPassword: "MhPlatformPass!secret",
  passwordPri: "PrivPlatform#secret",
  apiKey:      "platform-signer-key-secret",
  token:       "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJ4In0.c2ln",
};

const ORG = "org-1";
const TENANT = "tenant-1";

interface IssuerRow { id: string; tenant_id: string; location_id: string; environment: string; is_active: boolean }
interface BranchRow { id: string; tenant_id: string }

function makeRuntime(issuers: IssuerRow[], branches: BranchRow[]) {
  const writes: string[] = [];
  const issuerFindFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    const rows = issuers
      .filter((i) => Object.entries(where).every(([k, v]) => (i as unknown as Record<string, unknown>)[k] === v))
      .sort((a, b) => Number(b.is_active) - Number(a.is_active));
    return rows[0] ? { id: rows[0].id, location_id: rows[0].location_id } : null;
  });
  const credentialFindFirst = vi.fn(async ({ where }: { where: { issuer_config_id: string } }) =>
    issuers.some((i) => i.id === where.issuer_config_id) ? { encrypted_payload: `enc-${where.issuer_config_id}` } : null,
  );
  const branchFindFirst = vi.fn(async ({ where }: { where: { id: string; tenant_id: string } }) =>
    branches.find((b) => b.id === where.id && b.tenant_id === where.tenant_id) ? { id: where.id } : null,
  );
  const writeTrap = (name: string) => vi.fn(async () => { writes.push(name); throw new Error(`write ${name}`); });
  const client = {
    dteIssuerConfig: { findFirst: issuerFindFirst, update: writeTrap("dteIssuerConfig.update"), updateMany: writeTrap("dteIssuerConfig.updateMany") },
    dteCredential:   { findFirst: credentialFindFirst, update: writeTrap("dteCredential.update") },
    branch:          { findFirst: branchFindFirst },
    dteOutgoingDocument: { create: writeTrap("dteOutgoingDocument.create") },
    dteCorrelative:  { update: writeTrap("dteCorrelative.update") },
  };
  return { client, issuerFindFirst, credentialFindFirst, branchFindFirst, writes };
}

function b64url(v: unknown) { return Buffer.from(JSON.stringify(v)).toString("base64url"); }

function installFetch() {
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (url.includes("/seguridad/auth")) {
      return { ok: true, status: 200, json: async () => ({ status: "OK", body: { token: SECRETS.token } }) } as unknown as Response;
    }
    const sent = JSON.parse(String(init.body));
    const jws = `${b64url({ alg: "RS512" })}.${b64url(sent.dteJson)}.${randomBytes(256).toString("base64url")}`;
    return { ok: true, status: 200, json: async () => ({ status: "OK", body: jws }) } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function payload(env: "TEST" | "PRODUCTION") {
  return {
    apiUser: "06140101001010", apiPassword: SECRETS.apiPassword,
    signerUrl: `https://signer-${env.toLowerCase()}.example.com/firmardocumento/`,
    signerNit: "06140101001010", signerPrivateKeyPassword: SECRETS.passwordPri, signerApiKey: SECRETS.apiKey,
  };
}

let logSpies: Array<ReturnType<typeof vi.spyOn>> = [];

beforeEach(() => {
  for (const m of [h.requireSuperAdmin, h.isRuntimeReadOnly, h.orgFindUnique, h.withOrgRuntime, h.decrypt, h.serviceSpy]) m.mockReset();
  h.serviceSpy.mockImplementation(h.realService!);
  h.requireSuperAdmin.mockResolvedValue({ id: "pa-1", role: "super_admin", auth_scope: "PLATFORM" });
  h.isRuntimeReadOnly.mockResolvedValue(false);
  h.orgFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === ORG ? { id: ORG, tenant_id: TENANT } : null,
  );
  h.decrypt.mockImplementation((enc: string) => payload(enc.includes("prod") ? "PRODUCTION" : "TEST"));
  logSpies = (["info", "log", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
});

afterEach(() => {
  const logged = logSpies.flatMap((s) => s.mock.calls.map((c) => JSON.stringify(c))).join("\n");
  for (const s of Object.values(SECRETS)) expect(logged).not.toContain(s);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("runFiscalEnvironmentDiagnosticsAction", () => {
  it("exige Platform Admin (requireSuperAdmin) antes de todo", async () => {
    h.requireSuperAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(runFiscalEnvironmentDiagnosticsAction(ORG, "TEST")).rejects.toThrow("NEXT_REDIRECT");
    expect(h.withOrgRuntime).not.toHaveBeenCalled();
    expect(h.serviceSpy).not.toHaveBeenCalled();
  });

  it("bloqueada bajo 'Operar como cliente' (solo lectura)", async () => {
    h.isRuntimeReadOnly.mockResolvedValue(true);
    const r = await runFiscalEnvironmentDiagnosticsAction(ORG, "PRODUCTION");
    expect(r).toEqual({ ok: false, error: "Modo solo lectura." });
    expect(h.orgFindUnique).not.toHaveBeenCalled();
    expect(h.withOrgRuntime).not.toHaveBeenCalled();
  });

  it("ambiente inválido y organización inexistente → rechazo sin runtime", async () => {
    expect((await runFiscalEnvironmentDiagnosticsAction(ORG, "STAGING")).ok).toBe(false);
    expect(await runFiscalEnvironmentDiagnosticsAction("org-x", "TEST")).toEqual({ ok: false, error: "Organización no encontrada." });
    expect(h.withOrgRuntime).not.toHaveBeenCalled();
  });

  it("organización sin tenant → rechazo", async () => {
    h.orgFindUnique.mockResolvedValue({ id: ORG, tenant_id: null });
    const r = await runFiscalEnvironmentDiagnosticsAction(ORG, "TEST");
    expect(r).toEqual({ ok: false, error: "Organización sin tenant." });
    expect(h.withOrgRuntime).not.toHaveBeenCalled();
  });

  it("PRODUCTION inactivo: reutiliza el servicio con tenant/sucursal resueltos en servidor y solo llama destinos PRODUCTION", async () => {
    const rt = makeRuntime(
      [
        { id: "iss-test", tenant_id: TENANT, location_id: "loc-1", environment: "TEST", is_active: true },
        { id: "iss-prod", tenant_id: TENANT, location_id: "loc-1", environment: "PRODUCTION", is_active: false },
      ],
      [{ id: "loc-1", tenant_id: TENANT }],
    );
    h.withOrgRuntime.mockImplementation(async (orgId: string, cb: (c: unknown) => unknown) => {
      expect(orgId).toBe(ORG);
      return cb(rt.client);
    });
    const fetchMock = installFetch();

    const r = await runFiscalEnvironmentDiagnosticsAction(ORG, "PRODUCTION");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.environment).toBe("PRODUCTION");
    expect(r.result.auth.status).toBe("OK");
    expect(r.result.signature.status).toBe("OK");
    expect(h.serviceSpy).toHaveBeenCalledTimes(1);
    expect(h.serviceSpy).toHaveBeenCalledWith({ tenantId: TENANT, locationId: "loc-1", environment: "PRODUCTION", client: rt.client });
    const urls = fetchMock.mock.calls.map((c) => String(c[0])).sort();
    expect(urls).toEqual(["https://api.dtes.mh.gob.sv/seguridad/auth", "https://signer-production.example.com/firmardocumento/"]);
    expect(rt.writes).toEqual([]);
  });

  it("TEST activo también se puede probar después de activado", async () => {
    const rt = makeRuntime(
      [{ id: "iss-test", tenant_id: TENANT, location_id: "loc-1", environment: "TEST", is_active: true }],
      [{ id: "loc-1", tenant_id: TENANT }],
    );
    h.withOrgRuntime.mockImplementation(async (_o: string, cb: (c: unknown) => unknown) => cb(rt.client));
    const fetchMock = installFetch();

    const r = await runFiscalEnvironmentDiagnosticsAction(ORG, "TEST");
    expect(r.ok && r.result.auth.status).toBe("OK");
    expect(r.ok && r.result.signature.status).toBe("OK");
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toContain("https://apitest.dtes.mh.gob.sv/seguridad/auth");
  });

  it("aislamiento SHARED: emisores de otro tenant en la misma base no se usan", async () => {
    const rt = makeRuntime(
      [{ id: "iss-other", tenant_id: "tenant-2", location_id: "loc-9", environment: "PRODUCTION", is_active: true }],
      [{ id: "loc-9", tenant_id: "tenant-2" }],
    );
    h.withOrgRuntime.mockImplementation(async (_o: string, cb: (c: unknown) => unknown) => cb(rt.client));
    const fetchMock = installFetch();

    const r = await runFiscalEnvironmentDiagnosticsAction(ORG, "PRODUCTION");

    expect(r).toEqual({ ok: false, error: "No existe configuración de emisor PRODUCTION para esta organización." });
    expect(rt.issuerFindFirst.mock.calls[0]![0].where).toEqual({ tenant_id: TENANT, environment: "PRODUCTION" });
    expect(h.serviceSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sucursal del emisor que no pertenece al tenant → rechazo sin pruebas externas", async () => {
    const rt = makeRuntime(
      [{ id: "iss-prod", tenant_id: TENANT, location_id: "loc-foreign", environment: "PRODUCTION", is_active: false }],
      [{ id: "loc-foreign", tenant_id: "tenant-2" }],
    );
    h.withOrgRuntime.mockImplementation(async (_o: string, cb: (c: unknown) => unknown) => cb(rt.client));
    const fetchMock = installFetch();

    const r = await runFiscalEnvironmentDiagnosticsAction(ORG, "PRODUCTION");
    expect(r.ok).toBe(false);
    expect(h.serviceSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runtime no disponible → error sanitizado", async () => {
    h.withOrgRuntime.mockRejectedValue(Object.assign(new Error("postgres://user:pw@host/db failed"), { name: "RuntimeDatabaseError" }));
    const r = await runFiscalEnvironmentDiagnosticsAction(ORG, "TEST");
    expect(r).toEqual({ ok: false, error: "Runtime no disponible (RuntimeDatabaseError)." });
  });

  it("resultado sin secretos, token ni JWS", async () => {
    const rt = makeRuntime(
      [{ id: "iss-test", tenant_id: TENANT, location_id: "loc-1", environment: "TEST", is_active: true }],
      [{ id: "loc-1", tenant_id: TENANT }],
    );
    h.withOrgRuntime.mockImplementation(async (_o: string, cb: (c: unknown) => unknown) => cb(rt.client));
    installFetch();

    const serialized = JSON.stringify(await runFiscalEnvironmentDiagnosticsAction(ORG, "TEST"));
    for (const s of Object.values(SECRETS)) expect(serialized).not.toContain(s);
    expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
  });
});
