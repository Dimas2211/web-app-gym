// ─────────────────────────────────────────────────────────────────
// settings — update-client-operational-code.test.ts
//
// updateClientOperationalCodeAction + generateClientQrTokenAction:
// gate requireClientManager (guards REALES, solo auth() mockeado),
// requireOperationalContext write=true, ownership por tenant efectivo,
// branch scope con rol LIVE, duplicado solo dentro del mismo Gym, todo
// sobre context.client (Prisma global = proxy que lanza).
//
// Historia: FASE VI-D6/VI-D7 movió el write a context.client; esta fase
// cierra el ownership/scope (antes: update por id sin verificar tenant ni
// sucursal, y requireSuperAdmin dejaba fuera a branch_admin/reception y a
// toda identidad RUNTIME_CLIENT).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));

const { authMock, requireOperationalContextMock, disposeMock, FakeOperationalContextError } =
  vi.hoisted(() => {
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
      authMock: vi.fn(),
      requireOperationalContextMock: vi.fn(),
      disposeMock: vi.fn().mockResolvedValue(undefined),
      FakeOperationalContextError,
    };
  });

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, {
    get() {
      throw new Error("Prisma GLOBAL usado — debe usarse context.client");
    },
  }),
}));
// LIVE-3: el envoltorio de identidad vigente delega en el mock de arriba; la identidad
// (usuario activo, tenant, rol y sede vigentes) se certifica con el contexto real en
// src/modules/classes/certification/live-*.integration.test.ts.
vi.mock("@/modules/platform/runtime/require-live-operational-context", async () => {
  const ctx = await import("@/modules/platform/runtime/require-operational-context");
  return { requireLiveOperationalContext: (...args: Parameters<typeof ctx.requireOperationalContext>) => ctx.requireOperationalContext(...args) };
});
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

import { updateClientOperationalCodeAction, generateClientQrTokenAction } from "./actions";

// ── Fake DB ────────────────────────────────────────────────────────

type Row = {
  id: string;
  tenant_id: string;
  gym_id: string;
  branch_id: string;
  operational_code: string | null;
  qr_token: string | null;
};

function makeDb(rows: Row[]) {
  const matches = (r: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const value = r[k as keyof Row];
      if (v && typeof v === "object" && "not" in v) return value !== (v as { not: unknown }).not;
      if (v && typeof v === "object" && "equals" in v) {
        return String(value ?? "").toLowerCase() === String((v as { equals: string }).equals).toLowerCase();
      }
      return value === v;
    });
  return {
    client: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const r = rows.find((x) => matches(x, where));
        return r ? { ...r } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const r = rows.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        const hit = rows.filter((x) => matches(x, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
    },
  };
}

function handle(
  db: ReturnType<typeof makeDb>,
  opts: { role?: string; tenantId?: string; locationId?: string } = {},
) {
  const tenantId = opts.tenantId ?? "tenant-1";
  return {
    context: {
      effectiveUser: {
        id: "staff-1",
        tenant_id: tenantId,
        location_id: opts.locationId ?? "loc-1",
        role: opts.role ?? "super_admin",
      },
      tenantId,
      locationId: opts.locationId ?? "loc-1",
      client: db,
      readOnly: false,
    },
    dispose: disposeMock,
  };
}

function login(role: string, extra: Record<string, unknown> = {}) {
  authMock.mockResolvedValue({
    user: { id: "staff-1", role, tenant_id: "tenant-1", location_id: "loc-1", auth_scope: "PLATFORM", ...extra },
  });
}

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

let rows: Row[];
beforeEach(() => {
  rows = [
    { id: "c1", tenant_id: "tenant-1", gym_id: "gym-1", branch_id: "loc-1", operational_code: "C1010", qr_token: "qr-c1" },
    { id: "c2", tenant_id: "tenant-1", gym_id: "gym-1", branch_id: "loc-1", operational_code: "C1011", qr_token: null },
    { id: "c3", tenant_id: "tenant-1", gym_id: "gym-1", branch_id: "loc-2", operational_code: null, qr_token: null },
    { id: "x1", tenant_id: "tenant-2", gym_id: "gym-2", branch_id: "loc-1", operational_code: "C2000", qr_token: null },
  ];
  authMock.mockReset();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
});

describe("updateClientOperationalCodeAction", () => {
  it("gate: trainer / client -> redirect antes de resolver contexto", async () => {
    for (const role of ["trainer", "client"]) {
      login(role);
      await expect(
        updateClientOperationalCodeAction(undefined, fd({ entity_id: "c1", operational_code: "C9" })),
      ).rejects.toThrow(/REDIRECT/);
    }
    expect(requireOperationalContextMock).not.toHaveBeenCalled();
  });

  it("19. ownership tenant: Client de otro tenant -> 'no encontrado', sin update", async () => {
    login("super_admin");
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const r = await updateClientOperationalCodeAction(undefined, fd({ entity_id: "x1", operational_code: "C9" }));
    expect(r).toEqual({ error: "Cliente no encontrado." });
    expect(db.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "x1", tenant_id: "tenant-1" } }),
    );
    expect(db.client.update).not.toHaveBeenCalled();
    expect(rows[3].operational_code).toBe("C2000");
  });

  it("20. branch scope: reception/branch_admin fuera de su sucursal -> sin permiso", async () => {
    for (const role of ["reception", "branch_admin"]) {
      login(role);
      const db = makeDb(rows);
      requireOperationalContextMock.mockResolvedValue(handle(db, { role }));
      const r = await updateClientOperationalCodeAction(undefined, fd({ entity_id: "c3", operational_code: "C9" }));
      expect(r).toEqual({ error: "Sin permiso para modificar este cliente." });
      expect(db.client.update).not.toHaveBeenCalled();
    }
  });

  it("reception de su sucursal -> guarda normalizado en mayúsculas", async () => {
    login("reception");
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db, { role: "reception" }));
    const r = await updateClientOperationalCodeAction(undefined, fd({ entity_id: "c2", operational_code: "  c2050 " }));
    expect(r).toBeUndefined();
    expect(requireOperationalContextMock).toHaveBeenCalledWith(expect.anything(), { write: true });
    expect(db.client.update).toHaveBeenCalledWith({ where: { id: "c2" }, data: { operational_code: "C2050" } });
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("21. duplicado en el mismo Gym (case-insensitive) -> bloqueado", async () => {
    login("super_admin");
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const r = await updateClientOperationalCodeAction(undefined, fd({ entity_id: "c2", operational_code: "c1010" }));
    expect(r).toEqual({ errors: { operational_code: ["Este código ya está en uso por otro cliente."] } });
    expect(db.client.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { gym_id: "gym-1", operational_code: { equals: "C1010", mode: "insensitive" }, id: { not: "c2" } },
      }),
    );
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it("22. mismo código en OTRO tenant/gym no cuenta como duplicado", async () => {
    login("super_admin");
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const r = await updateClientOperationalCodeAction(undefined, fd({ entity_id: "c2", operational_code: "C2000" }));
    expect(r).toBeUndefined();
    expect(rows[1].operational_code).toBe("C2000");
  });

  it("mismo código propio -> no es duplicado", async () => {
    login("super_admin");
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const r = await updateClientOperationalCodeAction(undefined, fd({ entity_id: "c1", operational_code: "C1010" }));
    expect(r).toBeUndefined();
  });

  it("vacío -> quita el código; formato inválido -> error de campo", async () => {
    login("super_admin");
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    expect(await updateClientOperationalCodeAction(undefined, fd({ entity_id: "c1", operational_code: "  " }))).toBeUndefined();
    expect(rows[0].operational_code).toBeNull();

    requireOperationalContextMock.mockResolvedValue(handle(db));
    const bad = await updateClientOperationalCodeAction(undefined, fd({ entity_id: "c1", operational_code: "C 1/2" }));
    expect(bad).toHaveProperty("errors.operational_code");
  });

  it("carrera con @@unique (P2002) -> error de campo, no excepción", async () => {
    login("super_admin");
    const db = makeDb(rows);
    db.client.update.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const r = await updateClientOperationalCodeAction(undefined, fd({ entity_id: "c2", operational_code: "C3000" }));
    expect(r).toEqual({ errors: { operational_code: ["Este código ya está en uso por otro cliente."] } });
  });

  it("23. Support Session (READ_ONLY) -> bloqueado antes de leer/escribir", async () => {
    login("super_admin");
    const db = makeDb(rows);
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo \"Operar como cliente\" activo (solo lectura).", 403),
    );
    const r = await updateClientOperationalCodeAction(undefined, fd({ entity_id: "c1", operational_code: "C9" }));
    expect(r).toEqual({ error: "Modo \"Operar como cliente\" activo (solo lectura)." });
    expect(db.client.findFirst).not.toHaveBeenCalled();
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it("24. RUNTIME_CLIENT -> DB y tenant efectivos, rol LIVE decide el scope", async () => {
    // JWT super_admin RUNTIME_CLIENT; rol LIVE reception de loc-r.
    login("super_admin", { auth_scope: "RUNTIME_CLIENT", tenant_id: "tenant-runtime" });
    const runtimeRows: Row[] = [
      { id: "r1", tenant_id: "tenant-runtime", gym_id: "gym-r", branch_id: "loc-r", operational_code: null, qr_token: null },
      { id: "r2", tenant_id: "tenant-runtime", gym_id: "gym-r", branch_id: "loc-other", operational_code: null, qr_token: null },
    ];
    const db = makeDb(runtimeRows);
    requireOperationalContextMock.mockResolvedValue(
      handle(db, { role: "reception", tenantId: "tenant-runtime", locationId: "loc-r" }),
    );
    expect(await updateClientOperationalCodeAction(undefined, fd({ entity_id: "r1", operational_code: "C1" }))).toBeUndefined();
    expect(runtimeRows[0].operational_code).toBe("C1");

    requireOperationalContextMock.mockResolvedValue(
      handle(db, { role: "reception", tenantId: "tenant-runtime", locationId: "loc-r" }),
    );
    const denied = await updateClientOperationalCodeAction(undefined, fd({ entity_id: "r2", operational_code: "C2" }));
    expect(denied).toEqual({ error: "Sin permiso para modificar este cliente." });
  });
});

describe("generateClientQrTokenAction", () => {
  it("genera token solo si no existe, filtrando qr_token: null", async () => {
    login("reception");
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db, { role: "reception" }));
    const r = await generateClientQrTokenAction(undefined, fd({ entity_id: "c2" }));
    expect(r).toBeUndefined();
    expect(db.client.updateMany).toHaveBeenCalledWith({
      where: { id: "c2", tenant_id: "tenant-1", qr_token: null },
      data: { qr_token: expect.stringMatching(/^[0-9a-f-]{36}$/) },
    });
    expect(rows[1].qr_token).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("nunca regenera un token existente", async () => {
    login("super_admin");
    const db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    const r = await generateClientQrTokenAction(undefined, fd({ entity_id: "c1" }));
    expect(r).toEqual({ error: "El cliente ya tiene un token QR." });
    expect(db.client.updateMany).not.toHaveBeenCalled();
    expect(rows[0].qr_token).toBe("qr-c1");
  });

  it("otro tenant / fuera de sucursal / Support Session -> sin write", async () => {
    login("super_admin");
    let db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db));
    expect(await generateClientQrTokenAction(undefined, fd({ entity_id: "x1" }))).toEqual({ error: "Cliente no encontrado." });

    login("reception");
    db = makeDb(rows);
    requireOperationalContextMock.mockResolvedValue(handle(db, { role: "reception" }));
    expect(await generateClientQrTokenAction(undefined, fd({ entity_id: "c3" }))).toEqual({
      error: "Sin permiso para modificar este cliente.",
    });

    requireOperationalContextMock.mockRejectedValue(new FakeOperationalContextError("READ_ONLY", "solo lectura", 403));
    expect(await generateClientQrTokenAction(undefined, fd({ entity_id: "c2" }))).toEqual({ error: "solo lectura" });
    expect(db.client.updateMany).not.toHaveBeenCalled();
    expect(rows[3].qr_token).toBeNull();
  });
});
