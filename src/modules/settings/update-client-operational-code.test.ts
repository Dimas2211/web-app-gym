// ─────────────────────────────────────────────────────────────────
// settings — update-client-operational-code.test.ts
//
// FASE VI-D6/VI-D7: updateClientOperationalCodeAction y
// updateClientAvatarAction resolvían requireOperationalContext() (o su
// predecesor isRuntimeReadOnlyActive()) pero seguían escribiendo el
// registro Client a través del Prisma GLOBAL en vez de context.client —
// un "half-migration" fácil de pasar por alto en revisión de código.
// Este test certifica que el write real ahora ocurre sobre
// context.client, nunca sobre un cliente global/no inyectado.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireSuperAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const {
  clientFindFirstSpy,
  clientUpdateSpy,
  requireOperationalContextMock,
  disposeMock,
  FakeOperationalContextError,
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
    clientFindFirstSpy: vi.fn(async () => null),
    clientUpdateSpy: vi.fn(async () => ({ id: "client-1" })),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

import { updateClientOperationalCodeAction, updateClientAvatarAction } from "./actions";

function fakeHandle() {
  return {
    context: {
      effectiveUser: { id: "u1", role: "super_admin", location_id: "loc-1" },
      tenantId: "tenant-runtime-effective",
      locationId: "loc-1",
      // Marcador distintivo — si el código real usara el Prisma global en
      // vez de context.client, estos spies NUNCA se invocarían y el test
      // fallaría (o silenciosamente tocaría un cliente no mockeado).
      client: { client: { findFirst: clientFindFirstSpy, update: clientUpdateSpy } },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  clientFindFirstSpy.mockReset();
  clientFindFirstSpy.mockResolvedValue(null);
  clientUpdateSpy.mockClear();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("updateClientOperationalCodeAction — el write real ocurre sobre context.client", () => {
  it("requireOperationalContext rechaza (READ_ONLY) -> bloquea ANTES de tocar client.findFirst/update", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo \"Operar como cliente\" activo (solo lectura).", 403),
    );

    await updateClientOperationalCodeAction(undefined, fd({ entity_id: "client-1", operational_code: "C0001" }));

    expect(clientFindFirstSpy).not.toHaveBeenCalled();
    expect(clientUpdateSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> el duplicate-check y el update usan context.client, filtrado por el tenant EFECTIVO", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    await updateClientOperationalCodeAction(undefined, fd({ entity_id: "client-1", operational_code: "C0001" }));

    expect(clientFindFirstSpy).toHaveBeenCalledWith({
      where: { tenant_id: "tenant-runtime-effective", operational_code: "C0001", id: { not: "client-1" } },
    });
    expect(clientUpdateSpy).toHaveBeenCalledWith({
      where: { id: "client-1" },
      data: { operational_code: "C0001" },
    });
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});

describe("updateClientAvatarAction — el write real ocurre sobre context.client", () => {
  it("requireOperationalContext rechaza (READ_ONLY) -> bloquea ANTES de tocar client.update", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo \"Operar como cliente\" activo (solo lectura).", 403),
    );

    await updateClientAvatarAction(fd({ entity_id: "client-1", avatar_url: "https://example.com/a.png" }));

    expect(clientUpdateSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> el update usa context.client", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    await updateClientAvatarAction(fd({ entity_id: "client-1", avatar_url: "https://example.com/a.png" }));

    expect(clientUpdateSpy).toHaveBeenCalledWith({
      where: { id: "client-1" },
      data: { avatar_url: "https://example.com/a.png" },
    });
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
