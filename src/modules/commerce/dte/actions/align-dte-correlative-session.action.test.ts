// ─────────────────────────────────────────────────────────────────
// commerce/dte — align-dte-correlative-session.action.test.ts
//
// FASE VI-E2B — migrado a requireOperationalContext: certifica que
// alignDteCorrelativeSessionAction usa context.client (efectivo/
// runtime), bloquea bajo Support Session de solo lectura ANTES de
// tocar la DB, y falla closed si el contexto operacional no puede
// resolverse.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireSuperAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const {
  requireOperationalContextMock,
  disposeMock,
  FakeOperationalContextError,
  dteIssuerConfigFindFirstSpy,
  alignDteCorrelativeBaselineSpy,
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
    alignDteCorrelativeBaselineSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("../services/dte-correlative.service", () => ({
  alignDteCorrelativeBaseline: alignDteCorrelativeBaselineSpy,
}));

import { alignDteCorrelativeSessionAction } from "./align-dte-correlative-session.action";

function validFormData(): FormData {
  const fd = new FormData();
  fd.set("location_id", "loc-1");
  fd.set("issuer_config_id", "11111111-1111-1111-1111-111111111111");
  fd.set("environment", "PRODUCTION");
  fd.set("dte_type_code", "01");
  fd.set("cod_estable_mh", "M001");
  fd.set("cod_punto_venta_mh", "P001");
  fd.set("last_used_sequence", "5");
  fd.set("notes", "Migración desde sistema anterior.");
  return fd;
}

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
  alignDteCorrelativeBaselineSpy.mockReset();
});

describe("alignDteCorrelativeSessionAction — FASE VI-E2B", () => {
  it("requireOperationalContext falla (READ_ONLY bajo Support Session) -> bloquea ANTES de tocar la DB", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );

    const result = await alignDteCorrelativeSessionAction(undefined, validFormData());

    expect(result).toMatchObject({ error: "Modo runtime read-only activo." });
    expect(dteIssuerConfigFindFirstSpy).not.toHaveBeenCalled();
    expect(alignDteCorrelativeBaselineSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> el guard no bloquea, continúa el flujo (llega a consultar el issuer config vía context.client)", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());
    dteIssuerConfigFindFirstSpy.mockResolvedValue(null);

    const result = await alignDteCorrelativeSessionAction(undefined, validFormData());

    expect(dteIssuerConfigFindFirstSpy).toHaveBeenCalled();
    expect(result).toMatchObject({ error: expect.stringContaining("no corresponde") });
  });

  it("datos válidos -> forwardea context.client y context.tenantId al service (nunca Prisma global)", async () => {
    const runtimeDbMarker = { dteIssuerConfig: { findFirst: dteIssuerConfigFindFirstSpy }, __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    dteIssuerConfigFindFirstSpy.mockResolvedValue({ id: "cfg-1", cod_estable_mh: "M001", cod_punto_venta_mh: "P001" });
    alignDteCorrelativeBaselineSpy.mockResolvedValue({ ok: true, next_sequence: 6 });

    const result = await alignDteCorrelativeSessionAction(undefined, validFormData());

    expect(result).toMatchObject({ success: true, next_sequence: 6 });
    expect(alignDteCorrelativeBaselineSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "tenant-1", user_id: "u1" }),
      runtimeDbMarker,
    );
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("cross-tenant: issuer de otro tenant no aparece en context.client -> deniega, alignDteCorrelativeBaseline NUNCA se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ tenantId: "tenant-A" }));
    dteIssuerConfigFindFirstSpy.mockResolvedValue(null);

    const result = await alignDteCorrelativeSessionAction(undefined, validFormData());

    expect(result).toMatchObject({ error: expect.stringContaining("no corresponde") });
    expect(alignDteCorrelativeBaselineSpy).not.toHaveBeenCalled();
  });
});
