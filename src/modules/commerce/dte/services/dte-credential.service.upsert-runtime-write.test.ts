// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-credential.service.upsert-runtime-write.test.ts
//
// FASE VI-E2B — upsertDteCredential ahora acepta un `db` explícito
// (por defecto prisma global). Certifica que, con un `db` runtime
// explícito, TODAS las queries (issuer lookup, credential lookup,
// create/update) corren sobre ese client — nunca sobre prisma global.
//
// DTE_CREDENTIAL_SAME_RUNTIME_AS_ISSUER: como DteCredential no tiene
// tenant_id/location_id propios (solo issuer_config_id), la única
// forma de que una escritura de credencial toque el emisor correcto
// es que AMBAS lecturas (issuer + credential existente) y la
// escritura final corran sobre el MISMO client — exactamente lo que
// este test certifica.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const { globalIssuerFindFirstSpy, globalCredentialFindFirstSpy, globalCredentialCreateSpy } = vi.hoisted(() => ({
  globalIssuerFindFirstSpy: vi.fn(),
  globalCredentialFindFirstSpy: vi.fn(),
  globalCredentialCreateSpy: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    dteIssuerConfig: { findFirst: globalIssuerFindFirstSpy },
    dteCredential: { findFirst: globalCredentialFindFirstSpy, create: globalCredentialCreateSpy, update: vi.fn() },
  },
}));

vi.mock("../lib/dte-credential-encryption", () => ({
  encryptDteCredentialPayload: vi.fn(() => "encrypted-payload"),
  decryptDteCredentialPayload: vi.fn(() => ({
    apiUser: "", apiPassword: "", signerUrl: "", signerNit: "", signerPrivateKeyPassword: "", signerApiKey: "",
  })),
}));

import { upsertDteCredential } from "./dte-credential.service";

function fakeRuntimeClient(overrides: { issuer?: unknown; existingCredential?: unknown } = {}) {
  const findFirstIssuer = vi.fn(async () => ("issuer" in overrides ? overrides.issuer : { id: "issuer-runtime-1" }));
  const findFirst = vi.fn(async () => overrides.existingCredential ?? null);
  const create = vi.fn(async () => ({ id: "cred-runtime-1" }));
  const update = vi.fn(async () => ({ id: "cred-runtime-1" }));
  const client = {
    dteIssuerConfig: { findFirst: findFirstIssuer },
    dteCredential: { findFirst, create, update },
  };
  return { client: client as unknown as PrismaClient, findFirstIssuer, findFirst, create, update };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upsertDteCredential — runtime `db` param (FASE VI-E2B)", () => {
  it("con `db` runtime -> issuer lookup, credential lookup y create corren en el mismo client runtime, nunca en prisma global", async () => {
    const { client, findFirstIssuer, findFirst, create } = fakeRuntimeClient();

    const result = await upsertDteCredential("issuer-runtime-1", "tenant-1", "loc-1", "user-1", { apiUser: "mh-user" }, client);

    expect(result).toEqual({ ok: true });
    expect(findFirstIssuer).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(globalIssuerFindFirstSpy).not.toHaveBeenCalled();
    expect(globalCredentialFindFirstSpy).not.toHaveBeenCalled();
    expect(globalCredentialCreateSpy).not.toHaveBeenCalled();
  });

  it("sin `db` -> cae al prisma global (comportamiento PLATFORM_NATIVE sin cambios)", async () => {
    globalIssuerFindFirstSpy.mockResolvedValue({ id: "issuer-legacy-1" });
    globalCredentialFindFirstSpy.mockResolvedValue(null);
    globalCredentialCreateSpy.mockResolvedValue({ id: "cred-legacy-1" });

    const result = await upsertDteCredential("issuer-legacy-1", "tenant-1", "loc-1", "user-1", { apiUser: "mh-user" });

    expect(result).toEqual({ ok: true });
    expect(globalIssuerFindFirstSpy).toHaveBeenCalledTimes(1);
    expect(globalCredentialCreateSpy).toHaveBeenCalledTimes(1);
  });

  it("cross-tenant: issuer_config_id no existe en el client runtime A (pertenece a runtime B) -> deniega, create/update NUNCA se invoca", async () => {
    const { client, create, update } = fakeRuntimeClient({ issuer: null });

    const result = await upsertDteCredential("issuer-of-runtime-B", "tenant-1", "loc-1", "user-1", {}, client);

    expect(result).toEqual({ ok: false, error: "La configuración DTE indicada no existe." });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("credencial existente -> update corre en el client runtime, nunca create ni prisma global", async () => {
    const { client, update, create } = fakeRuntimeClient({ existingCredential: { id: "cred-existing", encrypted_payload: null } });

    const result = await upsertDteCredential("issuer-runtime-1", "tenant-1", "loc-1", "user-1", { apiUser: "updated-user" }, client);

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(globalCredentialCreateSpy).not.toHaveBeenCalled();
  });

  // SHARED-PILOT-1B — mismo PrismaClient físico sirviendo dos tenants
  // (TrustMe + Cliente 3). El issuer_config_id existe realmente en la DB,
  // pero pertenece a Tenant A: Tenant B lo conoce (UUID filtrado de logs,
  // URL manipulada, etc.) pero no debe poder escribir su credencial.
  it("SHARED-PILOT-1B — same-DB cross-tenant: Tenant B conoce issuer_config_id de Tenant A -> upsert FAIL CLOSED, no create/update", async () => {
    // El fake de findFirst ya filtra por tenant_id/location_id como lo
    // haría Postgres real — Tenant B nunca ve el issuer de Tenant A.
    const findFirstIssuer = vi.fn(async ({ where }: { where: { id: string; tenant_id: string; location_id: string } }) => {
      const issuerA = { id: "issuer-tenant-A", tenant_id: "tenant-A", location_id: "loc-A" };
      return where.id === issuerA.id && where.tenant_id === issuerA.tenant_id && where.location_id === issuerA.location_id
        ? { id: issuerA.id }
        : null;
    });
    const findFirst = vi.fn();
    const create = vi.fn();
    const update = vi.fn();
    const sharedClient = {
      dteIssuerConfig: { findFirst: findFirstIssuer },
      dteCredential: { findFirst, create, update },
    } as unknown as PrismaClient;

    const result = await upsertDteCredential(
      "issuer-tenant-A",
      "tenant-B",
      "loc-B",
      "user-tenant-B",
      { apiUser: "attacker-user", apiPassword: "attacker-pass" },
      sharedClient,
    );

    expect(result).toEqual({ ok: false, error: "La configuración DTE indicada no existe." });
    expect(findFirst).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();

    // Tenant A, mismo client físico, sí puede operar sobre su propio issuer.
    const okResult = await upsertDteCredential(
      "issuer-tenant-A",
      "tenant-A",
      "loc-A",
      "user-tenant-A",
      { apiUser: "owner-user" },
      sharedClient,
    );
    expect(findFirstIssuer).toHaveBeenCalledTimes(2);
    expect(okResult.ok).toBe(true);
  });
});
