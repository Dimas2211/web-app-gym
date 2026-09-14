// ─────────────────────────────────────────────────────────────────
// platform/runtime — resolve-organization-by-hostname.test.ts
//
// FASE VI-C — ETAPA V. Mocks puros — sin remote DB. Certifica
// duplicate-domain fail-closed, not-found, hostname inválido y
// organization status gating.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import {
  resolveOrganizationByHostname,
  canOrganizationAuthenticate,
  RuntimeOrganizationLookupError,
  type OrganizationLookupClient,
  type RuntimeOrganizationLookupResult,
} from "./resolve-organization-by-hostname";

function fakeClient(rows: RuntimeOrganizationLookupResult[]): OrganizationLookupClient {
  return {
    platformOrganization: {
      findMany: vi.fn().mockResolvedValue(rows),
    },
  };
}

const ORG_ACTIVE: RuntimeOrganizationLookupResult = {
  id: "org-1",
  name: "TrustMe (synthetic)",
  tenant_id: "tenant-1",
  status: "ACTIVE",
};

describe("resolveOrganizationByHostname", () => {
  it("0 resultados → RUNTIME_ORG_NOT_FOUND", async () => {
    const client = fakeClient([]);
    await expect(resolveOrganizationByHostname("unknown.host", client)).rejects.toMatchObject({
      code: "RUNTIME_ORG_NOT_FOUND",
    });
  });

  it("1 resultado → retorna la organización", async () => {
    const client = fakeClient([ORG_ACTIVE]);
    const result = await resolveOrganizationByHostname("trustme.getzolvi.com", client);
    expect(result).toEqual(ORG_ACTIVE);
  });

  it("2+ resultados (dominio duplicado) → RUNTIME_ORG_AMBIGUOUS, fail closed, nunca elige el primero", async () => {
    const other: RuntimeOrganizationLookupResult = { ...ORG_ACTIVE, id: "org-2" };
    const client = fakeClient([ORG_ACTIVE, other]);
    await expect(resolveOrganizationByHostname("dup.host", client)).rejects.toMatchObject({
      code: "RUNTIME_ORG_AMBIGUOUS",
    });
  });

  it("hostname inválido (con protocolo/path) → RUNTIME_ORG_INVALID_HOSTNAME sin consultar la DB", async () => {
    const client = fakeClient([ORG_ACTIVE]);
    await expect(
      resolveOrganizationByHostname("https://trustme.getzolvi.com/", client),
    ).rejects.toMatchObject({ code: "RUNTIME_ORG_INVALID_HOSTNAME" });
    expect(client.platformOrganization.findMany).not.toHaveBeenCalled();
  });

  it("errores son instancia de RuntimeOrganizationLookupError", async () => {
    const client = fakeClient([]);
    await expect(resolveOrganizationByHostname("unknown.host", client)).rejects.toBeInstanceOf(
      RuntimeOrganizationLookupError,
    );
  });
});

describe("canOrganizationAuthenticate", () => {
  it("ACTIVE → true", () => {
    expect(canOrganizationAuthenticate({ status: "ACTIVE" })).toBe(true);
  });

  it("PENDING → true (elegibilidad técnica; enforcement de licencia es otra capa)", () => {
    expect(canOrganizationAuthenticate({ status: "PENDING" })).toBe(true);
  });

  it("SUSPENDED → false", () => {
    expect(canOrganizationAuthenticate({ status: "SUSPENDED" })).toBe(false);
  });

  it("CANCELLED → false", () => {
    expect(canOrganizationAuthenticate({ status: "CANCELLED" })).toBe(false);
  });
});
