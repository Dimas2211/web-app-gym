// ─────────────────────────────────────────────────────────────────
// commerce/dte — upsert-dte-issuer-config-for-client.action.test.ts
//
// FASE VI-E2B — migrado a requireOperationalContext: bajo Support
// Session (siempre solo lectura), crear/editar la configuración de
// emisor DTE debe bloquearse ANTES de tocar la DB (defensa en
// profundidad — la UI ya oculta los botones, pero la Server Action
// debe ser segura por sí misma), y usar context.client (efectivo/
// runtime) al escribir.
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
  createDteIssuerConfigSpy,
  updateDteIssuerConfigSpy,
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
    createDteIssuerConfigSpy: vi.fn(),
    updateDteIssuerConfigSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("../services/dte-issuer-config.service", () => ({
  createDteIssuerConfig: createDteIssuerConfigSpy,
  updateDteIssuerConfig: updateDteIssuerConfigSpy,
}));

import {
  createDteIssuerConfigForClientAction,
  updateDteIssuerConfigForClientAction,
} from "./upsert-dte-issuer-config-for-client.action";

function fakeHandle(overrides: Partial<{ client: unknown; tenantId: string; locationId: string | null }> = {}) {
  return {
    context: {
      effectiveUser: { id: "u1", role: "super_admin" },
      tenantId: overrides.tenantId ?? "tenant-1",
      locationId: overrides.locationId === undefined ? "loc-1" : overrides.locationId,
      client: overrides.client ?? { __marker: "RUNTIME_CLIENT_DB" },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  createDteIssuerConfigSpy.mockReset();
  updateDteIssuerConfigSpy.mockReset();
});

describe("createDteIssuerConfigForClientAction — FASE VI-E2B", () => {
  it("requireOperationalContext falla (READ_ONLY bajo Support Session) -> bloquea ANTES de tocar la DB", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );

    const result = await createDteIssuerConfigForClientAction(undefined, new FormData());

    expect(result).toMatchObject({ error: "Modo runtime read-only activo." });
    expect(createDteIssuerConfigSpy).not.toHaveBeenCalled();
  });

  it("MODULE_DISABLED (fiscal.dte no habilitado) -> bloquea con el mensaje del gate comercial", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("MODULE_DISABLED", "El módulo DTE no está habilitado para esta organización.", 402),
    );

    const result = await createDteIssuerConfigForClientAction(undefined, new FormData());

    expect(result).toMatchObject({ error: "El módulo DTE no está habilitado para esta organización." });
    expect(createDteIssuerConfigSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> forwardea context.client (nunca Prisma global implícito) y context.tenantId/locationId", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    createDteIssuerConfigSpy.mockResolvedValue({ ok: true, id: "cfg-1" });

    const fd = new FormData();
    fd.set("environment", "TEST");
    fd.set("nit", "00000000000000");
    fd.set("name", "Emisor Test");

    const result = await createDteIssuerConfigForClientAction(undefined, fd);

    expect(result).toMatchObject({ success: true });
    expect(createDteIssuerConfigSpy).toHaveBeenCalledWith(
      "tenant-1",
      "loc-1",
      "u1",
      expect.anything(),
      runtimeDbMarker,
    );
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});

describe("updateDteIssuerConfigForClientAction — FASE VI-E2B", () => {
  it("requireOperationalContext falla (READ_ONLY bajo Support Session) -> bloquea ANTES de tocar la DB", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );
    const fd = new FormData();
    fd.set("id", "cfg-1");

    const result = await updateDteIssuerConfigForClientAction(undefined, fd);

    expect(result).toMatchObject({ error: "Modo runtime read-only activo." });
    expect(updateDteIssuerConfigSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> forwardea context.client al service", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    updateDteIssuerConfigSpy.mockResolvedValue({ ok: true });

    const fd = new FormData();
    fd.set("id", "cfg-1");
    fd.set("name", "Emisor Actualizado");

    const result = await updateDteIssuerConfigForClientAction(undefined, fd);

    expect(result).toMatchObject({ success: true });
    expect(updateDteIssuerConfigSpy).toHaveBeenCalledWith(
      "cfg-1",
      "tenant-1",
      "loc-1",
      "u1",
      expect.anything(),
      runtimeDbMarker,
    );
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
