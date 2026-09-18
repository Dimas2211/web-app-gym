// ─────────────────────────────────────────────────────────────────
// commerce/dte — upsert-dte-credential.action.test.ts
//
// FASE VI-E2B — migrado a requireOperationalContext: certifica que
// upsertDteCredentialAction usa el client EFECTIVO (runtime cuando
// aplica, nunca Prisma global implícito), bloquea bajo Support Session
// de solo lectura ANTES de tocar la DB, y falla closed si el contexto
// operacional no puede resolverse.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const {
  requireOperationalContextMock,
  disposeMock,
  FakeOperationalContextError,
  dteIssuerConfigFindFirstSpy,
  upsertDteCredentialSpy,
} = vi.hoisted(() => {
  class FakeOperationalContextError extends Error {
    code: string;
    httpStatus: number;
    userMessage: string;
    constructor(code: string, userMessage: string, httpStatus: number) {
      super(userMessage);
      this.code = code;
      this.httpStatus = httpStatus;
      this.userMessage = userMessage;
    }
  }
  return {
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
    dteIssuerConfigFindFirstSpy: vi.fn(),
    upsertDteCredentialSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("../services/dte-credential.service", () => ({
  upsertDteCredential: upsertDteCredentialSpy,
}));

import { upsertDteCredentialAction } from "./upsert-dte-credential.action";

function fakeHandle(overrides: Partial<{ client: unknown; tenantId: string; locationId: string | null }> = {}) {
  const client = overrides.client ?? { dteIssuerConfig: { findFirst: dteIssuerConfigFindFirstSpy } };
  return {
    context: {
      effectiveUser: { id: "u1", role: "super_admin" },
      tenantId: overrides.tenantId ?? "tenant-1",
      locationId: overrides.locationId === undefined ? "loc-1" : overrides.locationId,
      client,
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  dteIssuerConfigFindFirstSpy.mockReset();
  upsertDteCredentialSpy.mockReset();
});

describe("upsertDteCredentialAction — FASE VI-E2B", () => {
  it("requireOperationalContext falla (READ_ONLY bajo Support Session) -> bloquea ANTES de tocar la DB", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );

    const fd = new FormData();
    fd.set("issuer_config_id", "11111111-1111-1111-1111-111111111111");

    const result = await upsertDteCredentialAction(undefined, fd);

    expect(result).toMatchObject({ error: "Modo runtime read-only activo." });
    expect(dteIssuerConfigFindFirstSpy).not.toHaveBeenCalled();
    expect(upsertDteCredentialSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> el guard no bloquea, continúa el flujo (llega a consultar el issuer config vía context.client)", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());
    dteIssuerConfigFindFirstSpy.mockResolvedValue(null);

    const fd = new FormData();
    fd.set("issuer_config_id", "11111111-1111-1111-1111-111111111111");

    const result = await upsertDteCredentialAction(undefined, fd);

    expect(dteIssuerConfigFindFirstSpy).toHaveBeenCalled();
    expect(result).toMatchObject({ error: expect.stringContaining("no pertenece") });
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("issuer pertenece al tenant -> forwardea context.client al service (nunca Prisma global implícito)", async () => {
    const runtimeDbMarker = { dteIssuerConfig: { findFirst: dteIssuerConfigFindFirstSpy }, __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    dteIssuerConfigFindFirstSpy.mockResolvedValue({ id: "issuer-1" });
    upsertDteCredentialSpy.mockResolvedValue({ ok: true });

    const fd = new FormData();
    fd.set("issuer_config_id", "33333333-3333-3333-3333-333333333333");
    fd.set("apiUser", "mh-user");

    const result = await upsertDteCredentialAction(undefined, fd);

    expect(result).toMatchObject({ success: true });
    expect(upsertDteCredentialSpy).toHaveBeenCalledWith(
      "issuer-1",
      "u1",
      expect.objectContaining({ apiUser: "mh-user" }),
      runtimeDbMarker,
    );
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("cross-tenant: issuer de otro tenant no aparece en context.client -> deniega, upsertDteCredential NUNCA se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ tenantId: "tenant-A" }));
    // El lookup usa where: { tenant_id: context.tenantId } — un issuer de tenant-B nunca es devuelto.
    dteIssuerConfigFindFirstSpy.mockResolvedValue(null);

    const fd = new FormData();
    fd.set("issuer_config_id", "44444444-4444-4444-4444-444444444444");

    const result = await upsertDteCredentialAction(undefined, fd);

    expect(result).toMatchObject({ error: expect.stringContaining("no pertenece") });
    expect(upsertDteCredentialSpy).not.toHaveBeenCalled();
  });
});
