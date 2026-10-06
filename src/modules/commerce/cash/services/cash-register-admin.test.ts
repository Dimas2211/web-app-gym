// ─────────────────────────────────────────────────────────────────
// commerce/cash — cash-register-admin.test.ts
//
// Certifica la administración de cajas (CashRegister):
//   alta/edición/desactivación/reactivación, unique tenant+location+code,
//   capacidad commerce.cash_registers.max con el motor REAL
//   (withCapacityCheckedTransaction + assertCapacityAvailable), aislamiento
//   tenant/location, regresión "caja inactiva no abre sesión" y estado
//   del workspace (incluye inactivas; primera caja utilizable sin reload).
//
// DB en memoria: modela los WHERE usados, el unique compuesto (P2002) y
// $transaction con transacciones serializadas + rollback (equivalente a
// Serializable para estas operaciones).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, { get() { throw new Error("Prisma global NO debe usarse"); } }),
}));

import {
  createCashRegister,
  updateCashRegister,
  setCashRegisterActive,
  CASH_REGISTER_MESSAGES as MSG,
} from "./cash-register-admin.service";
import { openCashSession } from "./cash-session.service";
import { getCashWorkspaceState } from "./cash-read.service";
import type { CommercialEnforcementContext } from "@/modules/platform/runtime/commercial-enforcement/types";

const T = "tenant-A";
const L1 = "loc-1";
const L2 = "loc-2";
const U = "user-1";
const scope = (location_id = L1, tenant_id = T) => ({ tenant_id, location_id, user_id: U });

const LIMIT_MSG_FRAGMENT = "Alcanzaste el límite de tu plan";

type Row = Record<string, unknown>;

function managedCtx(limit: number): CommercialEnforcementContext {
  return {
    mode: "MANAGED",
    tenantId: T,
    organizationId: "org-1",
    planId: "plan-1",
    verticalId: null,
    effectiveModules: new Map(),
    effectiveEntitlements: new Map([
      [
        "commerce.cash_registers.max",
        {
          entitlement_definition_id: "ent-1",
          code: "commerce.cash_registers.max",
          name: "Cajas",
          category: "capacity",
          value_type: "NUMBER",
          period_type: "NONE",
          numeric_value: limit,
          is_unlimited: false,
          source: "PLAN",
        } as never,
      ],
    ]),
    organizationTimezone: null,
  };
}

function match(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

function createFakeDb(seed: { registers?: Row[]; sessions?: Row[] } = {}) {
  let state = {
    registers: (seed.registers ?? []).map((r) => ({ ...r })),
    sessions: (seed.sessions ?? []).map((s) => ({ ...s })),
  };
  let seq = 0;
  let txChain: Promise<unknown> = Promise.resolve();
  const calls = { transactions: 0, isolationLevels: [] as unknown[] };

  const assertUnique = (candidate: Row, selfId?: unknown) => {
    const dup = state.registers.some(
      (r) =>
        r.id !== selfId &&
        r.tenant_id === candidate.tenant_id &&
        r.location_id === candidate.location_id &&
        r.code === candidate.code,
    );
    if (dup) throw uniqueViolation();
  };

  const withSessions = (r: Row, select?: Row) => {
    const out: Row = { ...r };
    if (select && "sessions" in select) {
      out.sessions = state.sessions
        .filter((s) => s.cash_register_id === r.id && s.status === "OPEN")
        .map((s) => ({ ...s, opened_by_user: null }));
    }
    return out;
  };

  const client = {
    cashRegister: {
      create: async ({ data }: { data: Row }) => {
        assertUnique(data);
        const row = { id: `reg-${++seq}`, created_at: new Date(), updated_at: new Date(), ...data };
        state.registers.push(row);
        return { ...row };
      },
      findFirst: async ({ where, select }: { where: Row; select?: Row }) => {
        const r = state.registers.find((x) => match(x, where));
        return r ? withSessions(r, select) : null;
      },
      findMany: async ({ where, select }: { where: Row; select?: Row }) =>
        state.registers
          .filter((x) => match(x, where))
          .sort((a, b) => String(a.code).localeCompare(String(b.code)))
          .map((r) => withSessions(r, select)),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const rows = state.registers.filter((x) => match(x, where));
        for (const r of rows) {
          assertUnique({ ...r, ...data }, r.id);
          Object.assign(r, data, { updated_at: new Date() });
        }
        return { count: rows.length };
      },
      count: async ({ where }: { where: Row }) => state.registers.filter((x) => match(x, where)).length,
    },
    cashSession: {
      findFirst: async ({ where }: { where: Row }) => {
        const s = state.sessions.find((x) => match(x, where));
        return s ? { ...s } : null;
      },
      create: async ({ data }: { data: Row }) => {
        const row = { id: `cs-${++seq}`, opened_at: new Date(), opened_by_user: null, ...data };
        state.sessions.push(row);
        return { ...row };
      },
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>, opts?: { isolationLevel?: unknown }) => {
      calls.transactions++;
      calls.isolationLevels.push(opts?.isolationLevel);
      const run = txChain.then(async () => {
        const snapshot = structuredClone(state);
        try {
          return await fn(client);
        } catch (e) {
          state = snapshot;
          throw e;
        }
      });
      txChain = run.catch(() => {});
      return run;
    },
  };

  return {
    db: client as never,
    get state() { return state; },
    calls,
    activeCount: () => state.registers.filter((r) => r.tenant_id === T && r.is_active).length,
  };
}

const reg = (over: Row = {}): Row => ({
  id: "reg-a", tenant_id: T, location_id: L1, code: "CAJA-01", name: "Caja principal",
  is_active: true, created_at: new Date(), updated_at: new Date(), created_by: "creator", updated_by: "creator",
  ...over,
});

// ─────────────────────────────────────────────────────────────────

describe("createCashRegister", () => {
  it("(1/8) caja válida → activa, ligada al tenant/location del scope, auditoría del usuario efectivo", async () => {
    const fake = createFakeDb();
    const r = await createCashRegister(scope(), { code: "CAJA-01", name: "Caja principal" }, fake.db, managedCtx(1));
    expect(r).toMatchObject({ ok: true, data: { code: "CAJA-01", name: "Caja principal", is_active: true } });
    expect(fake.state.registers[0]).toMatchObject({
      tenant_id: T, location_id: L1, is_active: true, created_by: U, updated_by: U,
    });
    expect(fake.calls.isolationLevels[0]).toBe(Prisma.TransactionIsolationLevel.Serializable);
  });

  it("(3) código duplicado en la misma location → mensaje claro, sin crear", async () => {
    const fake = createFakeDb({ registers: [reg()] });
    const r = await createCashRegister(scope(), { code: "CAJA-01", name: "Otra" }, fake.db, managedCtx(5));
    expect(r).toEqual({ ok: false, error: MSG.DUPLICATE_CODE });
    expect(MSG.DUPLICATE_CODE).toBe("Ya existe una caja con ese código en esta sucursal.");
    expect(fake.state.registers).toHaveLength(1);
  });

  it("(4) mismo código en OTRA location es válido", async () => {
    const fake = createFakeDb({ registers: [reg()] });
    const r = await createCashRegister(scope(L2), { code: "CAJA-01", name: "Caja sede 2" }, fake.db, managedCtx(5));
    expect(r.ok).toBe(true);
    expect(fake.state.registers.filter((x) => x.code === "CAJA-01")).toHaveLength(2);
  });

  it("(9) capacidad agotada → no crea", async () => {
    const fake = createFakeDb({ registers: [reg()] });
    const r = await createCashRegister(scope(), { code: "CAJA-02", name: "Segunda" }, fake.db, managedCtx(1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(LIMIT_MSG_FRAGMENT);
    expect(fake.state.registers).toHaveLength(1);
  });

  it("las cajas inactivas no consumen cupo al crear", async () => {
    const fake = createFakeDb({ registers: [reg({ is_active: false })] });
    const r = await createCashRegister(scope(), { code: "CAJA-02", name: "Segunda" }, fake.db, managedCtx(1));
    expect(r.ok).toBe(true);
  });

  it("(10) dos creaciones concurrentes con 1 cupo libre → solo una crea", async () => {
    const fake = createFakeDb({ registers: [reg()] });
    const ctx = managedCtx(2);
    const [a, b] = await Promise.all([
      createCashRegister(scope(), { code: "CAJA-02", name: "A" }, fake.db, ctx),
      createCashRegister(scope(), { code: "CAJA-03", name: "B" }, fake.db, ctx),
    ]);
    expect([a, b].filter((r) => r.ok)).toHaveLength(1);
    expect(fake.activeCount()).toBe(2);
  });

  it("LEGACY_UNMANAGED no bloquea por capacidad (comportamiento existente del motor)", async () => {
    const fake = createFakeDb({ registers: [reg()] });
    const ctx = { ...managedCtx(0), mode: "LEGACY_UNMANAGED" as const };
    expect((await createCashRegister(scope(), { code: "CAJA-02", name: "B" }, fake.db, ctx)).ok).toBe(true);
  });
});

describe("updateCashRegister", () => {
  it("(11) edita código y nombre; conserva created_by y actualiza updated_by", async () => {
    const fake = createFakeDb({ registers: [reg()] });
    const r = await updateCashRegister(scope(), { cash_register_id: "reg-a", code: "CAJA-10", name: "Mostrador" }, fake.db);
    expect(r).toMatchObject({ ok: true, data: { code: "CAJA-10", name: "Mostrador" } });
    expect(fake.state.registers[0]).toMatchObject({ created_by: "creator", updated_by: U, is_active: true });
  });

  it("(12) editar con capacidad llena no consume cupo ni pasa por el check de capacidad", async () => {
    const fake = createFakeDb({ registers: [reg()] });
    const r = await updateCashRegister(scope(), { cash_register_id: "reg-a", code: "CAJA-01", name: "Renombrada" }, fake.db);
    expect(r.ok).toBe(true);
    expect(fake.calls.transactions).toBe(0);
    expect(fake.activeCount()).toBe(1);
  });

  it("cambio de código a uno existente en la misma location → duplicado", async () => {
    const fake = createFakeDb({ registers: [reg(), reg({ id: "reg-b", code: "CAJA-02" })] });
    const r = await updateCashRegister(scope(), { cash_register_id: "reg-b", code: "CAJA-01", name: "X" }, fake.db);
    expect(r).toEqual({ ok: false, error: MSG.DUPLICATE_CODE });
    expect(fake.state.registers[1].code).toBe("CAJA-02");
  });

  it("(20) cross-tenant: caja de otro tenant no se edita", async () => {
    const fake = createFakeDb({ registers: [reg({ tenant_id: "tenant-B" })] });
    const r = await updateCashRegister(scope(), { cash_register_id: "reg-a", code: "HACK", name: "X" }, fake.db);
    expect(r).toEqual({ ok: false, error: MSG.NOT_FOUND });
    expect(fake.state.registers[0].code).toBe("CAJA-01");
  });

  it("(21) cross-location: caja de otra location no se edita", async () => {
    const fake = createFakeDb({ registers: [reg({ location_id: L2 })] });
    const r = await updateCashRegister(scope(L1), { cash_register_id: "reg-a", code: "HACK", name: "X" }, fake.db);
    expect(r).toEqual({ ok: false, error: MSG.NOT_FOUND });
    expect(fake.state.registers[0].code).toBe("CAJA-01");
  });
});

describe("setCashRegisterActive", () => {
  const closedSession = { id: "cs-old", tenant_id: T, location_id: L1, cash_register_id: "reg-a", status: "CLOSED" };

  it("(13/19) desactivar sin sesión OPEN → inactiva; sesiones históricas intactas", async () => {
    const fake = createFakeDb({ registers: [reg()], sessions: [closedSession] });
    const r = await setCashRegisterActive(scope(), { cash_register_id: "reg-a", is_active: false }, fake.db, managedCtx(1));
    expect(r).toMatchObject({ ok: true, data: { is_active: false } });
    expect(fake.state.registers[0]).toMatchObject({ is_active: false, updated_by: U });
    expect(fake.state.sessions).toEqual([closedSession]);
  });

  it("(14) desactivar con sesión OPEN → bloquea con mensaje, sin cambios", async () => {
    const fake = createFakeDb({
      registers: [reg()],
      sessions: [{ ...closedSession, id: "cs-open", status: "OPEN" }],
    });
    const r = await setCashRegisterActive(scope(), { cash_register_id: "reg-a", is_active: false }, fake.db, managedCtx(1));
    expect(r).toEqual({ ok: false, error: MSG.OPEN_SESSION });
    expect(MSG.OPEN_SESSION).toBe("No puedes desactivar una caja con una sesión abierta. Cierra la caja primero.");
    expect(fake.state.registers[0].is_active).toBe(true);
  });

  it("(15) desactivar libera capacidad: con el plan lleno, después se puede crear otra", async () => {
    const fake = createFakeDb({ registers: [reg()] });
    const ctx = managedCtx(1);
    expect((await createCashRegister(scope(), { code: "CAJA-02", name: "B" }, fake.db, ctx)).ok).toBe(false);
    expect((await setCashRegisterActive(scope(), { cash_register_id: "reg-a", is_active: false }, fake.db, ctx)).ok).toBe(true);
    expect((await createCashRegister(scope(), { code: "CAJA-02", name: "B" }, fake.db, ctx)).ok).toBe(true);
    expect(fake.activeCount()).toBe(1);
  });

  it("(16/19) reactivar consume capacidad y conserva las sesiones previas", async () => {
    const fake = createFakeDb({ registers: [reg({ is_active: false })], sessions: [closedSession] });
    const r = await setCashRegisterActive(scope(), { cash_register_id: "reg-a", is_active: true }, fake.db, managedCtx(1));
    expect(r).toMatchObject({ ok: true, data: { is_active: true } });
    expect(fake.activeCount()).toBe(1);
    expect(fake.state.sessions).toEqual([closedSession]);
  });

  it("(17) reactivar con capacidad agotada → bloquea, sigue inactiva", async () => {
    const fake = createFakeDb({ registers: [reg({ is_active: false }), reg({ id: "reg-b", code: "CAJA-02" })] });
    const r = await setCashRegisterActive(scope(), { cash_register_id: "reg-a", is_active: true }, fake.db, managedCtx(1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(LIMIT_MSG_FRAGMENT);
    expect(fake.state.registers[0].is_active).toBe(false);
  });

  it("estado ya aplicado → mensaje explícito sin escribir", async () => {
    const fake = createFakeDb({ registers: [reg()] });
    expect(await setCashRegisterActive(scope(), { cash_register_id: "reg-a", is_active: true }, fake.db, managedCtx(5))).toEqual({
      ok: false,
      error: MSG.ALREADY_ACTIVE,
    });
    expect(fake.calls.transactions).toBe(0);
  });

  it("(20) cross-tenant: no desactiva ni reactiva cajas de otro tenant", async () => {
    const fake = createFakeDb({ registers: [reg({ tenant_id: "tenant-B" })] });
    expect(await setCashRegisterActive(scope(), { cash_register_id: "reg-a", is_active: false }, fake.db, managedCtx(5))).toEqual({
      ok: false,
      error: MSG.NOT_FOUND,
    });
    expect(fake.state.registers[0].is_active).toBe(true);
  });

  it("(21) cross-location: no desactiva cajas de otra location", async () => {
    const fake = createFakeDb({ registers: [reg({ location_id: L2 })] });
    expect(await setCashRegisterActive(scope(L1), { cash_register_id: "reg-a", is_active: false }, fake.db, managedCtx(5))).toEqual({
      ok: false,
      error: MSG.NOT_FOUND,
    });
    expect(fake.state.registers[0].is_active).toBe(true);
  });
});

describe("regresión y workspace", () => {
  it("(18) una caja inactiva no puede abrir sesión (openCashSession existente)", async () => {
    const fake = createFakeDb({ registers: [reg({ is_active: false })] });
    const r = await openCashSession(
      { tenant_id: T, location_id: L1, cash_register_id: "reg-a", opened_by: U, opening_amount: 100, notes: null },
      fake.db,
    );
    expect(r.ok).toBe(false);
    expect(fake.state.sessions).toHaveLength(0);
  });

  it("(22) el workspace lista activas e inactivas (activas primero) para administración", async () => {
    const fake = createFakeDb({
      registers: [reg({ id: "reg-a", code: "CAJA-01", is_active: false }), reg({ id: "reg-b", code: "CAJA-02" })],
    });
    const ws = await getCashWorkspaceState(T, L1, undefined, fake.db);
    expect(ws.registers.map((r) => [r.code, r.is_active])).toEqual([
      ["CAJA-02", true],
      ["CAJA-01", false],
    ]);
  });

  it("(23) crear la primera caja deja el workspace utilizable sin reload: seleccionada y abrible", async () => {
    const fake = createFakeDb();
    expect((await getCashWorkspaceState(T, L1, undefined, fake.db)).registers).toHaveLength(0);

    const created = await createCashRegister(scope(), { code: "CAJA-01", name: "Caja principal" }, fake.db, managedCtx(1));
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const ws = await getCashWorkspaceState(T, L1, created.data.id, fake.db);
    expect(ws.registers).toHaveLength(1);
    expect(ws.selected_register).toMatchObject({ id: created.data.id, is_active: true, open_session: null });

    const opened = await openCashSession(
      { tenant_id: T, location_id: L1, cash_register_id: created.data.id, opened_by: U, opening_amount: 50, notes: null },
      fake.db,
    );
    expect(opened.ok).toBe(true);
  });
});
