// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3A — auditoría externa H01–H04: concurrencia de las acciones
// administrativas contra PostgreSQL REAL desechable (mismo arnés y reglas
// que 2B/3A: 127.0.0.1, puerto ≠ 5432, data_directory verificado).
//
// Dos conexiones reales: cada "carril" (A / B) usa su propio PrismaClient
// (pool independiente) y su propia identidad (AsyncLocalStorage). Sin
// sleeps: una BARRERA detiene una operación justo antes o después de una
// consulta concreta (extensión $allOperations) y pg_stat_activity confirma
// cuándo el otro carril queda esperando un lock.
//
// Cada escenario usa un punto de pausa que existe antes y después de la
// corrección: sin los locks, el invariante falla (reproducción); con ellos,
// el segundo carril queda bloqueado y el invariante se cumple.
//
// Se omite sin GYM_BOOKING_IT_*.
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "../booking/testing/pg-it-harness";
import { dayOffset } from "../booking/testing/booking-fixtures";
import { dateOnly, zonedInstant } from "../booking/booking-eligibility";
import { weekdayOf } from "./scheduling-rules";

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`REDIRECT ${url}`);
  }
}

type Identity = {
  session: Record<string, unknown>;
  ctx: { userId: string; role: string; tenantId: string; locationId: string | null };
};

const h = vi.hoisted(() => ({
  /** Carril actual (cliente + identidad); lo resuelve el test con AsyncLocalStorage. */
  lane: (): { client: unknown; who: Identity } | undefined => undefined,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectSignal(url);
  }),
  notFound: vi.fn(() => {
    throw new RedirectSignal("404");
  }),
}));
vi.mock("@/lib/auth/auth", () => ({ auth: vi.fn(async () => ({ user: h.lane()!.who.session })) }));
vi.mock("@/modules/platform/runtime/runtime-organization-access-gate", () => ({
  enforceRuntimeOrganizationAccess: vi.fn(async () => {}),
}));
vi.mock("@/modules/platform/runtime/effective-vertical", () => ({ requireEffectiveVertical: vi.fn(async () => {}) }));
vi.mock("@/modules/platform/runtime/require-operational-context", () => {
  class OperationalContextError extends Error {
    constructor(
      readonly code: string,
      readonly userMessage: string,
      readonly httpStatus: number
    ) {
      super(userMessage);
    }
  }
  return {
    OperationalContextError,
    requireOperationalContext: vi.fn(async () => {
      const { client, who } = h.lane()!;
      const c = who.ctx;
      return {
        context: {
          runtimeMode: "PLATFORM_NATIVE",
          authScope: "PLATFORM",
          effectiveUser: { id: c.userId, tenant_id: c.tenantId, location_id: c.locationId, role: c.role, auth_scope: "PLATFORM" },
          organizationId: null,
          tenantId: c.tenantId,
          gymId: c.tenantId,
          locationId: c.locationId,
          client,
          readOnly: false,
          commercialContext: null,
        },
        dispose: async () => {},
      };
    }),
  };
});

import { changeClientModalityAction } from "@/modules/clients/actions";
import {
  createClientMembershipAction,
  toggleClientMembershipStatusAction,
  updateClientMembershipAction,
  updatePlanAction,
} from "@/modules/memberships/actions";
import { updateGymBookingPolicyAction } from "@/modules/settings/actions";
import { createScheduledClassAction } from "../actions";
import { generateSeriesSessions } from "./series-service";

// ── Identidades y fixtures ───────────────────────────────────────
const T1 = "it3a-cc-tenant-1";
const T2 = "it3a-cc-tenant-2";
const B1 = randomUUID();
const B2 = randomUUID();
const SA1_ID = randomUUID();
const SA2_ID = randomUUID();
const TA = randomUUID(); // T1 / B1
const TC = randomUUID(); // T1 / B1
const TH = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]; // T1 / B1, uno por escenario H04
const TZ2 = randomUUID(); // T2 / B2
const CT1 = randomUUID();
const CT2 = randomUUID();
const TZ_OLD = "America/El_Salvador";
const TZ_NEW = "America/New_York";

const identity = (userId: string, tenantId: string): Identity => ({
  session: { id: userId, role: "super_admin", tenant_id: tenantId, location_id: null, auth_scope: "PLATFORM" },
  ctx: { userId, role: "super_admin", tenantId, locationId: null },
});
const SA1 = identity(SA1_ID, T1);
const SA2 = identity(SA2_ID, T2);

function fd(entries: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) if (v !== undefined && v !== null) f.set(k, String(v));
  return f;
}

async function run<T>(fn: () => Promise<T>): Promise<T | { redirect: string }> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RedirectSignal) return { redirect: err.url };
    throw err;
  }
}

// ── Barreras ─────────────────────────────────────────────────────
type Op = { model?: string; operation: string; sql: string };
type Deferred = { promise: Promise<void>; resolve: () => void };
function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
interface Gate {
  lane: string;
  when: "before" | "after";
  match: (op: Op) => boolean;
  fired: boolean;
  reached: Deferred;
  release: Deferred;
}
const gates: Gate[] = [];
/** Registro de consultas por carril (evidencia del protocolo de locks). */
const ops: (Op & { lane: string })[] = [];
/** Detiene la primera consulta del carril que cumpla `match` hasta `release`. */
function gate(lane: string, when: "before" | "after", match: (op: Op) => boolean): Gate {
  const g: Gate = { lane, when, match, fired: false, reached: deferred(), release: deferred() };
  gates.push(g);
  return g;
}
const isOp = (model: string, operation: string) => (op: Op) => op.model === model && op.operation === operation;

function sqlText(args: unknown): string {
  const a = args as { strings?: unknown; sql?: unknown } | unknown[] | undefined;
  if (!a) return "";
  if (Array.isArray(a)) return Array.isArray(a[0]) ? (a[0] as string[]).join("?") : String(a[0]);
  if (Array.isArray(a.strings)) return (a.strings as string[]).join("?");
  if (typeof a.sql === "string") return a.sql;
  return "";
}

/** Espera una promesa con límite (una barrera que no se alcanza falla rápido, no cuelga). */
async function within<T>(p: Promise<T>, what: string, ms = 20_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, rej) => (timer = setTimeout(() => rej(new Error(`timeout: ${what}`)), ms))),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe.skipIf(!IT_ENABLED)("GYM-3A · auditoría externa H01–H04 (concurrencia, PostgreSQL real)", () => {
  let it3a: ItDatabase;
  let db: PrismaClient;
  const lanes = new AsyncLocalStorage<{ client: unknown; who: Identity }>();
  let laneA: unknown;
  let laneB: unknown;

  function laneClient(lane: string) {
    return it3a.extraClient().$extends({
      query: {
        async $allOperations({ model, operation, args, query }: { model?: string; operation: string; args: unknown; query: (a: unknown) => Promise<unknown> }) {
          const op: Op = { model, operation, sql: sqlText(args) };
          ops.push({ ...op, lane });
          const hit = (when: "before" | "after") => gates.find((g) => !g.fired && g.lane === lane && g.when === when && g.match(op));
          const before = hit("before");
          if (before) {
            before.fired = true;
            before.reached.resolve();
            await before.release.promise;
          }
          const result = await query(args);
          const after = hit("after");
          if (after) {
            after.fired = true;
            after.reached.resolve();
            await after.release.promise;
          }
          return result;
        },
      },
    });
  }

  const inLane = <T>(client: unknown, who: Identity, fn: () => Promise<T>) => lanes.run({ client, who }, () => run(fn));

  /**
   * Con la operación P en curso: "blocked" si alguna conexión de la base
   * espera un lock (pg_stat_activity), "completed" si P terminó antes.
   */
  async function blockedOrCompleted(p: Promise<unknown>): Promise<"blocked" | "completed"> {
    let done = false;
    const settled = p.then(
      () => (done = true),
      () => (done = true)
    );
    const deadline = Date.now() + 20_000;
    for (;;) {
      if (done) return "completed";
      const [{ n }] = await db.$queryRawUnsafe<{ n: number }[]>(
        `SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname = $1 AND wait_event_type = 'Lock'`,
        it3a.name
      );
      if (n > 0) return "blocked";
      if (Date.now() > deadline) throw new Error("ni bloqueada ni completada");
      await Promise.race([settled, new Promise((r) => setTimeout(r, 10))]);
    }
  }

  async function seedClient(modality: "NORMAL" | "PERSONALIZED" | "GROUP" = "NORMAL") {
    const id = randomUUID();
    await db.client.create({
      data: { id, gym_id: T1, tenant_id: T1, branch_id: B1, first_name: "C", last_name: id.slice(0, 6), modality },
    });
    return id;
  }
  async function seedPlan(modality: "NORMAL" | "PERSONALIZED" | "GROUP", sessions_limit: number | null) {
    return db.membershipPlan.create({
      data: { gym_id: T1, tenant_id: T1, name: `P-${randomUUID().slice(0, 8)}`, duration_days: 30, price: 10, modality, sessions_limit },
    });
  }
  async function seedMembership(client_id: string, plan: { id: string; modality: "NORMAL" | "PERSONALIZED" | "GROUP"; sessions_limit: number | null }, extra: { status?: "active" | "cancelled"; assigned_trainer_id?: string } = {}) {
    return db.clientMembership.create({
      data: {
        gym_id: T1, tenant_id: T1, branch_id: B1, client_id, membership_plan_id: plan.id,
        start_date: new Date(`${dayOffset(0)}T00:00:00Z`), end_date: new Date(`${dayOffset(30)}T00:00:00Z`),
        price_at_sale: 10, final_amount: 10, payment_status: "paid",
        status: extra.status ?? "active",
        modality: plan.modality,
        sessions_total: plan.modality === "NORMAL" ? null : plan.sessions_limit,
        assigned_trainer_id: extra.assigned_trainer_id ?? null,
      },
    });
  }

  /** Invariante del contrato 3A: el snapshot de cada membresía corresponde a su plan. */
  async function expectSnapshotMatchesPlan(membershipId: string) {
    const m = await db.clientMembership.findUniqueOrThrow({ where: { id: membershipId }, include: { membership_plan: true } });
    expect({ modality: m.modality, sessions_total: m.sessions_total }).toEqual({
      modality: m.membership_plan.modality,
      sessions_total: m.membership_plan.modality === "NORMAL" ? null : m.membership_plan.sessions_limit,
    });
    return m;
  }

  beforeAll(async () => {
    it3a = await createItDatabase();
    db = it3a.db;
    laneA = laneClient("A");
    laneB = laneClient("B");
    const fallback = { client: db, who: SA1 };
    h.lane = () => lanes.getStore() ?? fallback;

    await db.runtimeTenant.createMany({
      data: [
        { id: T1, name: "IT3A CC One", slug: "it3a-cc-one" },
        { id: T2, name: "IT3A CC Two", slug: "it3a-cc-two" },
      ],
    });
    await db.gym.createMany({
      data: [
        { id: T1, tenant_id: T1, name: "IT3A CC One", slug: "it3a-cc-one" },
        { id: T2, tenant_id: T2, name: "IT3A CC Two", slug: "it3a-cc-two" },
      ],
    });
    await db.branch.createMany({
      data: [
        { id: B1, gym_id: T1, tenant_id: T1, name: "Sede CC 1" },
        { id: B2, gym_id: T2, tenant_id: T2, name: "Sede CC 2" },
      ],
    });
    await db.user.createMany({
      data: [
        { id: SA1_ID, tenant_id: T1, gym_id: T1, branch_id: null, email: `${SA1_ID}@it3a.invalid`, password_hash: "x", first_name: "It", last_name: "sa", role: "super_admin" },
        { id: SA2_ID, tenant_id: T2, gym_id: T2, branch_id: null, email: `${SA2_ID}@it3a.invalid`, password_hash: "x", first_name: "It", last_name: "sa", role: "super_admin" },
      ],
    });
    const trainer = (id: string, tenant: string, branch: string) => ({ id, gym_id: tenant, tenant_id: tenant, branch_id: branch, first_name: "T", last_name: id.slice(0, 4), personalized_capacity: 1 });
    await db.trainer.createMany({
      data: [trainer(TA, T1, B1), trainer(TC, T1, B1), ...TH.map((t) => trainer(t, T1, B1)), trainer(TZ2, T2, B2)],
    });
    const allWeek = (trainerId: string, tenant: string, branch: string) =>
      [0, 1, 2, 3, 4, 5, 6].map((d) => ({ gym_id: tenant, tenant_id: tenant, branch_id: branch, trainer_id: trainerId, day_of_week: d, start_time: "05:00", end_time: "23:00" }));
    await db.trainerAvailability.createMany({
      data: [...TH.flatMap((t) => allWeek(t, T1, B1)), ...allWeek(TZ2, T2, B2)],
    });
    await db.classType.createMany({
      data: [
        { id: CT1, gym_id: T1, tenant_id: T1, name: "Funcional CC", capacity_default: 10 },
        { id: CT2, gym_id: T2, tenant_id: T2, name: "Funcional CC 2", capacity_default: 10 },
      ],
    });
    await db.gymSettings.createMany({
      data: [
        { gym_id: T1, tenant_id: T1, timezone: TZ_OLD, personalized_booking_enabled: true, group_booking_enabled: true },
        { gym_id: T2, tenant_id: T2, timezone: TZ_OLD, personalized_booking_enabled: true, group_booking_enabled: true },
      ],
    });
  }, 180_000);

  afterAll(async () => {
    for (const g of gates) g.release.resolve();
    await it3a?.drop();
    await disconnectAdmin();
  });

  // ══ H01 — edición concurrente de una membresía ═══════════════════
  describe("H01 updateClientMembershipAction concurrente", () => {
    const edit = (id: string, membership_plan_id: string, extra: Record<string, string> = {}) =>
      fd({ id, membership_plan_id, start_date: dayOffset(0), price_at_sale: "10", payment_status: "paid", status: "active", ...extra });

    it("H01a B lee la membresía (Plan 1) antes del cambio de A (Plan 1 → Plan 2): el snapshot persiste coherente con el plan", async () => {
      const client = await seedClient("PERSONALIZED");
      const p1 = await seedPlan("PERSONALIZED", 4);
      const p2 = await seedPlan("PERSONALIZED", 8);
      const m = await seedMembership(client, p1, { assigned_trainer_id: TA });

      // B se detiene tras su primera lectura de la membresía (formulario abierto sobre Plan 1).
      const g = gate("B", "after", isOp("ClientMembership", "findFirst"));
      const pB = inLane(laneB, SA1, () => updateClientMembershipAction(undefined, edit(m.id, p1.id, { notes: "B" })));
      await within(g.reached.promise, "B alcanza la barrera");

      // A cambia de plan y de entrenador y confirma.
      expect(await inLane(laneA, SA1, () => updateClientMembershipAction(undefined, edit(m.id, p2.id, { assigned_trainer_id: TC })))).toEqual({
        redirect: "/dashboard/memberships/client-memberships",
      });
      g.release.resolve();
      expect(await within(pB, "B termina")).toEqual({ redirect: "/dashboard/memberships/client-memberships" });

      // B (último en escribir) vuelve a Plan 1: su snapshot DEBE ser el de Plan 1,
      // y sin campo de entrenador conserva el vigente (TC), no el que leyó antes.
      const final = await expectSnapshotMatchesPlan(m.id);
      expect(final).toMatchObject({ membership_plan_id: p1.id, sessions_total: 4, assigned_trainer_id: TC, notes: "B" });
    });

    it("H01b A tiene la membresía bloqueada; B espera el lock y decide con los datos releídos (plan, sesiones y entrenador)", async () => {
      const client = await seedClient("PERSONALIZED");
      const p1 = await seedPlan("PERSONALIZED", 4);
      const p2 = await seedPlan("PERSONALIZED", 8);
      const m = await seedMembership(client, p1, { assigned_trainer_id: TA });

      // A se detiene con sus locks tomados, justo antes de escribir.
      const g = gate("A", "before", isOp("ClientMembership", "update"));
      const pA = inLane(laneA, SA1, () => updateClientMembershipAction(undefined, edit(m.id, p2.id, { assigned_trainer_id: TC })));
      await within(g.reached.promise, "A alcanza la barrera");

      const mark = ops.length;
      const pB = inLane(laneB, SA1, () => updateClientMembershipAction(undefined, edit(m.id, p1.id, { notes: "B" })));
      const observed = await blockedOrCompleted(pB);
      g.release.resolve();
      expect(await within(pA, "A termina")).toEqual({ redirect: "/dashboard/memberships/client-memberships" });
      expect(await within(pB, "B termina")).toEqual({ redirect: "/dashboard/memberships/client-memberships" });

      const final = await expectSnapshotMatchesPlan(m.id);
      // B no revierte el entrenador que A asignó (su formulario no lo trae).
      expect(final).toMatchObject({ membership_plan_id: p1.id, sessions_total: 4, assigned_trainer_id: TC });
      expect(observed).toBe("blocked");
      // Intento 1 bloqueó TA (lectura previa); bajo lock el entrenador vigente es TC → reintento que bloquea TC.
      const trainerLocks = ops.slice(mark).filter((o) => o.lane === "B" && /FROM "trainers"[\s\S]*FOR SHARE/.test(o.sql));
      expect(trainerLocks).toHaveLength(2);
    });
  });

  // ══ H02 — reactivación vs. cambio de modalidad ═══════════════════
  describe("H02 toggleClientMembershipStatusAction vs changeClientModalityAction", () => {
    const toggle = (id: string) => fd({ id });
    const change = (client_id: string) => fd({ client_id, to_modality: "PERSONALIZED", reason: "Pasa a personalizado" });

    async function expectNoIncompatibleActive(client_id: string) {
      const c = await db.client.findUniqueOrThrow({ where: { id: client_id } });
      const active = await db.clientMembership.findMany({ where: { client_id, status: { in: ["active", "suspended"] } } });
      expect(active.filter((x) => x.modality !== c.modality)).toEqual([]);
      return c;
    }

    it("H02a B (reactivar) leyó la modalidad NORMAL antes de que A cambie a PERSONALIZED → nunca queda activa una NORMAL", async () => {
      const client = await seedClient("NORMAL");
      const plan = await seedPlan("NORMAL", null);
      const m = await seedMembership(client, plan, { status: "cancelled" });

      const g = gate("B", "after", isOp("Client", "findFirst"));
      const pB = inLane(laneB, SA1, () => toggleClientMembershipStatusAction(toggle(m.id)));
      await within(g.reached.promise, "B alcanza la barrera");

      const pA = inLane(laneA, SA1, () => changeClientModalityAction(undefined, change(client)));
      const observed = await blockedOrCompleted(pA);
      g.release.resolve();
      await within(pB, "B termina");
      const rA = await within(pA, "A termina");

      const c = await expectNoIncompatibleActive(client);
      // Serializado: B reactiva primero y A se rechaza por la membresía vigente.
      expect(observed).toBe("blocked");
      expect(rA).toMatchObject({ error: expect.stringContaining("membresía") });
      expect(c.modality).toBe("NORMAL");
      expect((await db.clientMembership.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("active");
      expect(await db.clientModalityChange.count({ where: { client_id: client } })).toBe(0);
    });

    it("H02b A (cambio) ya verificó las membresías; B intenta reactivar → B espera y no reactiva (sin escrituras parciales)", async () => {
      const client = await seedClient("NORMAL");
      const plan = await seedPlan("NORMAL", null);
      const m = await seedMembership(client, plan, { status: "cancelled" });
      const before = await db.clientMembership.findUniqueOrThrow({ where: { id: m.id } });

      const g = gate("A", "after", isOp("ClientMembership", "findMany"));
      const pA = inLane(laneA, SA1, () => changeClientModalityAction(undefined, change(client)));
      await within(g.reached.promise, "A alcanza la barrera");

      const pB = inLane(laneB, SA1, () => toggleClientMembershipStatusAction(toggle(m.id)));
      const observed = await blockedOrCompleted(pB);
      g.release.resolve();
      expect(await within(pA, "A termina")).toEqual({ success: expect.stringContaining("Personalizada") });
      await within(pB, "B termina");

      const c = await expectNoIncompatibleActive(client);
      expect(c.modality).toBe("PERSONALIZED");
      expect(observed).toBe("blocked");
      expect(await db.clientMembership.findUniqueOrThrow({ where: { id: m.id } })).toEqual(before);
    });

    it("H02c cancelar sigue igual: una membresía activa se cancela sin depender de la modalidad", async () => {
      const client = await seedClient("NORMAL");
      const plan = await seedPlan("NORMAL", null);
      const m = await seedMembership(client, plan);
      await inLane(laneA, SA1, () => toggleClientMembershipStatusAction(toggle(m.id)));
      expect((await db.clientMembership.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("cancelled");
    });
  });

  // ══ H03 — cambio de modalidad del plan vs. venta ═════════════════
  describe("H03 updatePlanAction vs createClientMembershipAction", () => {
    const editPlan = (plan: { id: string; name: string }, modality: string) =>
      fd({ id: plan.id, name: plan.name, duration_days: "30", price: "10", access_type: "full", sessions_limit: "6", modality });
    const sale = (client_id: string, membership_plan_id: string) =>
      fd({ client_id, membership_plan_id, branch_id: B1, start_date: dayOffset(0), price_at_sale: "10", payment_status: "paid" });

    async function expectPlanContract(planId: string) {
      const plan = await db.membershipPlan.findUniqueOrThrow({ where: { id: planId } });
      const sold = await db.clientMembership.findMany({ where: { membership_plan_id: planId } });
      // Un plan con ventas conserva la modalidad con la que vendió.
      expect(sold.filter((s) => s.modality !== plan.modality)).toEqual([]);
      return { plan, sold };
    }

    it("H03a A (cambio de modalidad) ya contó cero ventas; B vende → nunca queda un plan GROUP con una venta NORMAL", async () => {
      const client = await seedClient("NORMAL");
      const plan = await seedPlan("NORMAL", null);

      const g = gate("A", "after", isOp("ClientMembership", "count"));
      const pA = inLane(laneA, SA1, () => updatePlanAction(undefined, editPlan(plan, "GROUP")));
      await within(g.reached.promise, "A alcanza la barrera");

      const pB = inLane(laneB, SA1, () => createClientMembershipAction(undefined, sale(client, plan.id)));
      const observed = await blockedOrCompleted(pB);
      g.release.resolve();
      expect(await within(pA, "A termina")).toEqual({ redirect: "/dashboard/memberships/plans" });
      const rB = await within(pB, "B termina");

      const { plan: final, sold } = await expectPlanContract(plan.id);
      expect(observed).toBe("blocked");
      expect(final.modality).toBe("GROUP");
      // La venta ve el plan efectivo (GROUP) y lo rechaza por la modalidad del cliente.
      expect(rB).toMatchObject({ errors: { membership_plan_id: [expect.stringContaining("Grupal")] } });
      expect(sold).toEqual([]);
    });

    it("H03b B (venta) ya tomó su snapshot NORMAL; A cambia la modalidad → A espera y se rechaza por la venta", async () => {
      const client = await seedClient("NORMAL");
      const plan = await seedPlan("NORMAL", null);

      const g = gate("B", "before", isOp("ClientMembership", "create"));
      const pB = inLane(laneB, SA1, () => createClientMembershipAction(undefined, sale(client, plan.id)));
      await within(g.reached.promise, "B alcanza la barrera");

      const pA = inLane(laneA, SA1, () => updatePlanAction(undefined, editPlan(plan, "GROUP")));
      const observed = await blockedOrCompleted(pA);
      g.release.resolve();
      expect(await within(pB, "B termina")).toEqual({ redirect: "/dashboard/memberships/client-memberships" });
      const rA = await within(pA, "A termina");

      const { plan: final, sold } = await expectPlanContract(plan.id);
      expect(observed).toBe("blocked");
      expect(final.modality).toBe("NORMAL");
      expect(rA).toMatchObject({ errors: { modality: [expect.stringContaining("1 membresía")] } });
      expect(sold).toHaveLength(1);
      expect(sold[0]).toMatchObject({ modality: "NORMAL", sessions_total: null });
    });

    it("H03c sin ventas, el plan sí cambia de modalidad y sessions_limit no altera snapshots vendidos", async () => {
      const plan = await seedPlan("NORMAL", null);
      expect(await inLane(laneA, SA1, () => updatePlanAction(undefined, editPlan(plan, "GROUP")))).toEqual({ redirect: "/dashboard/memberships/plans" });
      expect((await db.membershipPlan.findUniqueOrThrow({ where: { id: plan.id } })).modality).toBe("GROUP");
    });
  });

  // ══ H04 — timezone vs. sesiones con instantes ════════════════════
  describe("H04 updateGymBookingPolicyAction vs creación/generación de sesiones", () => {
    const policy = (timezone: string) =>
      fd({
        timezone,
        personalized_booking_enabled: "on",
        group_booking_enabled: "on",
        personalized_default_capacity: "1",
        booking_horizon_days: "30",
        booking_min_lead_minutes: "15",
        cancel_min_lead_minutes: "90",
        late_cancel_consumes_session: "on",
        attendance_edit_window_hours: "48",
        series_generation_weeks: "4",
      });
    const klass = (trainer_id: string, title: string, tenant: { branch: string; classType: string } = { branch: B1, classType: CT1 }) =>
      fd({ branch_id: tenant.branch, class_type_id: tenant.classType, trainer_id, title, class_date: dayOffset(40), start_time: "07:00", end_time: "08:00", session_kind: "PERSONALIZED" });

    async function resetPolicy() {
      await db.scheduledClass.updateMany({ where: { tenant_id: T1, status: "scheduled" }, data: { status: "cancelled" } });
      await db.gymSettings.update({ where: { gym_id: T1 }, data: { timezone: TZ_OLD } });
    }

    /** Toda sesión PERSONALIZED/GROUP vigente tiene instantes en la timezone confirmada. */
    async function expectInstantsMatchPolicy(tenant = T1) {
      const tz = (await db.gymSettings.findUniqueOrThrow({ where: { gym_id: tenant } })).timezone!;
      const rows = await db.scheduledClass.findMany({
        where: { tenant_id: tenant, session_kind: { in: ["PERSONALIZED", "GROUP"] }, status: { in: ["scheduled", "in_progress"] } },
      });
      for (const r of rows) {
        const date = dateOnly(r.class_date);
        expect({ id: r.id, starts_at: r.starts_at?.toISOString(), ends_at: r.ends_at?.toISOString() }).toEqual({
          id: r.id,
          starts_at: zonedInstant(date, r.start_time, tz)?.toISOString(),
          ends_at: zonedInstant(date, r.end_time, tz)?.toISOString(),
        });
      }
      return { tz, rows };
    }

    it("H04a A (timezone) ya contó cero sesiones; B crea una PERSONALIZED → B espera y usa la timezone nueva", async () => {
      await resetPolicy();
      const g = gate("A", "after", isOp("ScheduledClass", "count"));
      const pA = inLane(laneA, SA1, () => updateGymBookingPolicyAction(undefined, policy(TZ_NEW)));
      await within(g.reached.promise, "A alcanza la barrera");

      const pB = inLane(laneB, SA1, () => createScheduledClassAction(undefined, klass(TH[0], "H04a")));
      const observed = await blockedOrCompleted(pB);
      g.release.resolve();
      expect(await within(pA, "A termina")).toEqual({ success: "Política de reservas guardada." });
      expect(await within(pB, "B termina")).toEqual({ redirect: "/dashboard/classes" });

      const { tz, rows } = await expectInstantsMatchPolicy();
      expect(observed).toBe("blocked");
      expect(tz).toBe(TZ_NEW);
      expect(rows.map((r) => r.title)).toEqual(["H04a"]);
    });

    it("H04b B (alta) ya calculó instantes; A cambia la timezone → A espera y se rechaza por la sesión", async () => {
      await resetPolicy();
      const g = gate("B", "before", isOp("ScheduledClass", "create"));
      const pB = inLane(laneB, SA1, () => createScheduledClassAction(undefined, klass(TH[1], "H04b")));
      await within(g.reached.promise, "B alcanza la barrera");

      const pA = inLane(laneA, SA1, () => updateGymBookingPolicyAction(undefined, policy(TZ_NEW)));
      const observed = await blockedOrCompleted(pA);
      g.release.resolve();
      expect(await within(pB, "B termina")).toEqual({ redirect: "/dashboard/classes" });
      const rA = await within(pA, "A termina");

      const { tz } = await expectInstantsMatchPolicy();
      expect(observed).toBe("blocked");
      expect(tz).toBe(TZ_OLD);
      expect(rA).toMatchObject({ errors: { timezone: [expect.stringContaining("1 sesión")] } });
    });

    it("H04c generación de serie GROUP ya calculó instantes; A cambia la timezone → A espera y se rechaza", async () => {
      await resetPolicy();
      const series = await db.classSeries.create({
        data: { tenant_id: T1, location_id: B1, class_type_id: CT1, trainer_id: TH[2], session_kind: "GROUP", title: "H04c", weekday: weekdayOf(dayOffset(3)), start_time: "18:00", end_time: "19:00", capacity: 5, valid_from: new Date(`${dayOffset(0)}T00:00:00Z`) },
      });
      const g = gate("B", "before", isOp("ScheduledClass", "createMany"));
      const pB = lanes.run({ client: laneB, who: SA1 }, () =>
        generateSeriesSessions(laneB as PrismaClient, { tenantId: T1, gymId: T1, seriesId: series.id, actorUserId: SA1_ID })
      );
      await within(g.reached.promise, "B alcanza la barrera");

      const pA = inLane(laneA, SA1, () => updateGymBookingPolicyAction(undefined, policy(TZ_NEW)));
      const observed = await blockedOrCompleted(pA);
      g.release.resolve();
      const rB = await within(pB, "B termina");
      const rA = await within(pA, "A termina");

      expect(rB.ok && rB.report.created.length).toBeGreaterThan(0);
      const { tz } = await expectInstantsMatchPolicy();
      expect(observed).toBe("blocked");
      expect(tz).toBe(TZ_OLD);
      expect(rA).toMatchObject({ errors: { timezone: [expect.any(String)] } });
    });

    it("H04d aislamiento: el lock de la política de T1 no detiene una sesión de T2", async () => {
      await resetPolicy();
      const g = gate("A", "after", isOp("ScheduledClass", "count"));
      const pA = inLane(laneA, SA1, () => updateGymBookingPolicyAction(undefined, policy(TZ_NEW)));
      await within(g.reached.promise, "A alcanza la barrera");

      const pB = inLane(laneB, SA2, () => createScheduledClassAction(undefined, klass(TZ2, "H04d", { branch: B2, classType: CT2 })));
      expect(await blockedOrCompleted(pB)).toBe("completed");
      expect(await pB).toEqual({ redirect: "/dashboard/classes" });
      g.release.resolve();
      expect(await within(pA, "A termina")).toEqual({ success: "Política de reservas guardada." });

      await expectInstantsMatchPolicy(T2);
      expect((await db.gymSettings.findUniqueOrThrow({ where: { gym_id: T2 } })).timezone).toBe(TZ_OLD);
    });

    it("H04e sin concurrencia, una sesión OPEN heredada no depende de la timezone (instantes NULL)", async () => {
      await resetPolicy();
      const f = klass(TH[3], "H04e");
      f.delete("session_kind");
      f.set("capacity", "10");
      expect(await inLane(laneA, SA1, () => createScheduledClassAction(undefined, f))).toEqual({ redirect: "/dashboard/classes" });
      expect(await db.scheduledClass.findFirstOrThrow({ where: { title: "H04e" } })).toMatchObject({ session_kind: "OPEN", starts_at: null, ends_at: null });
    });
  });
});
