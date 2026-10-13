// ─────────────────────────────────────────────────────────────────
// clients — credential.test.ts
//
// loadClientCredential: datos y scope compartidos por la pantalla de
// gestión y la vista de impresión CR80. No se prueba la impresora; se
// certifica QUÉ datos llegan a la tarjeta y A QUIÉN.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, {
    get() {
      throw new Error("Prisma GLOBAL usado — debe usarse context.client");
    },
  }),
}));

const { requireOperationalContextMock, disposeMock, FakeOperationalContextError } = vi.hoisted(() => {
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
  };
});
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

import { loadClientCredential } from "./credential";
import type { SessionUser } from "@/lib/permissions/guards";

const CLIENTS = [
  {
    id: "c1",
    tenant_id: "tenant-1",
    first_name: "Ana",
    last_name: "Pérez",
    operational_code: "C1010",
    avatar_url: "/api/avatars/clients/c1?v=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    qr_token: "11111111-2222-3333-4444-555555555555",
    status: "active",
    branch_id: "loc-1",
    branch: { name: "Centro" },
  },
  {
    id: "c2",
    tenant_id: "tenant-1",
    first_name: "Luis",
    last_name: "Gómez",
    operational_code: null,
    avatar_url: null,
    qr_token: null,
    status: "active",
    branch_id: "loc-2",
    branch: { name: "Norte" },
  },
];

function makeDb() {
  return {
    client: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenant_id: string } }) => {
        const c = CLIENTS.find((x) => x.id === where.id && x.tenant_id === where.tenant_id);
        if (!c) return null;
        return c;
      }),
      findMany: vi.fn(async () => []),
    },
    gym: {
      findUnique: vi.fn(async ({ where }: { where: { tenant_id: string } }) =>
        where.tenant_id === "tenant-1" ? { id: "gym-1", name: "Gym Uno", logo_url: "https://cdn/logo.png" } : null,
      ),
    },
    gymSettings: { findUnique: vi.fn(async () => null) },
  };
}

function handle(db: ReturnType<typeof makeDb>, opts: { role?: string; readOnly?: boolean; tenantId?: string; mode?: string } = {}) {
  return {
    context: {
      runtimeMode: opts.mode ?? "PLATFORM_NATIVE",
      effectiveUser: { id: "s1", tenant_id: opts.tenantId ?? "tenant-1", location_id: "loc-1", role: opts.role ?? "super_admin" },
      tenantId: opts.tenantId ?? "tenant-1",
      locationId: "loc-1",
      client: db,
      readOnly: opts.readOnly ?? false,
    },
    dispose: disposeMock,
  };
}

const user = (role = "super_admin") =>
  ({ id: "s1", role, tenant_id: "tenant-1", location_id: "loc-1", auth_scope: "PLATFORM" }) as SessionUser;

beforeEach(() => {
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
});

describe("loadClientCredential", () => {
  it("datos de la tarjeta: gym + logo, sucursal, foto, código, estado, QR estable", async () => {
    const db = makeDb();
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const r = await loadClientCredential(user(), "c1", { withSuggestedCode: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.client).toEqual({
      id: "c1",
      first_name: "Ana",
      last_name: "Pérez",
      operational_code: "C1010",
      avatar_url: "/api/avatars/clients/c1?v=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      qr_token: "11111111-2222-3333-4444-555555555555",
      status: "active",
      branchName: "Centro",
    });
    expect(r.data.gym).toMatchObject({ name: "Gym Uno", logo_url: "https://cdn/logo.png" });
    expect(r.data.canEdit).toBe(true);
    expect(r.data.suggestedCode).toBe("C1010");
    // Lectura: no exige write.
    expect(requireOperationalContextMock).toHaveBeenCalledWith(expect.anything());
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("vista de impresión (sin sugerencia) no calcula código sugerido", async () => {
    const db = makeDb();
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const r = await loadClientCredential(user(), "c1");
    expect(r.ok && r.data.suggestedCode).toBe("");
    expect(db.client.findMany).not.toHaveBeenCalled();
  });

  it("otro tenant -> not_found", async () => {
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(), { tenantId: "tenant-2" }));
    expect(await loadClientCredential(user(), "c1")).toEqual({ ok: false, reason: "not_found" });
  });

  it("reception fuera de su sucursal -> not_found; en su sucursal -> ok", async () => {
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(), { role: "reception" }));
    expect(await loadClientCredential(user("reception"), "c2")).toEqual({ ok: false, reason: "not_found" });
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(), { role: "reception" }));
    expect((await loadClientCredential(user("reception"), "c1")).ok).toBe(true);
  });

  it("trainer -> not_found (rol LIVE sin canManageClient)", async () => {
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(), { role: "trainer" }));
    expect(await loadClientCredential(user("super_admin"), "c1")).toEqual({ ok: false, reason: "not_found" });
  });

  it("SUPPORT_RUNTIME -> lectura permitida, canEdit=false", async () => {
    requireOperationalContextMock.mockResolvedValue(handle(makeDb(), { readOnly: true, mode: "SUPPORT_RUNTIME" }));
    const r = await loadClientCredential(user(), "c1", { withSuggestedCode: true });
    expect(r.ok && r.data.canEdit).toBe(false);
    expect(r.ok && r.data.suggestedCode).toBe("");
  });

  it("contexto no disponible -> unavailable con mensaje genérico", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("RUNTIME_UNAVAILABLE", "No se pudo acceder al entorno de la organización.", 503),
    );
    expect(await loadClientCredential(user(), "c1")).toEqual({
      ok: false,
      reason: "unavailable",
      message: "No se pudo acceder al entorno de la organización.",
    });
  });
});
