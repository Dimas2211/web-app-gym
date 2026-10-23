// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3A — administración de modalidades contra PostgreSQL REAL
// desechable (mismo arnés y reglas de aislamiento que 2B: 127.0.0.1,
// puerto ≠ 5432, data_directory verificado; sin .env ni DATABASE_URL).
//
// Ejecuta las Server Actions REALES con los guards REALES
// (@/lib/permissions/guards). Solo se simulan: la sesión de Auth.js
// (auth()), la puerta de licencia runtime, el contexto operacional (que
// entrega el PrismaClient real, el tenant y el rol LIVE) y next/cache /
// next/navigation (redirect lanza una señal, como en Next).
//
// Fixtures sintéticos: tenants T1 (El Salvador, modalidades ON), T2
// (defaults, vecino en la misma base) y T3 (America/New_York, DST).
// Se omite sin GYM_BOOKING_IT_*.
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "../booking/testing/pg-it-harness";
import { dayOffset } from "../booking/testing/booking-fixtures";
import { weekdayOf } from "./scheduling-rules";

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`REDIRECT ${url}`);
  }
}

const h = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  ctx: null as null | { userId: string; role: string; tenantId: string; locationId: string | null },
  disabledModules: [] as string[],
  db: null as unknown,
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
vi.mock("@/lib/auth/auth", () => ({ auth: vi.fn(async () => (h.session ? { user: h.session } : null)) }));
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
    requireOperationalContext: vi.fn(async (_user: unknown, options: { module?: string } = {}) => {
      if (options.module && h.disabledModules.includes(options.module)) {
        throw new OperationalContextError("MODULE_DISABLED", "Módulo no habilitado para esta organización.", 403);
      }
      const c = h.ctx!;
      return {
        context: {
          runtimeMode: "PLATFORM_NATIVE",
          authScope: "PLATFORM",
          effectiveUser: { id: c.userId, tenant_id: c.tenantId, location_id: c.locationId, role: c.role, auth_scope: "PLATFORM" },
          organizationId: null,
          tenantId: c.tenantId,
          gymId: c.tenantId,
          locationId: c.locationId,
          client: h.db,
          readOnly: false,
          commercialContext: null,
        },
        dispose: async () => {},
      };
    }),
  };
});

import { changeClientModalityAction, createClientAction } from "@/modules/clients/actions";
import { createClientMembershipAction, createPlanAction, updatePlanAction } from "@/modules/memberships/actions";
import { updateGymBookingPolicyAction } from "@/modules/settings/actions";
import { createScheduledClassAction, updateScheduledClassAction } from "../actions";
import { createClassSeriesAction, generateClassSeriesSessionsAction } from "../series-actions";
import { createGymActivityAction, toggleGymActivityStatusAction, updateGymActivityAction } from "../activities-actions";
import {
  createTrainerTimeOffAction,
  deactivateTrainerTimeOffAction,
} from "@/modules/trainers/time-off-actions";
import { generateSeriesSessions } from "./series-service";

// ── Identidades ──────────────────────────────────────────────────
const T1 = "it3a-tenant-1";
const T2 = "it3a-tenant-2";
const T3 = "it3a-tenant-3";
const B1 = randomUUID();
const B1B = randomUUID();
const B2 = randomUUID();
const B3 = randomUUID();
const U = {
  sa1: randomUUID(),
  ba1: randomUUID(),
  ba1b: randomUUID(),
  rc1: randomUUID(),
  tr1: randomUUID(),
  cl1: randomUUID(),
  sa2: randomUUID(),
};
const TA = randomUUID(); // T1 / B1, cupo personalizado 2
const TB = randomUUID(); // T1 / B1B
const TZ2 = randomUUID(); // T2 / B2
const TNY = randomUUID(); // T3 / B3
const CT1 = randomUUID();
const CT2 = randomUUID();
const CT3 = randomUUID();

type Role = "super_admin" | "branch_admin" | "reception" | "trainer" | "client";

/** Sesión JWT (guards) + contexto operacional (rol LIVE). `live` permite simular un rol degradado. */
function as(userId: string, role: Role, tenantId: string, locationId: string | null, live?: Role) {
  h.session = { id: userId, role, tenant_id: tenantId, location_id: locationId, auth_scope: "PLATFORM" };
  h.ctx = { userId, role: live ?? role, tenantId, locationId };
}
const SA1 = () => as(U.sa1, "super_admin", T1, null);
const BA1 = () => as(U.ba1, "branch_admin", T1, B1);
const BA1B = () => as(U.ba1b, "branch_admin", T1, B1B);
const RC1 = () => as(U.rc1, "reception", T1, B1);
const SA2 = () => as(U.sa2, "super_admin", T2, null);

function fd(entries: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) if (v !== undefined && v !== null) f.set(k, String(v));
  return f;
}

/** Ejecuta una acción y normaliza el redirect de Next. */
async function run<T>(fn: () => Promise<T>): Promise<T | { redirect: string }> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RedirectSignal) return { redirect: err.url };
    throw err;
  }
}

describe.skipIf(!IT_ENABLED)("GYM-3A · administración de modalidades (PostgreSQL real)", () => {
  let it3a: ItDatabase;
  let db: PrismaClient;

  async function seedClient(tenant: string, branch: string, modality: "NORMAL" | "PERSONALIZED" | "GROUP" = "NORMAL") {
    const id = randomUUID();
    await db.client.create({
      data: { id, gym_id: tenant, tenant_id: tenant, branch_id: branch, first_name: "C", last_name: id.slice(0, 6), modality },
    });
    return id;
  }

  beforeAll(async () => {
    it3a = await createItDatabase();
    db = it3a.db;
    h.db = db;
    await db.runtimeTenant.createMany({
      data: [
        { id: T1, name: "IT3A One", slug: "it3a-one" },
        { id: T2, name: "IT3A Two", slug: "it3a-two" },
        { id: T3, name: "IT3A Three", slug: "it3a-three" },
      ],
    });
    await db.gym.createMany({
      data: [
        { id: T1, tenant_id: T1, name: "IT3A One", slug: "it3a-one" },
        { id: T2, tenant_id: T2, name: "IT3A Two", slug: "it3a-two" },
        { id: T3, tenant_id: T3, name: "IT3A Three", slug: "it3a-three" },
      ],
    });
    await db.branch.createMany({
      data: [
        { id: B1, gym_id: T1, tenant_id: T1, name: "Sede 1A" },
        { id: B1B, gym_id: T1, tenant_id: T1, name: "Sede 1B" },
        { id: B2, gym_id: T2, tenant_id: T2, name: "Sede 2" },
        { id: B3, gym_id: T3, tenant_id: T3, name: "Sede 3" },
      ],
    });
    const staff = (id: string, tenant: string, role: Role, branch: string | null) => ({
      id,
      tenant_id: tenant,
      gym_id: tenant,
      branch_id: branch,
      email: `${id}@it3a.invalid`,
      password_hash: "x",
      first_name: "It",
      last_name: role,
      role,
    });
    await db.user.createMany({
      data: [
        staff(U.sa1, T1, "super_admin", null),
        staff(U.ba1, T1, "branch_admin", B1),
        staff(U.ba1b, T1, "branch_admin", B1B),
        staff(U.rc1, T1, "reception", B1),
        staff(U.tr1, T1, "trainer", B1),
        staff(U.cl1, T1, "client", B1),
        staff(U.sa2, T2, "super_admin", null),
      ],
    });
    await db.trainer.createMany({
      data: [
        { id: TA, gym_id: T1, tenant_id: T1, branch_id: B1, first_name: "T", last_name: "A", personalized_capacity: 2 },
        { id: TB, gym_id: T1, tenant_id: T1, branch_id: B1B, first_name: "T", last_name: "B" },
        { id: TZ2, gym_id: T2, tenant_id: T2, branch_id: B2, first_name: "T", last_name: "Z" },
        { id: TNY, gym_id: T3, tenant_id: T3, branch_id: B3, first_name: "T", last_name: "NY" },
      ],
    });
    const allWeek = (trainer: string, tenant: string, branch: string) =>
      [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        gym_id: tenant,
        tenant_id: tenant,
        branch_id: branch,
        trainer_id: trainer,
        day_of_week: d,
        start_time: "05:00",
        end_time: "23:00",
      }));
    await db.trainerAvailability.createMany({
      data: [...allWeek(TA, T1, B1), ...allWeek(TB, T1, B1B), ...allWeek(TZ2, T2, B2), ...allWeek(TNY, T3, B3)],
    });
    await db.classType.createMany({
      data: [
        { id: CT1, gym_id: T1, tenant_id: T1, name: "Funcional" },
        { id: CT2, gym_id: T2, tenant_id: T2, name: "Funcional 2", capacity_default: 10 },
        { id: CT3, gym_id: T3, tenant_id: T3, name: "Funcional 3", capacity_default: 10 },
      ],
    });
    await db.gymSettings.createMany({
      data: [
        { gym_id: T1, tenant_id: T1, timezone: "America/El_Salvador", personalized_booking_enabled: true, group_booking_enabled: true },
        // Vecino Shared: flags apagados, valores propios que no deben cambiar.
        { gym_id: T2, tenant_id: T2, booking_horizon_days: 21, cancel_min_lead_minutes: 60 },
        { gym_id: T3, tenant_id: T3, timezone: "America/New_York", group_booking_enabled: true },
      ],
    });
  }, 180_000);

  afterAll(async () => {
    await it3a?.drop();
    await disconnectAdmin();
  });

  // ══ Clientes ═══════════════════════════════════════════════════
  describe("clientes", () => {
    it("C1 alta sin modalidad explícita → NORMAL", async () => {
      SA1();
      const r = await run(() => createClientAction(undefined, fd({ first_name: "Ana", last_name: "C1", branch_id: B1, document_id: "C1" })));
      expect(r).toEqual({ redirect: "/dashboard/clients" });
      expect((await db.client.findFirst({ where: { document_id: "C1" } }))?.modality).toBe("NORMAL");
    });

    it("C2 alta PERSONALIZED y GROUP por administrador", async () => {
      BA1();
      await run(() => createClientAction(undefined, fd({ first_name: "P", last_name: "C2", branch_id: B1, document_id: "C2P", modality: "PERSONALIZED" })));
      await run(() => createClientAction(undefined, fd({ first_name: "G", last_name: "C2", branch_id: B1, document_id: "C2G", modality: "GROUP" })));
      expect((await db.client.findFirst({ where: { document_id: "C2P" } }))?.modality).toBe("PERSONALIZED");
      expect((await db.client.findFirst({ where: { document_id: "C2G" } }))?.modality).toBe("GROUP");
    });

    it("C3 recepción no asigna modalidad GROUP (rol LIVE) → rechazo y cero escrituras", async () => {
      RC1();
      const r = await run(() => createClientAction(undefined, fd({ first_name: "R", last_name: "C3", branch_id: B1, document_id: "C3", modality: "GROUP" })));
      expect(r).toMatchObject({ errors: { modality: [expect.any(String)] } });
      expect(await db.client.count({ where: { document_id: "C3" } })).toBe(0);
    });

    it("C4 cambio autorizado con historial (actor y motivo) en la misma transacción", async () => {
      const id = await seedClient(T1, B1);
      BA1();
      const r = await changeClientModalityAction(undefined, fd({ client_id: id, to_modality: "GROUP", reason: "Contrató plan grupal" }));
      expect(r).toEqual({ success: expect.stringContaining("Grupal") });
      const c = await db.client.findUniqueOrThrow({ where: { id } });
      expect(c.modality).toBe("GROUP");
      expect(c.modality_changed_at).not.toBeNull();
      const hist = await db.clientModalityChange.findMany({ where: { client_id: id } });
      expect(hist).toEqual([
        expect.objectContaining({ tenant_id: T1, from_modality: "NORMAL", to_modality: "GROUP", reason: "Contrató plan grupal", changed_by_user_id: U.ba1 }),
      ]);
    });

    it("C5 cambio bloqueado por membresía vigente incompatible → sin cambios ni historial", async () => {
      const id = await seedClient(T1, B1);
      const plan = await db.membershipPlan.create({ data: { gym_id: T1, tenant_id: T1, name: `N-${id}`, duration_days: 30, price: 1 } });
      await db.clientMembership.create({
        data: {
          gym_id: T1, tenant_id: T1, branch_id: B1, client_id: id, membership_plan_id: plan.id,
          start_date: new Date(`${dayOffset(-1)}T00:00:00Z`), end_date: new Date(`${dayOffset(20)}T00:00:00Z`),
          price_at_sale: 1, final_amount: 1, payment_status: "paid",
        },
      });
      SA1();
      const r = await changeClientModalityAction(undefined, fd({ client_id: id, to_modality: "PERSONALIZED", reason: "Prueba" }));
      expect(r).toMatchObject({ error: expect.stringContaining("membresía") });
      expect((await db.client.findUniqueOrThrow({ where: { id } })).modality).toBe("NORMAL");
      expect(await db.clientModalityChange.count({ where: { client_id: id } })).toBe(0);
    });

    it("C6 historial append-only: UPDATE/DELETE rechazados por la base", async () => {
      const row = await db.clientModalityChange.findFirstOrThrow({ where: { tenant_id: T1 } });
      await expect(db.clientModalityChange.update({ where: { id: row.id }, data: { reason: "x" } })).rejects.toThrow(/GYM_APPEND_ONLY/);
      await expect(db.clientModalityChange.delete({ where: { id: row.id } })).rejects.toThrow(/GYM_APPEND_ONLY/);
    });

    it("C7 recepción y rol LIVE degradado no cambian modalidad", async () => {
      const id = await seedClient(T1, B1);
      RC1();
      expect(await changeClientModalityAction(undefined, fd({ client_id: id, to_modality: "GROUP", reason: "x y z" }))).toMatchObject({ error: expect.any(String) });
      as(U.sa1, "super_admin", T1, B1, "reception"); // JWT SA, rol LIVE recepción
      expect(await changeClientModalityAction(undefined, fd({ client_id: id, to_modality: "GROUP", reason: "x y z" }))).toMatchObject({ error: expect.any(String) });
      expect((await db.client.findUniqueOrThrow({ where: { id } })).modality).toBe("NORMAL");
    });

    it("C8 cross-tenant y cliente (rol client) → rechazo, cero escrituras", async () => {
      const id = await seedClient(T1, B1);
      SA2();
      expect(await changeClientModalityAction(undefined, fd({ client_id: id, to_modality: "GROUP", reason: "ajeno" }))).toEqual({ error: "Cliente no encontrado." });
      as(U.cl1, "client", T1, B1);
      expect(await run(() => changeClientModalityAction(undefined, fd({ client_id: id, to_modality: "GROUP", reason: "ajeno" })))).toEqual({ redirect: "/dashboard" });
      expect((await db.client.findUniqueOrThrow({ where: { id } })).modality).toBe("NORMAL");
    });

    it("C9 módulo gym.classes deshabilitado → cambio de modalidad denegado", async () => {
      const id = await seedClient(T1, B1);
      SA1();
      h.disabledModules = ["gym.classes"];
      try {
        expect(await changeClientModalityAction(undefined, fd({ client_id: id, to_modality: "GROUP", reason: "x y z" }))).toEqual({
          error: "Módulo no habilitado para esta organización.",
        });
      } finally {
        h.disabledModules = [];
      }
    });
  });

  // ══ Planes y membresías ════════════════════════════════════════
  describe("planes y membresías", () => {
    const planId = async (name: string) => (await db.membershipPlan.findFirstOrThrow({ where: { tenant_id: T1, name } })).id;
    const sale = (client_id: string, membership_plan_id: string, extra: Record<string, string> = {}) =>
      fd({ client_id, membership_plan_id, branch_id: B1, start_date: dayOffset(0), price_at_sale: "10", payment_status: "paid", ...extra });

    it("M1 planes NORMAL / PERSONALIZED / GROUP", async () => {
      SA1();
      const base = { duration_days: "30", price: "10", access_type: "full" };
      await run(() => createPlanAction(undefined, fd({ ...base, name: "3A Normal", sessions_limit: "12" })));
      await run(() => createPlanAction(undefined, fd({ ...base, name: "3A Pers", sessions_limit: "4", modality: "PERSONALIZED" })));
      await run(() => createPlanAction(undefined, fd({ ...base, name: "3A Group", sessions_limit: "8", modality: "GROUP" })));
      const plans = await db.membershipPlan.findMany({ where: { tenant_id: T1, name: { startsWith: "3A " } }, orderBy: { name: "asc" } });
      expect(plans.map((p) => [p.name, p.modality])).toEqual([
        ["3A Group", "GROUP"],
        ["3A Normal", "NORMAL"],
        ["3A Pers", "PERSONALIZED"],
      ]);
    });

    it("M2 venta PERSONALIZED: snapshot de modalidad y sesiones + entrenador autorizado", async () => {
      const client = await seedClient(T1, B1, "PERSONALIZED");
      RC1(); // recepción vende dentro de su sede
      const r = await run(() => createClientMembershipAction(undefined, sale(client, "", { assigned_trainer_id: TA })));
      expect(r).toMatchObject({ errors: { membership_plan_id: expect.any(Array) } }); // plan vacío → schema
      const r2 = await run(async () => createClientMembershipAction(undefined, sale(client, await planId("3A Pers"), { assigned_trainer_id: TA })));
      expect(r2).toEqual({ redirect: "/dashboard/memberships/client-memberships" });
      const m = await db.clientMembership.findFirstOrThrow({ where: { client_id: client } });
      expect(m).toMatchObject({ modality: "PERSONALIZED", sessions_total: 4, sessions_used: 0, assigned_trainer_id: TA, tenant_id: T1 });
    });

    it("M3 PERSONALIZED sin entrenador, entrenador de otro tenant u otra sede → rechazo", async () => {
      const client = await seedClient(T1, B1, "PERSONALIZED");
      SA1();
      const pers = await planId("3A Pers");
      expect(await run(() => createClientMembershipAction(undefined, sale(client, pers)))).toMatchObject({ errors: { assigned_trainer_id: expect.any(Array) } });
      expect(await run(() => createClientMembershipAction(undefined, sale(client, pers, { assigned_trainer_id: TZ2 })))).toEqual({
        errors: { assigned_trainer_id: ["Entrenador no encontrado."] },
      });
      expect(await run(() => createClientMembershipAction(undefined, sale(client, pers, { assigned_trainer_id: TB })))).toMatchObject({
        errors: { assigned_trainer_id: [expect.stringContaining("sucursal")] },
      });
      expect(await db.clientMembership.count({ where: { client_id: client } })).toBe(0);
    });

    it("M4 modalidad incompatible (cliente NORMAL, plan GROUP) → rechazo", async () => {
      const client = await seedClient(T1, B1, "NORMAL");
      SA1();
      expect(await run(async () => createClientMembershipAction(undefined, sale(client, await planId("3A Group"))))).toMatchObject({
        errors: { membership_plan_id: [expect.stringContaining("Grupal")] },
      });
      expect(await db.clientMembership.count({ where: { client_id: client } })).toBe(0);
    });

    it("M5 venta heredada NORMAL: snapshot NORMAL, sessions_total NULL, sin entrenador", async () => {
      const client = await seedClient(T1, B1, "NORMAL");
      SA1();
      await run(async () => createClientMembershipAction(undefined, sale(client, await planId("3A Normal"), { assigned_trainer_id: TA })));
      expect(await db.clientMembership.findFirstOrThrow({ where: { client_id: client } })).toMatchObject({
        modality: "NORMAL",
        sessions_total: null,
        assigned_trainer_id: null,
      });
    });

    it("M6 editar el plan no altera snapshots; un plan vendido no cambia de modalidad", async () => {
      SA1();
      const pers = await planId("3A Pers");
      const edit = (extra: Record<string, string>) =>
        fd({ id: pers, name: "3A Pers", duration_days: "30", price: "10", access_type: "full", sessions_limit: "10", ...extra });
      expect(await run(() => updatePlanAction(undefined, edit({ modality: "GROUP" })))).toMatchObject({ errors: { modality: expect.any(Array) } });
      await run(() => updatePlanAction(undefined, edit({ modality: "PERSONALIZED" })));
      expect((await db.membershipPlan.findUniqueOrThrow({ where: { id: pers } })).sessions_limit).toBe(10);
      const sold = await db.clientMembership.findMany({ where: { membership_plan_id: pers } });
      expect(sold.length).toBeGreaterThan(0);
      expect(sold.every((m) => m.sessions_total === 4 && m.modality === "PERSONALIZED")).toBe(true);
    });
  });

  // ══ Configuración GymSettings ══════════════════════════════════
  describe("configuración de reservas", () => {
    const policy = (extra: Record<string, string | null> = {}) =>
      fd({
        timezone: "America/El_Salvador",
        personalized_booking_enabled: "on",
        group_booking_enabled: "on",
        personalized_default_capacity: "1",
        booking_horizon_days: "30",
        booking_min_lead_minutes: "15",
        cancel_min_lead_minutes: "90",
        late_cancel_consumes_session: "on",
        attendance_edit_window_hours: "48",
        series_generation_weeks: "4",
        ...extra,
      });

    it("S1 guarda la política del gimnasio efectivo; el tenant vecino queda intacto", async () => {
      const before2 = await db.gymSettings.findUniqueOrThrow({ where: { gym_id: T2 } });
      SA1();
      expect(await run(() => updateGymBookingPolicyAction(undefined, policy()))).toEqual({ success: "Política de reservas guardada." });
      const s1 = await db.gymSettings.findUniqueOrThrow({ where: { gym_id: T1 } });
      expect(s1).toMatchObject({ booking_horizon_days: 30, booking_min_lead_minutes: 15, cancel_min_lead_minutes: 90, apply_policy_to_open: false });
      expect(await db.gymSettings.findUniqueOrThrow({ where: { gym_id: T2 } })).toEqual(before2);
    });

    it("S2 timezone inválida → rechazo sin escribir", async () => {
      const before = await db.gymSettings.findUniqueOrThrow({ where: { gym_id: T1 } });
      SA1();
      expect(await run(() => updateGymBookingPolicyAction(undefined, policy({ timezone: "Mars/Olympus" })))).toMatchObject({
        errors: { timezone: expect.any(Array) },
      });
      expect(await db.gymSettings.findUniqueOrThrow({ where: { gym_id: T1 } })).toEqual(before);
    });

    it("S3 BA (JWT) redirige; SA con rol LIVE degradado → sin permisos", async () => {
      BA1();
      expect(await run(() => updateGymBookingPolicyAction(undefined, policy()))).toEqual({ redirect: "/dashboard" });
      as(U.sa1, "super_admin", T1, null, "branch_admin");
      // LIVE-3: el rol de la sesión ya no es el vigente en la base → identidad cambiada (sigue denegado).
      expect(await run(() => updateGymBookingPolicyAction(undefined, policy()))).toEqual({ error: "Tu rol o tu sede cambiaron. Vuelve a iniciar sesión para continuar." });
    });

    it("S4 crear el gimnasio sin fila de settings: el upsert fija tenant_id y flags del formulario", async () => {
      await db.gymSettings.delete({ where: { gym_id: T2 } });
      SA2();
      await run(() =>
        updateGymBookingPolicyAction(
          undefined,
          fd({ timezone: "", personalized_default_capacity: "1", booking_horizon_days: "14", booking_min_lead_minutes: "0", cancel_min_lead_minutes: "120", attendance_edit_window_hours: "48", series_generation_weeks: "4" })
        )
      );
      expect(await db.gymSettings.findUniqueOrThrow({ where: { gym_id: T2 } })).toMatchObject({
        tenant_id: T2,
        timezone: null,
        personalized_booking_enabled: false,
        group_booking_enabled: false,
        apply_policy_to_open: false,
        late_cancel_consumes_session: false, // checkbox sin marcar
      });
    });
  });

  // ══ Sesiones y cupos ═══════════════════════════════════════════
  describe("sesiones", () => {
    const klass = (extra: Record<string, string | undefined>) =>
      fd({ branch_id: B1, class_type_id: CT1, trainer_id: TA, title: "S", start_time: "07:00", end_time: "08:00", ...extra });

    it("K1 OPEN con formulario heredado (sin session_kind) → OPEN, instantes NULL", async () => {
      SA1();
      expect(await run(() => createScheduledClassAction(undefined, klass({ class_date: dayOffset(30), capacity: "10", title: "K1" })))).toEqual({ redirect: "/dashboard/classes" });
      expect(await db.scheduledClass.findFirstOrThrow({ where: { title: "K1" } })).toMatchObject({ session_kind: "OPEN", starts_at: null, capacity: 10 });
    });

    it("K2 PERSONALIZED sin cupo → cupo del entrenador; instantes en la timezone del gimnasio", async () => {
      BA1();
      await run(() => createScheduledClassAction(undefined, klass({ class_date: dayOffset(31), session_kind: "PERSONALIZED", title: "K2" })));
      const s = await db.scheduledClass.findFirstOrThrow({ where: { title: "K2" } });
      expect(s).toMatchObject({ session_kind: "PERSONALIZED", capacity: 2, is_personalized: false });
      expect(s.starts_at?.toISOString()).toBe(`${dayOffset(31)}T13:00:00.000Z`);
    });

    it("K3 GROUP con cupo configurable", async () => {
      SA1();
      await run(() => createScheduledClassAction(undefined, klass({ class_date: dayOffset(32), session_kind: "GROUP", capacity: "6", title: "K3" })));
      expect(await db.scheduledClass.findFirstOrThrow({ where: { title: "K3" } })).toMatchObject({ session_kind: "GROUP", capacity: 6 });
    });

    it("K4 GROUP en un gimnasio con la modalidad apagada → rechazo (fallo cerrado)", async () => {
      SA2();
      const r = await run(() =>
        createScheduledClassAction(undefined, fd({ branch_id: B2, class_type_id: CT2, trainer_id: TZ2, title: "K4", class_date: dayOffset(32), start_time: "07:00", end_time: "08:00", session_kind: "GROUP" }))
      );
      expect(r).toMatchObject({ errors: { session_kind: expect.any(Array) } });
      expect(await db.scheduledClass.count({ where: { title: "K4" } })).toBe(0);
    });

    it("K5 solapamiento del entrenador y sucursal de otro tenant → rechazo", async () => {
      SA1();
      expect(await run(() => createScheduledClassAction(undefined, klass({ class_date: dayOffset(30), capacity: "5", start_time: "07:30", end_time: "08:30", title: "K5a" })))).toMatchObject({
        errors: { start_time: [expect.stringContaining("ya tiene una clase")] },
      });
      expect(await run(() => createScheduledClassAction(undefined, klass({ branch_id: B2, class_date: dayOffset(33), capacity: "5", title: "K5b" })))).toEqual({
        errors: { branch_id: ["Sucursal no encontrada."] },
      });
      expect(await db.scheduledClass.count({ where: { title: { in: ["K5a", "K5b"] } } })).toBe(0);
    });

    it("K6 PERSONALIZED con entrenador de otra sucursal → rechazo", async () => {
      SA1();
      expect(await run(() => createScheduledClassAction(undefined, klass({ class_date: dayOffset(34), trainer_id: TB, session_kind: "PERSONALIZED", title: "K6" })))).toMatchObject({
        errors: { trainer_id: [expect.stringContaining("sucursal")] },
      });
    });

    it("K7 no bajar la capacidad por debajo de booked_count; tipo de sesión inmutable con reservas", async () => {
      const s = await db.scheduledClass.findFirstOrThrow({ where: { title: "K1" } });
      const [c1, c2] = [await seedClient(T1, B1), await seedClient(T1, B1)];
      await db.classBooking.createMany({ data: [{ scheduled_class_id: s.id, client_id: c1 }, { scheduled_class_id: s.id, client_id: c2 }] });
      expect((await db.scheduledClass.findUniqueOrThrow({ where: { id: s.id } })).booked_count).toBe(2);
      SA1();
      const edit = (extra: Record<string, string>) => klass({ id: s.id, class_date: dayOffset(30), title: "K1", ...extra });
      expect(await run(() => updateScheduledClassAction(undefined, edit({ capacity: "1" })))).toEqual({
        errors: { capacity: ["La capacidad no puede ser menor que las reservas confirmadas (2)."] },
      });
      expect(await run(() => updateScheduledClassAction(undefined, edit({ capacity: "10", session_kind: "GROUP" })))).toMatchObject({
        errors: { session_kind: expect.any(Array) },
      });
      expect(await db.scheduledClass.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ capacity: 10, session_kind: "OPEN", booked_count: 2 });
    });
  });

  // ══ Ausencias ══════════════════════════════════════════════════
  describe("ausencias del entrenador", () => {
    const off = (extra: Record<string, string>) => fd({ trainer_id: TA, ...extra });

    it("T1 alta de día completo; location = sede del entrenador", async () => {
      BA1();
      expect(await createTrainerTimeOffAction(undefined, off({ starts_on: dayOffset(50), ends_on: dayOffset(51), reason: "Vacaciones" }))).toEqual({ success: "Ausencia registrada." });
      expect(await db.trainerTimeOff.findFirstOrThrow({ where: { trainer_id: TA, reason: "Vacaciones" } })).toMatchObject({ location_id: B1, tenant_id: T1, status: "active", start_time: null });
    });

    it("T2 solapamiento con otra ausencia y horas inválidas → rechazo", async () => {
      SA1();
      expect(await createTrainerTimeOffAction(undefined, off({ starts_on: dayOffset(51), ends_on: dayOffset(51), start_time: "09:00", end_time: "10:00" }))).toMatchObject({
        errors: { starts_on: expect.any(Array) },
      });
      expect(await createTrainerTimeOffAction(undefined, off({ starts_on: dayOffset(52), ends_on: dayOffset(52), start_time: "10:00" }))).toMatchObject({
        errors: { end_time: expect.any(Array) },
      });
      expect(await createTrainerTimeOffAction(undefined, off({ starts_on: dayOffset(52), ends_on: dayOffset(52), start_time: "25:00", end_time: "26:00" }))).toMatchObject({
        errors: expect.any(Object),
      });
    });

    it("T3 sesión programada afectada → rechazo con el conflicto listado (sin cancelar nada)", async () => {
      const k3 = await db.scheduledClass.findFirstOrThrow({ where: { title: "K3" } });
      SA1();
      const r = await createTrainerTimeOffAction(undefined, off({ starts_on: dayOffset(32), ends_on: dayOffset(32), start_time: "06:30", end_time: "07:30" }));
      expect(r).toMatchObject({ error: expect.stringContaining("1 sesión"), conflicts: [expect.stringContaining("K3")] });
      expect((await db.scheduledClass.findUniqueOrThrow({ where: { id: k3.id } })).status).toBe("scheduled");
      expect(await db.trainerTimeOff.count({ where: { trainer_id: TA, starts_on: new Date(`${dayOffset(32)}T00:00:00Z`) } })).toBe(0);
    });

    it("T4 la ausencia bloquea programar; desactivarla lo vuelve a permitir", async () => {
      SA1();
      const k = (title: string) => fd({ branch_id: B1, class_type_id: CT1, trainer_id: TA, title, class_date: dayOffset(50), start_time: "07:00", end_time: "08:00", capacity: "5" });
      expect(await run(() => createScheduledClassAction(undefined, k("T4a")))).toMatchObject({ errors: { start_time: [expect.stringContaining("ausencia")] } });
      const t = await db.trainerTimeOff.findFirstOrThrow({ where: { trainer_id: TA, reason: "Vacaciones" } });
      await deactivateTrainerTimeOffAction(fd({ id: t.id }));
      expect((await db.trainerTimeOff.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("inactive");
      expect(await run(() => createScheduledClassAction(undefined, k("T4b")))).toEqual({ redirect: "/dashboard/classes" });
    });

    it("T5 BA de otra sucursal y tenant ajeno → entrenador no encontrado, cero escrituras", async () => {
      const before = await db.trainerTimeOff.count();
      BA1B();
      expect(await createTrainerTimeOffAction(undefined, off({ starts_on: dayOffset(55), ends_on: dayOffset(55) }))).toEqual({ error: "Entrenador no encontrado." });
      SA2();
      expect(await createTrainerTimeOffAction(undefined, off({ starts_on: dayOffset(55), ends_on: dayOffset(55) }))).toEqual({ error: "Entrenador no encontrado." });
      expect(await db.trainerTimeOff.count()).toBe(before);
    });
  });

  // ══ Series recurrentes ═════════════════════════════════════════
  describe("series recurrentes", () => {
    let seriesId: string;
    const weekday = weekdayOf(dayOffset(2));

    it("R1 alta y primera generación (4 semanas, cupo del tipo/serie)", async () => {
      BA1();
      const r = await run(() =>
        createClassSeriesAction(
          undefined,
          fd({ location_id: B1B, class_type_id: CT1, trainer_id: TA, session_kind: "GROUP", title: "R-group", weekday, start_time: "18:00", end_time: "19:00", capacity: "8", valid_from: dayOffset(0) })
        )
      );
      // BA1: la sede del formulario se ignora y se usa la suya (B1).
      expect(r).toMatchObject({ redirect: expect.stringMatching(/^\/dashboard\/classes\/series\//) });
      const series = await db.classSeries.findFirstOrThrow({ where: { title: "R-group" } });
      expect(series.location_id).toBe(B1);
      seriesId = series.id;
      const g = await generateClassSeriesSessionsAction(undefined, fd({ id: seriesId }));
      expect(g?.report?.created).toHaveLength(4);
      const sessions = await db.scheduledClass.findMany({ where: { series_id: seriesId } });
      expect(sessions).toHaveLength(4);
      expect(sessions.every((s) => s.session_kind === "GROUP" && s.capacity === 8 && s.branch_id === B1 && s.starts_at !== null)).toBe(true);
    });

    it("R2 repetir es idempotente: cero duplicados y reservas existentes intactas", async () => {
      const first = await db.scheduledClass.findFirstOrThrow({ where: { series_id: seriesId }, orderBy: { class_date: "asc" } });
      const client = await seedClient(T1, B1, "GROUP");
      await db.classBooking.create({ data: { scheduled_class_id: first.id, client_id: client } });
      BA1();
      const g = await generateClassSeriesSessionsAction(undefined, fd({ id: seriesId }));
      expect(g?.report).toMatchObject({ created: [], conflicts: [] });
      expect(g?.report?.skippedExisting).toHaveLength(4);
      expect(await db.scheduledClass.count({ where: { series_id: seriesId } })).toBe(4);
      expect(await db.scheduledClass.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ booked_count: 1, updated_at: first.updated_at });
    });

    it("R3 ausencia y solapamiento en fechas de la serie → se omiten y se informan", async () => {
      SA1();
      const wd = weekdayOf(dayOffset(3));
      await run(() =>
        createClassSeriesAction(undefined, fd({ location_id: B1, class_type_id: CT1, trainer_id: TA, session_kind: "OPEN", title: "R-open", weekday: wd, start_time: "12:00", end_time: "13:00", capacity: "10", valid_from: dayOffset(0) }))
      );
      const s = await db.classSeries.findFirstOrThrow({ where: { title: "R-open" } });
      await createTrainerTimeOffAction(undefined, fd({ trainer_id: TA, starts_on: dayOffset(3), ends_on: dayOffset(3), reason: "R3" }));
      await run(() =>
        createScheduledClassAction(undefined, fd({ branch_id: B1, class_type_id: CT1, trainer_id: TA, title: "R3-manual", class_date: dayOffset(10), start_time: "12:30", end_time: "13:30", capacity: "5" }))
      );
      const g = await generateClassSeriesSessionsAction(undefined, fd({ id: s.id }));
      expect(g?.report?.conflicts).toEqual([
        { date: dayOffset(3), reason: "TRAINER_TIME_OFF" },
        { date: dayOffset(10), reason: "TRAINER_OVERLAP" },
      ]);
      expect(g?.report?.created).toHaveLength(2);
      expect((await db.scheduledClass.findMany({ where: { series_id: s.id } })).every((x) => x.session_kind === "OPEN" && x.starts_at === null)).toBe(true);
    });

    it("R4 DST (America/New_York): misma hora local, instantes con el offset de cada fecha", async () => {
      const s = await db.classSeries.create({
        data: { tenant_id: T3, location_id: B3, class_type_id: CT3, trainer_id: TNY, session_kind: "GROUP", title: "R-dst", weekday: 0, start_time: "09:00", end_time: "10:00", valid_from: new Date("2026-02-01T00:00:00Z") },
      });
      const r = await generateSeriesSessions(db, { tenantId: T3, gymId: T3, seriesId: s.id, actorUserId: U.sa1, now: new Date("2026-02-28T15:00:00Z") });
      expect(r.ok && r.report.created).toEqual(["2026-03-01", "2026-03-08", "2026-03-15", "2026-03-22"]);
      const rows = await db.scheduledClass.findMany({ where: { series_id: s.id }, orderBy: { class_date: "asc" } });
      expect(rows.map((x) => x.starts_at?.toISOString())).toEqual([
        "2026-03-01T14:00:00.000Z", // EST
        "2026-03-08T13:00:00.000Z", // EDT
        "2026-03-15T13:00:00.000Z",
        "2026-03-22T13:00:00.000Z",
      ]);
      expect(rows.every((x) => x.capacity === 10)).toBe(true); // cupo del tipo de clase
    });

    it("R5 serie ajena (otro tenant / otra sucursal) → no encontrada, cero sesiones", async () => {
      const before = await db.scheduledClass.count({ where: { series_id: seriesId } });
      SA2();
      expect(await generateClassSeriesSessionsAction(undefined, fd({ id: seriesId }))).toEqual({ error: "Serie no encontrada." });
      BA1B();
      expect(await generateClassSeriesSessionsAction(undefined, fd({ id: seriesId }))).toEqual({ error: "Serie no encontrada." });
      expect(await db.scheduledClass.count({ where: { series_id: seriesId } })).toBe(before);
    });

    it("R6 entrenador y recepción (JWT) no administran series", async () => {
      as(U.tr1, "trainer", T1, B1);
      expect(await run(() => generateClassSeriesSessionsAction(undefined, fd({ id: seriesId })))).toEqual({ redirect: "/dashboard" });
      RC1();
      expect(await run(() => generateClassSeriesSessionsAction(undefined, fd({ id: seriesId })))).toEqual({ redirect: "/dashboard" });
    });
  });

  // ══ Catálogo de actividades ════════════════════════════════════
  describe("catálogo de actividades", () => {
    const act = (extra: Record<string, string>) => fd({ name: "Sentadilla", sort_order: "1", ...extra });

    it("A1 SA crea global; BA crea siempre en su sede aunque pida global", async () => {
      SA1();
      await run(() => createGymActivityAction(undefined, act({ name: "Global A1", code: "GA1" })));
      BA1();
      await run(() => createGymActivityAction(undefined, act({ name: "Sede A1" })));
      expect((await db.gymActivity.findFirstOrThrow({ where: { name: "Global A1" } })).location_id).toBeNull();
      expect((await db.gymActivity.findFirstOrThrow({ where: { name: "Sede A1" } })).location_id).toBe(B1);
      expect(await run(() => createGymActivityAction(undefined, act({ name: "Otra", location_id: B1B })))).toEqual({
        error: "Solo puedes crear actividades para tu propia sucursal.",
      });
    });

    it("A2 unicidad de nombre y código por tenant (otro tenant puede repetirlos)", async () => {
      SA1();
      expect(await run(() => createGymActivityAction(undefined, act({ name: "Global A1" })))).toEqual({ errors: { name: ["Ya existe una actividad con este nombre."] } });
      expect(await run(() => createGymActivityAction(undefined, act({ name: "Nueva", code: "GA1" })))).toEqual({ errors: { code: ["Ya existe una actividad con este código."] } });
      SA2();
      expect(await run(() => createGymActivityAction(undefined, act({ name: "Global A1", code: "GA1" })))).toEqual({ redirect: "/dashboard/classes/activities" });
    });

    it("A3 BA no edita globales; tenant ajeno no modifica (cero escrituras)", async () => {
      const g = await db.gymActivity.findFirstOrThrow({ where: { tenant_id: T1, name: "Global A1" } });
      BA1();
      expect(await run(() => updateGymActivityAction(undefined, act({ id: g.id, name: "Hack" })))).toEqual({ error: "Actividad no encontrada." });
      SA2();
      await toggleGymActivityStatusAction(fd({ id: g.id }));
      expect(await db.gymActivity.findUniqueOrThrow({ where: { id: g.id } })).toMatchObject({ name: "Global A1", status: "active" });
    });

    it("A4 una actividad usada en otra sede no puede pasar a esa sede (referencias históricas)", async () => {
      const a = await db.gymActivity.findFirstOrThrow({ where: { tenant_id: T1, name: "Global A1" } });
      const k1 = await db.scheduledClass.findFirstOrThrow({ where: { title: "K1" } }); // sede B1
      await db.scheduledClassActivity.create({ data: { tenant_id: T1, scheduled_class_id: k1.id, activity_id: a.id, activity_name: a.name } });
      SA1();
      expect(await run(() => updateGymActivityAction(undefined, act({ id: a.id, name: "Global A1", location_id: B1B })))).toMatchObject({
        error: expect.stringContaining("otra sucursal"),
      });
      expect((await db.gymActivity.findUniqueOrThrow({ where: { id: a.id } })).location_id).toBeNull();
    });

    it("A5 módulo gym.classes deshabilitado y rol LIVE degradado → denegado", async () => {
      SA1();
      h.disabledModules = ["gym.classes"];
      try {
        expect(await run(() => createGymActivityAction(undefined, act({ name: "Bloqueada" })))).toEqual({ error: "Módulo no habilitado para esta organización." });
      } finally {
        h.disabledModules = [];
      }
      as(U.sa1, "super_admin", T1, B1, "reception");
      // LIVE-3: identidad cambiada (rol LIVE ≠ rol vigente en la base) → denegado antes de la capacidad.
      expect(await run(() => createGymActivityAction(undefined, act({ name: "Bloqueada" })))).toEqual({ error: "Tu rol o tu sede cambiaron. Vuelve a iniciar sesión para continuar." });
      expect(await db.gymActivity.count({ where: { name: "Bloqueada" } })).toBe(0);
    });
  });

  it("Z invariantes de contadores intactos tras toda la suite", async () => {
    const drift = await db.$queryRawUnsafe<{ n: number }[]>(`
      SELECT COUNT(*)::int AS n FROM scheduled_classes s
      WHERE s.booked_count <> (SELECT COUNT(*) FROM class_bookings b WHERE b.scheduled_class_id = s.id AND b.booking_status = 'confirmed')`);
    expect(drift[0].n).toBe(0);
    const used = await db.$queryRawUnsafe<{ n: number }[]>(`
      SELECT COUNT(*)::int AS n FROM client_memberships m
      WHERE m.sessions_used <> (SELECT COUNT(*) FROM class_bookings b WHERE b.client_membership_id = m.id AND b.consumption = 'CONSUMED')`);
    expect(used[0].n).toBe(0);
  });
});
