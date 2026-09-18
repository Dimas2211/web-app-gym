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

const { globalIssuerFindUniqueSpy, globalCredentialFindFirstSpy, globalCredentialCreateSpy } = vi.hoisted(() => ({
  globalIssuerFindUniqueSpy: vi.fn(),
  globalCredentialFindFirstSpy: vi.fn(),
  globalCredentialCreateSpy: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    dteIssuerConfig: { findUnique: globalIssuerFindUniqueSpy },
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
  const findUnique = vi.fn(async () => ("issuer" in overrides ? overrides.issuer : { id: "issuer-runtime-1" }));
  const findFirst = vi.fn(async () => overrides.existingCredential ?? null);
  const create = vi.fn(async () => ({ id: "cred-runtime-1" }));
  const update = vi.fn(async () => ({ id: "cred-runtime-1" }));
  const client = {
    dteIssuerConfig: { findUnique },
    dteCredential: { findFirst, create, update },
  };
  return { client: client as unknown as PrismaClient, findUnique, findFirst, create, update };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upsertDteCredential — runtime `db` param (FASE VI-E2B)", () => {
  it("con `db` runtime -> issuer lookup, credential lookup y create corren en el mismo client runtime, nunca en prisma global", async () => {
    const { client, findUnique, findFirst, create } = fakeRuntimeClient();

    const result = await upsertDteCredential("issuer-runtime-1", "user-1", { apiUser: "mh-user" }, client);

    expect(result).toEqual({ ok: true });
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(globalIssuerFindUniqueSpy).not.toHaveBeenCalled();
    expect(globalCredentialFindFirstSpy).not.toHaveBeenCalled();
    expect(globalCredentialCreateSpy).not.toHaveBeenCalled();
  });

  it("sin `db` -> cae al prisma global (comportamiento PLATFORM_NATIVE sin cambios)", async () => {
    globalIssuerFindUniqueSpy.mockResolvedValue({ id: "issuer-legacy-1" });
    globalCredentialFindFirstSpy.mockResolvedValue(null);
    globalCredentialCreateSpy.mockResolvedValue({ id: "cred-legacy-1" });

    const result = await upsertDteCredential("issuer-legacy-1", "user-1", { apiUser: "mh-user" });

    expect(result).toEqual({ ok: true });
    expect(globalIssuerFindUniqueSpy).toHaveBeenCalledTimes(1);
    expect(globalCredentialCreateSpy).toHaveBeenCalledTimes(1);
  });

  it("cross-tenant: issuer_config_id no existe en el client runtime A (pertenece a runtime B) -> deniega, create/update NUNCA se invoca", async () => {
    const { client, create, update } = fakeRuntimeClient({ issuer: null });

    const result = await upsertDteCredential("issuer-of-runtime-B", "user-1", {}, client);

    expect(result).toEqual({ ok: false, error: "La configuración DTE indicada no existe." });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("credencial existente -> update corre en el client runtime, nunca create ni prisma global", async () => {
    const { client, update, create } = fakeRuntimeClient({ existingCredential: { id: "cred-existing", encrypted_payload: null } });

    const result = await upsertDteCredential("issuer-runtime-1", "user-1", { apiUser: "updated-user" }, client);

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(globalCredentialCreateSpy).not.toHaveBeenCalled();
  });
});
