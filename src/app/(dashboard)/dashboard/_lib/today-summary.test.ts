import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@prisma/client";
import type { SessionUser } from "@/lib/permissions/guards";
import { MODULE_GROUPS, filterModuleGroupsByAccess } from "@/lib/navigation/dashboard-nav";

// ── Mocks: contexto efectivo, location activa y Prisma global ────────
const ctxMock = vi.hoisted(() => ({
  resolveEffectiveTenantContext: vi.fn(),
  resolveRuntimeFirstLocationId: vi.fn(),
  getEffectiveLocationId: vi.fn(),
  globalDb: { current: null as unknown },
}));

vi.mock("@/modules/platform/runtime/effective-tenant-context", () => ({
  resolveEffectiveTenantContext: ctxMock.resolveEffectiveTenantContext,
  resolveRuntimeFirstLocationId: ctxMock.resolveRuntimeFirstLocationId,
}));
vi.mock("@/lib/location/active-location", () => ({
  getEffectiveLocationId: ctxMock.getEffectiveLocationId,
}));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return ctxMock.globalDb.current;
  },
}));

import { getTodaySummary, localDateString } from "./today-summary";

// ── DB falsa en memoria: aplica el `where` real de cada consulta ──────
type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    if (cond && typeof cond === "object") {
      const c = cond as { not?: unknown; gte?: Date; lte?: Date };
      if ("not" in c && value === c.not) return false;
      if (c.gte && !(value instanceof Date && value.getTime() >= c.gte.getTime())) return false;
      if (c.lte && !(value instanceof Date && value.getTime() <= c.lte.getTime())) return false;
      return true;
    }
    return value === cond;
  });
}

type Data = { branches: Row[]; sales: Row[]; cashSessions: Row[]; classes: Row[]; memberships: Row[] };

function fakeDb(data: Partial<Data>) {
  const d: Data = { branches: [], sales: [], cashSessions: [], classes: [], memberships: [], ...data };
  const count = (rows: Row[]) => vi.fn(async ({ where }: { where: Where }) => rows.filter((r) => matches(r, where)).length);
  return {
    branch: {
      findFirst: vi.fn(async ({ where }: { where: Where }) => d.branches.find((r) => matches(r, where)) ?? null),
    },
    sale: {
      aggregate: vi.fn(async ({ where }: { where: Where }) => {
        const rows = d.sales.filter((r) => matches(r, where));
        return {
          _count: { _all: rows.length },
          _sum: { total_amount: rows.length ? rows.reduce((s, r) => s + (r.total_amount as number), 0) : null },
        };
      }),
    },
    cashSession: { count: count(d.cashSessions) },
    scheduledClass: { count: count(d.classes) },
    clientMembership: { count: count(d.memberships) },
  };
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TZ = "America/El_Salvador";
// 2026-11-09 15:00 en El Salvador
const NOW = new Date("2026-11-09T21:00:00Z");

const ALL_CODES = new Set(
  MODULE_GROUPS.flatMap((g) => g.items.map((i) => i.moduleCode).filter((c): c is string => Boolean(c))),
);

function groupsFor(role: UserRole, codes = ALL_CODES, vertical: string | null = "GYM") {
  return filterModuleGroupsByAccess(MODULE_GROUPS, role, codes, vertical, false, false);
}

function user(role: UserRole, overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: `u-${role}`,
    role,
    tenant_id: "T1",
    location_id: role === "super_admin" ? null : "L1",
    auth_scope: "PLATFORM",
    ...overrides,
  } as SessionUser;
}

type CtxOpts = {
  tenantId?: string;
  role: string;
  locationId?: string | null;
  client?: unknown;
  runtime?: unknown;
  mode?: "PLATFORM_NATIVE" | "SUPPORT_RUNTIME" | "RUNTIME_CLIENT";
};

const dispose = vi.fn(async () => {});
function setContext(o: CtxOpts) {
  ctxMock.resolveEffectiveTenantContext.mockResolvedValue({
    context: {
      tenantId: o.tenantId ?? "T1",
      client: o.client,
      runtime: o.runtime ?? null,
      locationId: o.locationId ?? null,
      runtimeMode: o.mode ?? "PLATFORM_NATIVE",
      readOnly: o.mode === "SUPPORT_RUNTIME",
      effectiveRole: o.role,
    },
    dispose,
  });
}

// Datos base: tenant T1 (sedes L1 Centro, L2 Norte) y tenant T2 (sede X1).
function baseData(): Data {
  return {
    branches: [
      { id: "L1", tenant_id: "T1", name: "Centro" },
      { id: "L2", tenant_id: "T1", name: "Norte" },
      { id: "X1", tenant_id: "T2", name: "Ajena" },
    ],
    sales: [
      { tenant_id: "T1", location_id: "L1", status: "CONFIRMED", sale_date: day("2026-11-09"), total_amount: 10 },
      { tenant_id: "T1", location_id: "L1", status: "CONFIRMED", sale_date: day("2026-11-09"), total_amount: 15.5 },
      { tenant_id: "T1", location_id: "L1", status: "DRAFT", sale_date: day("2026-11-09"), total_amount: 99 },
      { tenant_id: "T1", location_id: "L1", status: "CANCELLED", sale_date: day("2026-11-09"), total_amount: 99 },
      { tenant_id: "T1", location_id: "L1", status: "CONFIRMED", sale_date: day("2026-11-08"), total_amount: 99 },
      { tenant_id: "T1", location_id: "L2", status: "CONFIRMED", sale_date: day("2026-11-09"), total_amount: 500 },
      { tenant_id: "T2", location_id: "X1", status: "CONFIRMED", sale_date: day("2026-11-09"), total_amount: 1000 },
    ],
    cashSessions: [
      { tenant_id: "T1", location_id: "L1", status: "OPEN" },
      { tenant_id: "T1", location_id: "L1", status: "CLOSED" },
      { tenant_id: "T1", location_id: "L2", status: "OPEN" },
      { tenant_id: "T2", location_id: "X1", status: "OPEN" },
    ],
    classes: [
      { tenant_id: "T1", branch_id: "L1", class_date: day("2026-11-09"), status: "scheduled" },
      { tenant_id: "T1", branch_id: "L1", class_date: day("2026-11-09"), status: "completed" },
      { tenant_id: "T1", branch_id: "L1", class_date: day("2026-11-09"), status: "cancelled" },
      { tenant_id: "T1", branch_id: "L1", class_date: day("2026-11-10"), status: "scheduled" },
      { tenant_id: "T2", branch_id: "X1", class_date: day("2026-11-09"), status: "scheduled" },
    ],
    memberships: [
      { tenant_id: "T1", branch_id: "L1", status: "active", end_date: day("2026-11-09") },
      { tenant_id: "T1", branch_id: "L1", status: "active", end_date: day("2026-11-16") },
      { tenant_id: "T1", branch_id: "L1", status: "active", end_date: day("2026-11-17") },
      { tenant_id: "T1", branch_id: "L1", status: "suspended", end_date: day("2026-11-10") },
      { tenant_id: "T1", branch_id: "L1", status: "active", end_date: day("2026-11-08") },
      { tenant_id: "T2", branch_id: "X1", status: "active", end_date: day("2026-11-10") },
    ],
  };
}

const usd = (n: number) => new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" }).format(n);
const statsOf = (r: Awaited<ReturnType<typeof getTodaySummary>>) =>
  r && r.status === "ok" ? Object.fromEntries(r.stats.map((s) => [s.key, `${s.value} | ${s.hint}`])) : r;

let globalDb: ReturnType<typeof fakeDb>;

beforeEach(() => {
  vi.clearAllMocks();
  globalDb = fakeDb(baseData());
  ctxMock.globalDb.current = globalDb;
  ctxMock.getEffectiveLocationId.mockResolvedValue(null);
  ctxMock.resolveRuntimeFirstLocationId.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("localDateString", () => {
  it("usa el día calendario de El Salvador, no el UTC del servidor", () => {
    // 2026-11-10 03:00 UTC = 2026-11-09 21:00 en El Salvador (UTC-6)
    expect(localDateString("America/El_Salvador", new Date("2026-11-10T03:00:00Z"))).toBe("2026-11-09");
    expect(localDateString("America/El_Salvador", new Date("2026-11-10T07:00:00Z"))).toBe("2026-11-10");
  });
});

describe("getTodaySummary — roles y alcance de sede (PLATFORM_NATIVE)", () => {
  it("super_admin con sede elegida: indicadores solo de esa sede y del tenant", async () => {
    setContext({ role: "super_admin" });
    ctxMock.getEffectiveLocationId.mockResolvedValue("L1");
    const r = await getTodaySummary(user("super_admin"), groupsFor("super_admin"), { timeZone: TZ, now: NOW });

    expect(r).toMatchObject({ status: "ok", scopeLabel: "Sucursal: Centro" });
    expect(statsOf(r)).toEqual({
      sales: `${usd(25.5)} | 2 confirmadas`,
      cash: "Abierta | 1 sesión abierta",
      classes: "2 | sesiones programadas",
      expiring: "2 | en los próximos 7 días",
    });
    // Modo nativo: Prisma global y validación de la cookie contra el tenant efectivo.
    expect(ctxMock.getEffectiveLocationId).toHaveBeenCalledWith(expect.anything(), undefined, "T1");
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("super_admin sin sede: pide elegir sede, no muestra consolidado ni consulta", async () => {
    setContext({ role: "super_admin" });
    const r = await getTodaySummary(user("super_admin"), groupsFor("super_admin"), { timeZone: TZ, now: NOW });

    expect(r).toMatchObject({ status: "needs_location" });
    expect(globalDb.sale.aggregate).not.toHaveBeenCalled();
    expect(globalDb.cashSession.count).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("administrador de sucursal: usa su sede fija", async () => {
    setContext({ role: "branch_admin", locationId: "L2" });
    const r = await getTodaySummary(user("branch_admin", { location_id: "L2" }), groupsFor("branch_admin"), {
      timeZone: TZ,
      now: NOW,
    });
    expect(r).toMatchObject({ status: "ok", scopeLabel: "Sucursal: Norte" });
    expect(statsOf(r)).toMatchObject({ sales: `${usd(500)} | 1 confirmada`, cash: "Abierta | 1 sesión abierta" });
    expect(ctxMock.getEffectiveLocationId).not.toHaveBeenCalled();
  });

  it("recepción: ve los cuatro indicadores de su sede", async () => {
    setContext({ role: "reception", locationId: "L1" });
    const r = await getTodaySummary(user("reception"), groupsFor("reception"), { timeZone: TZ, now: NOW });
    expect(r && r.status === "ok" ? r.stats.map((s) => s.key) : r).toEqual(["sales", "cash", "classes", "expiring"]);
  });

  it("rol con sede fija sin sede válida: no muestra nada", async () => {
    setContext({ role: "reception", locationId: null });
    const r = await getTodaySummary(user("reception", { location_id: null }), groupsFor("reception"), {
      timeZone: TZ,
      now: NOW,
    });
    expect(r).toBeNull();
  });

  it("entrenador: sin indicadores (y cierra el contexto)", async () => {
    setContext({ role: "trainer", locationId: "L1" });
    const r = await getTodaySummary(user("trainer"), groupsFor("trainer"), { timeZone: TZ, now: NOW });
    expect(r).toBeNull();
    expect(globalDb.sale.aggregate).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("cliente: sin módulos visibles, ni siquiera resuelve contexto", async () => {
    const r = await getTodaySummary(user("client"), groupsFor("client"), { timeZone: TZ, now: NOW });
    expect(r).toBeNull();
    expect(ctxMock.resolveEffectiveTenantContext).not.toHaveBeenCalled();
  });
});

describe("getTodaySummary — módulos y vertical", () => {
  it("organización Commerce sin vertical: solo ventas y caja", async () => {
    setContext({ role: "super_admin" });
    ctxMock.getEffectiveLocationId.mockResolvedValue("L1");
    const commerce = new Set([...ALL_CODES].filter((c) => !c.startsWith("gym.")));
    const r = await getTodaySummary(user("super_admin"), groupsFor("super_admin", commerce, null), {
      timeZone: TZ,
      now: NOW,
    });
    expect(r && r.status === "ok" ? r.stats.map((s) => s.key) : r).toEqual(["sales", "cash"]);
    expect(globalDb.scheduledClass.count).not.toHaveBeenCalled();
    expect(globalDb.clientMembership.count).not.toHaveBeenCalled();
  });

  it("módulo no habilitado: su indicador no se consulta", async () => {
    setContext({ role: "super_admin" });
    ctxMock.getEffectiveLocationId.mockResolvedValue("L1");
    const codes = new Set([...ALL_CODES].filter((c) => c !== "commerce.cash"));
    const r = await getTodaySummary(user("super_admin"), groupsFor("super_admin", codes), { timeZone: TZ, now: NOW });
    expect(r && r.status === "ok" ? r.stats.map((s) => s.key) : r).not.toContain("cash");
    expect(globalDb.cashSession.count).not.toHaveBeenCalled();
  });
});

describe("getTodaySummary — runtimes y Support Session", () => {
  it("RUNTIME_CLIENT dedicado: consulta la base runtime, nunca Prisma global", async () => {
    const runtimeDb = fakeDb({
      branches: [{ id: "R1", tenant_id: "RT", name: "Matriz" }],
      sales: [{ tenant_id: "RT", location_id: "R1", status: "CONFIRMED", sale_date: day("2026-11-09"), total_amount: 7 }],
    });
    setContext({ role: "branch_admin", tenantId: "RT", locationId: "R1", client: runtimeDb, mode: "RUNTIME_CLIENT" });
    const r = await getTodaySummary(
      user("branch_admin", { auth_scope: "RUNTIME_CLIENT", tenant_id: "RT", location_id: "R1" } as Partial<SessionUser>),
      groupsFor("branch_admin"),
      { timeZone: TZ, now: NOW },
    );
    expect(r).toMatchObject({ status: "ok", scopeLabel: "Sucursal: Matriz" });
    expect(statsOf(r)).toMatchObject({ sales: `${usd(7)} | 1 confirmada` });
    for (const model of [globalDb.sale.aggregate, globalDb.branch.findFirst, globalDb.cashSession.count]) {
      expect(model).not.toHaveBeenCalled();
    }
  });

  it("RUNTIME_CLIENT: decide con el rol LIVE, no con el del JWT", async () => {
    setContext({ role: "trainer", locationId: "L1", client: fakeDb(baseData()), mode: "RUNTIME_CLIENT" });
    const r = await getTodaySummary(
      user("super_admin", { auth_scope: "RUNTIME_CLIENT" } as Partial<SessionUser>),
      groupsFor("super_admin"),
      { timeZone: TZ, now: NOW },
    );
    expect(r).toBeNull();
  });

  it("runtime Shared: dos tenants en la misma base no se mezclan", async () => {
    const sharedDb = fakeDb(baseData()); // contiene filas de T1 y T2
    setContext({ role: "super_admin", tenantId: "T2", locationId: "X1", client: sharedDb, mode: "RUNTIME_CLIENT" });
    const r = await getTodaySummary(
      user("super_admin", { auth_scope: "RUNTIME_CLIENT", tenant_id: "T2" } as Partial<SessionUser>),
      groupsFor("super_admin"),
      { timeZone: TZ, now: NOW },
    );
    expect(r).toMatchObject({ status: "ok", scopeLabel: "Sucursal: Ajena" });
    expect(statsOf(r)).toEqual({
      sales: `${usd(1000)} | 1 confirmada`,
      cash: "Abierta | 1 sesión abierta",
      classes: "1 | sesión programada",
      expiring: "1 | en los próximos 7 días",
    });
    for (const call of sharedDb.sale.aggregate.mock.calls) expect(call[0].where.tenant_id).toBe("T2");
  });

  it("Support Session: sede de referencia de soporte, etiqueta explícita, base runtime", async () => {
    const runtimeDb = fakeDb(baseData());
    ctxMock.resolveRuntimeFirstLocationId.mockResolvedValue("L1");
    setContext({
      role: "super_admin",
      client: runtimeDb,
      runtime: { organizationId: "O1", tenantId: "T1", readOnly: true },
      mode: "SUPPORT_RUNTIME",
    });
    const r = await getTodaySummary(user("super_admin"), groupsFor("super_admin"), { timeZone: TZ, now: NOW });
    expect(r).toMatchObject({ status: "ok", scopeLabel: "Sucursal de referencia (soporte): Centro" });
    expect(ctxMock.getEffectiveLocationId).not.toHaveBeenCalled();
    expect(globalDb.sale.aggregate).not.toHaveBeenCalled();
  });

  it("Support Session sin sucursales activas: mensaje, sin consolidado", async () => {
    setContext({ role: "super_admin", client: fakeDb({}), runtime: { readOnly: true }, mode: "SUPPORT_RUNTIME" });
    const r = await getTodaySummary(user("super_admin"), groupsFor("super_admin"), { timeZone: TZ, now: NOW });
    expect(r).toEqual({ status: "needs_location", message: "La organización no tiene sucursales activas." });
  });
});

describe("getTodaySummary — aislamiento, fechas y errores", () => {
  it("una sede de otro tenant (cookie manipulada) no produce cifras", async () => {
    setContext({ role: "super_admin" });
    ctxMock.getEffectiveLocationId.mockResolvedValue("X1"); // pertenece a T2
    const r = await getTodaySummary(user("super_admin"), groupsFor("super_admin"), { timeZone: TZ, now: NOW });
    expect(r).toBeNull();
    expect(globalDb.sale.aggregate).not.toHaveBeenCalled();
  });

  it("cruce de medianoche en El Salvador: 23:30 SV sigue siendo el mismo día", async () => {
    setContext({ role: "branch_admin", locationId: "L1" });
    // 2026-11-10 05:30 UTC = 2026-11-09 23:30 SV
    const late = await getTodaySummary(user("branch_admin"), groupsFor("branch_admin"), {
      timeZone: TZ,
      now: new Date("2026-11-10T05:30:00Z"),
    });
    expect(statsOf(late)).toMatchObject({ sales: `${usd(25.5)} | 2 confirmadas`, classes: "2 | sesiones programadas" });

    // 2026-11-10 06:30 UTC = 2026-11-10 00:30 SV → nuevo día
    const next = await getTodaySummary(user("branch_admin"), groupsFor("branch_admin"), {
      timeZone: TZ,
      now: new Date("2026-11-10T06:30:00Z"),
    });
    expect(statsOf(next)).toMatchObject({ sales: `${usd(0)} | 0 confirmadas`, classes: "1 | sesión programada" });
  });

  it("sin registros del día: ceros explícitos, caja cerrada", async () => {
    setContext({ role: "branch_admin", locationId: "L1" });
    ctxMock.globalDb.current = fakeDb({ branches: [{ id: "L1", tenant_id: "T1", name: "Centro" }] });
    const r = await getTodaySummary(user("branch_admin"), groupsFor("branch_admin"), { timeZone: TZ, now: NOW });
    expect(statsOf(r)).toEqual({
      sales: `${usd(0)} | 0 confirmadas`,
      cash: "Cerrada | Sin sesión abierta",
      classes: "0 | sesiones programadas",
      expiring: "0 | en los próximos 7 días",
    });
  });

  it("error de lectura: estado 'error' (no ceros), log sin detalles y contexto cerrado", async () => {
    setContext({ role: "branch_admin", locationId: "L1" });
    const err = Object.assign(new Error("SELECT ... secreto"), { code: "P1001" });
    globalDb.sale.aggregate.mockRejectedValueOnce(err);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await getTodaySummary(user("branch_admin"), groupsFor("branch_admin"), { timeZone: TZ, now: NOW });

    expect(r).toEqual({ status: "error" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain("P1001");
    expect(String(log.mock.calls[0][0])).not.toContain("secreto");
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
