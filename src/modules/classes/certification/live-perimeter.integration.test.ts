// ─────────────────────────────────────────────────────────────────
// GYM LIVE-3 — perímetro administrativo y operativo GYM con identidad
// vigente. Extiende LIVE-2 (live-identity.integration.test.ts) a las
// escrituras de clientes, membresías, política, entrenadores,
// disponibilidad, ausencias, usuarios, series, actividades, sesiones,
// reservas/asistencia de staff, operación del entrenador, planes 5A y
// portal del alumno.
//
// Contexto operacional REAL (requireOperationalContext,
// resolveEffectiveTenantContext, requireRuntimeOrganizationContext) en
// PLATFORM_NATIVE y RUNTIME_CLIENT. La identidad cambia en PostgreSQL con
// el JWT antiguo vigente. Solo se sustituye infraestructura (cookie de
// Auth.js, Prisma de la instancia / Control Plane, router runtime, cookie
// de Support Session, entitlement LEGACY_UNMANAGED, puerta de licencia).
//
// Cada operación prepara datos propios y se mide con una huella md5 de
// todas las tablas GYM e identidad: el control legítimo DEBE escribir y
// cada escenario revocado NO debe escribir nada.
//
// PostgreSQL REAL desechable. Se omite sin GYM_BOOKING_IT_*.
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "../booking/testing/pg-it-harness";
import { dayOffset } from "../booking/testing/booking-fixtures";
import { localDate } from "../booking/booking-eligibility";
import { weekdayOf } from "../scheduling/scheduling-rules";

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`REDIRECT ${url}`);
  }
}

const h = vi.hoisted(() => ({
  jwt: null as null | Record<string, unknown>,
  native: null as unknown,
  runtime: null as unknown,
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
vi.mock("@/lib/auth/auth", () => ({ auth: vi.fn(async () => (h.jwt ? { user: h.jwt } : null)) }));
vi.mock("@/modules/platform/runtime/runtime-organization-access-gate", () => ({
  enforceRuntimeOrganizationAccess: vi.fn(async () => {}),
}));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return h.native;
  },
}));
vi.mock("@/modules/platform/runtime/control-plane-prisma", () => ({
  get controlPlanePrisma() {
    return h.native;
  },
}));
vi.mock("@/modules/platform/runtime/runtime-session", async (orig) => ({
  ...(await orig<typeof import("@/modules/platform/runtime/runtime-session")>()),
  getRuntimeSession: vi.fn(async () => null),
  clearRuntimeSession: vi.fn(async () => {}),
}));
vi.mock("@/modules/platform/runtime/runtime-database-router", async (orig) => ({
  ...(await orig<typeof import("@/modules/platform/runtime/runtime-database-router")>()),
  resolveRuntimeDatabaseProfileForOrganization: vi.fn(async () => ({})),
  createRuntimePrismaClient: vi.fn(() => ({ client: h.runtime, disconnect: async () => {} })),
}));
vi.mock("@/modules/platform/runtime/commercial-enforcement", async (orig) => ({
  ...(await orig<typeof import("@/modules/platform/runtime/commercial-enforcement")>()),
  resolveCommercialEnforcementContext: vi.fn(async () => ({ mode: "LEGACY_UNMANAGED", organizationId: null, effectiveModules: new Map() })),
}));

import {
  cancelBookingAction as staffCancelBookingAction,
  createBookingAction,
  createClassTypeAction,
  createScheduledClassAction,
  deleteScheduledClassAction,
  recordAttendanceAction,
  toggleClassTypeStatusAction,
  toggleScheduledClassStatusAction,
  updateClassTypeAction,
  updateScheduledClassAction,
} from "../actions";
import { createClassSeriesAction, generateClassSeriesSessionsAction, toggleClassSeriesStatusAction, updateClassSeriesAction } from "../series-actions";
import { createGymActivityAction, toggleGymActivityStatusAction, updateGymActivityAction } from "../activities-actions";
import { addSessionActivityAction, saveTrainingNotesAction, trainerRecordAttendanceAction } from "../trainer-actions";
import { changeClientModalityAction, createClientAction, enableClientPortalAction, toggleClientStatusAction, updateClientAction } from "@/modules/clients/actions";
import {
  createClientMembershipAction,
  createPlanAction,
  toggleClientMembershipStatusAction,
  togglePlanStatusAction,
  updateClientMembershipAction,
  updatePlanAction,
} from "@/modules/memberships/actions";
import { updateGymBookingPolicyAction } from "@/modules/settings/actions";
import { addAvailabilitySlotAction, createTrainerAction, removeAvailabilitySlotAction, toggleTrainerStatusAction, updateTrainerAction } from "@/modules/trainers/actions";
import { createTrainerTimeOffAction, deactivateTrainerTimeOffAction, updateTrainerTimeOffAction } from "@/modules/trainers/time-off-actions";
import { createUserAction } from "@/modules/users/actions";
import {
  assignTemplateSegmentedAction,
  createClientPlanAction,
  createTemplateAction,
  recordPlanExecutionAction,
  toggleClientPlanStatusAction,
} from "@/modules/weekly-plans/actions";
import { bookClassAction, submitPlanDayAction } from "@/modules/client-portal/actions";

type Mode = "PLATFORM_NATIVE" | "RUNTIME_CLIENT";
type Actor = "sa" | "ba" | "rc" | "tr" | "cl";
type Role = "super_admin" | "branch_admin" | "reception" | "trainer" | "client";
const ACTOR_ROLE: Record<Actor, Role> = { sa: "super_admin", ba: "branch_admin", rc: "reception", tr: "trainer", cl: "client" };
/** Rol al que se degrada cada actor en el escenario A/B. */
const DEGRADED: Record<Actor, Role> = { sa: "reception", ba: "reception", rc: "trainer", tr: "reception", cl: "reception" };
const BRANCH_SCOPED: ReadonlySet<Actor> = new Set(["ba", "rc"]);

const TZ = "America/El_Salvador";
const ORG = randomUUID();
const PASSWORD = "Live3-Synthetic-2026";
const TENANT: Record<Mode, string> = { PLATFORM_NATIVE: "live3-native", RUNTIME_CLIENT: "live3-runtime" };
const OTHER: Record<Mode, string> = { PLATFORM_NATIVE: "live3-native-other", RUNTIME_CLIENT: "live3-runtime-other" };
const keys = new Map<string, string>();
const k = (name: string) => {
  if (!keys.has(name)) keys.set(name, randomUUID());
  return keys.get(name)!;
};

function fd(entries: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData();
  for (const [key, v] of Object.entries(entries)) if (v !== undefined && v !== null) f.set(key, String(v));
  return f;
}

async function run(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RedirectSignal) return { redirect: err.url };
    throw err;
  }
}

/** Huella de todas las tablas que alguna operación auditada puede escribir. */
const FINGERPRINT_TABLES = [
  "users", "clients", "client_modality_changes", "class_types", "membership_plans", "client_memberships", "gym_settings", "trainers",
  "trainer_availability", "trainer_time_off", "class_series", "scheduled_classes", "gym_activities",
  "scheduled_class_activities", "class_bookings", "class_booking_events", "gym_booking_operations", "class_attendance",
  "weekly_plan_templates", "client_weekly_plans", "client_weekly_plan_days", "client_plan_day_executions",
];

interface Op {
  name: string;
  actor: Actor;
  /**
   * Rol vigente al que se degrada en el escenario A/B. Por defecto DEGRADED[actor]; se
   * sobrescribe cuando el rol por defecto TIENE legítimamente la capacidad (p. ej.
   * recepción crea y alterna planes 5A de su sede): el escenario debe quitar el permiso.
   */
  degradeTo?: Role;
  /** Prepara datos propios (fixtures) y devuelve la invocación de la acción real. */
  prepare: (mode: Mode, n: number) => Promise<() => Promise<unknown>>;
}

describe.skipIf(!IT_ENABLED)("GYM LIVE-3 · perímetro GYM con identidad vigente (contexto real)", () => {
  let nativeIt: ItDatabase;
  let runtimeIt: ItDatabase;
  const dbOf = (mode: Mode) => (mode === "PLATFORM_NATIVE" ? nativeIt.db : runtimeIt.db) as PrismaClient;
  const id = (mode: Mode, name: string) => k(`${mode}:${name}`);
  const results: Record<string, Record<string, boolean>> = {};
  const legitDetails: Record<string, unknown> = {};
  let seq = 0;

  async function fingerprint(db: PrismaClient): Promise<string> {
    const parts = FINGERPRINT_TABLES.map((t) => `(SELECT COALESCE(md5(string_agg(x::text, '|' ORDER BY x::text)), '') FROM "${t}" x)`);
    const [row] = await db.$queryRawUnsafe<{ fp: string }[]>(`SELECT md5(${parts.join(" || ")}) AS fp`);
    return row.fp;
  }

  // ── Fixtures por modo ─────────────────────────────────────────
  async function seed(mode: Mode) {
    const db = dbOf(mode);
    const t = TENANT[mode];
    const o = OTHER[mode];
    await db.runtimeTenant.createMany({ data: [{ id: t, name: t, slug: t }, { id: o, name: o, slug: o }] });
    await db.gym.createMany({ data: [{ id: t, tenant_id: t, name: t, slug: t }, { id: o, tenant_id: o, name: o, slug: o }] });
    await db.branch.createMany({
      data: [
        { id: id(mode, "A"), gym_id: t, tenant_id: t, name: "Sede A" },
        { id: id(mode, "B"), gym_id: t, tenant_id: t, name: "Sede B" },
        { id: id(mode, "O"), gym_id: o, tenant_id: o, name: "Sede otro tenant" },
      ],
    });
    const user = (actor: Actor, branch: string | null) => ({
      id: id(mode, `user-${actor}`),
      tenant_id: t,
      gym_id: t,
      branch_id: branch,
      email: `${actor}-${mode}@live3.invalid`,
      password_hash: "x",
      first_name: "Live3",
      last_name: actor,
      role: ACTOR_ROLE[actor],
    });
    await db.user.createMany({
      data: [user("sa", null), user("ba", id(mode, "A")), user("rc", id(mode, "A")), user("tr", id(mode, "A")), user("cl", id(mode, "A"))],
    });
    await db.trainer.createMany({
      data: [
        { id: id(mode, "TA"), gym_id: t, tenant_id: t, branch_id: id(mode, "A"), user_id: id(mode, "user-tr"), first_name: "Ana", last_name: "Entrenadora" },
        { id: id(mode, "TS"), gym_id: t, tenant_id: t, branch_id: id(mode, "A"), first_name: "Sol", last_name: "Auxiliar" },
      ],
    });
    await db.trainerAvailability.createMany({
      data: [id(mode, "TA"), id(mode, "TS")].flatMap((trainer) =>
        [0, 1, 2, 3, 4, 5, 6].map((d) => ({ gym_id: t, tenant_id: t, branch_id: id(mode, "A"), trainer_id: trainer, day_of_week: d, start_time: "00:00", end_time: "23:59" }))
      ),
    });
    await db.classType.create({ data: { id: id(mode, "CT"), gym_id: t, tenant_id: t, name: "Funcional", capacity_default: 10 } });
    await db.gymSettings.create({ data: { gym_id: t, tenant_id: t, timezone: TZ, personalized_booking_enabled: true, group_booking_enabled: true } });
    await db.membershipPlan.createMany({
      data: [
        { id: id(mode, "plan-normal"), gym_id: t, tenant_id: t, name: "Normal", duration_days: 30, price: 25 },
        { id: id(mode, "plan-group"), gym_id: t, tenant_id: t, name: "Grupal", duration_days: 30, price: 40, modality: "GROUP", sessions_limit: 50 },
      ],
    });
    await db.gymActivity.create({ data: { id: id(mode, "activity"), tenant_id: t, name: "Sentadilla", code: "SQ" } });
    await db.weeklyPlanTemplate.create({
      data: { id: id(mode, "template"), gym_id: t, tenant_id: t, name: "Plantilla", days: { create: [{ weekday: weekdayOf(dayOffset(-1)), session_name: "Fuerza" }] } },
    });
    // Alumno del portal (actor "cl") con membresía NORMAL vigente.
    await db.client.create({
      data: { id: id(mode, "client-cl"), gym_id: t, tenant_id: t, branch_id: id(mode, "A"), first_name: "Portal", last_name: "Alumno", user_id: id(mode, "user-cl") },
    });
    await newMembership(mode, id(mode, "client-cl"), "NORMAL");
  }

  async function newClient(mode: Mode, modality: "NORMAL" | "PERSONALIZED" | "GROUP" = "NORMAL") {
    const cid = randomUUID();
    await dbOf(mode).client.create({
      data: { id: cid, gym_id: TENANT[mode], tenant_id: TENANT[mode], branch_id: id(mode, "A"), first_name: "C", last_name: cid.slice(0, 8), modality },
    });
    return cid;
  }

  async function newMembership(mode: Mode, clientId: string, modality: "NORMAL" | "GROUP") {
    const mid = randomUUID();
    await dbOf(mode).clientMembership.create({
      data: {
        id: mid,
        gym_id: TENANT[mode],
        tenant_id: TENANT[mode],
        branch_id: id(mode, "A"),
        client_id: clientId,
        membership_plan_id: id(mode, modality === "GROUP" ? "plan-group" : "plan-normal"),
        start_date: new Date(`${dayOffset(-10)}T00:00:00Z`),
        end_date: new Date(`${dayOffset(40)}T00:00:00Z`),
        price_at_sale: 25,
        final_amount: 25,
        payment_status: "paid",
        status: "active",
        modality,
        sessions_total: modality === "GROUP" ? 50 : null,
      },
    });
    return mid;
  }

  /** Fecha/hora únicas por intento (evita solapes del entrenador entre intentos). */
  const slotOf = (n: number) => ({ date: dayOffset(1 + (Math.floor(n / 16) % 12)), start: `${String(6 + (n % 16)).padStart(2, "0")}:00`, end: `${String(6 + (n % 16)).padStart(2, "0")}:45` });

  async function newSession(mode: Mode, n: number, opts: { started?: boolean; trainer?: string } = {}) {
    const sid = randomUUID();
    const now = new Date();
    const slot = slotOf(n);
    const date = opts.started ? localDate(now, TZ) : slot.date;
    await dbOf(mode).scheduledClass.create({
      data: {
        id: sid,
        gym_id: TENANT[mode],
        tenant_id: TENANT[mode],
        branch_id: id(mode, "A"),
        class_type_id: id(mode, "CT"),
        trainer_id: opts.trainer ?? id(mode, "TS"),
        title: `S-${n}`,
        class_date: new Date(`${date}T00:00:00Z`),
        start_time: opts.started ? "00:00" : slot.start,
        end_time: opts.started ? "23:59" : slot.end,
        capacity: 10,
        ...(opts.started ? { starts_at: new Date(now.getTime() - 30 * 60_000), ends_at: new Date(now.getTime() + 30 * 60_000) } : {}),
      },
    });
    return sid;
  }

  async function newBooking(mode: Mode, sessionId: string, clientId: string) {
    const bid = randomUUID();
    await dbOf(mode).classBooking.create({ data: { id: bid, scheduled_class_id: sessionId, client_id: clientId } });
    return bid;
  }

  async function newPlan(mode: Mode, clientId: string, trainer: string | null) {
    const pid = randomUUID();
    const dayId = randomUUID();
    await dbOf(mode).clientWeeklyPlan.create({
      data: {
        id: pid,
        gym_id: TENANT[mode],
        tenant_id: TENANT[mode],
        branch_id: id(mode, "A"),
        client_id: clientId,
        trainer_id: trainer,
        start_date: new Date(`${dayOffset(-7)}T00:00:00Z`),
        end_date: new Date(`${dayOffset(20)}T00:00:00Z`),
        days: { create: [{ id: dayId, weekday: weekdayOf(dayOffset(-1)), session_name: "Fuerza" }] },
      },
    });
    return { pid, dayId };
  }

  const policyForm = (n: number) =>
    fd({ timezone: TZ, personalized_booking_enabled: "on", group_booking_enabled: "on", personalized_default_capacity: "1", booking_horizon_days: String(14 + (n % 7)), booking_min_lead_minutes: "0", cancel_min_lead_minutes: "120", late_cancel_consumes_session: "on", attendance_edit_window_hours: "48", series_generation_weeks: "4" });

  // ── Operaciones auditadas ─────────────────────────────────────
  const OPS: Op[] = [
    // Clientes
    { name: "client.create NORMAL", actor: "rc", prepare: async (m, n) => () => run(() => createClientAction(undefined, fd({ first_name: "N", last_name: `n${n}`, branch_id: id(m, "A"), document_id: `DOC-${m}-${n}` }))) },
    { name: "client.create GROUP", actor: "ba", prepare: async (m, n) => () => run(() => createClientAction(undefined, fd({ first_name: "G", last_name: `g${n}`, branch_id: id(m, "A"), document_id: `DOCG-${m}-${n}`, modality: "GROUP" }))) },
    { name: "client.update", actor: "rc", prepare: async (m, n) => { const c = await newClient(m); return () => run(() => updateClientAction(undefined, fd({ id: c, first_name: "Editado", last_name: `e${n}`, branch_id: id(m, "A") }))); } },
    { name: "client.toggleStatus", actor: "rc", prepare: async (m) => { const c = await newClient(m); return () => run(() => toggleClientStatusAction(fd({ id: c }))); } },
    { name: "client.changeModality", actor: "ba", prepare: async (m) => { const c = await newClient(m); return () => run(() => changeClientModalityAction(undefined, fd({ client_id: c, to_modality: "GROUP", reason: "Cambio certificado LIVE-3" }))); } },
    { name: "client.enablePortal", actor: "rc", prepare: async (m, n) => { const c = await newClient(m); return () => run(() => enableClientPortalAction(undefined, fd({ client_id: c, portal_email: `portal-${m}-${n}@live3.invalid`, portal_password: PASSWORD }))); } },
    // Planes y membresías
    { name: "plan.create", actor: "ba", prepare: async (m, n) => () => run(() => createPlanAction(undefined, fd({ name: `Plan ${n}`, duration_days: "30", price: "10", access_type: "full", sessions_limit: "8", modality: "GROUP" }))) },
    {
      name: "plan.update",
      actor: "ba",
      prepare: async (m, n) => {
        const p = randomUUID();
        await dbOf(m).membershipPlan.create({ data: { id: p, gym_id: TENANT[m], tenant_id: TENANT[m], branch_id: id(m, "A"), name: `P${n}`, duration_days: 30, price: 10 } });
        return () => run(() => updatePlanAction(undefined, fd({ id: p, name: `P${n} editado`, duration_days: "30", price: "12", access_type: "full" })));
      },
    },
    {
      name: "plan.toggle",
      actor: "ba",
      prepare: async (m, n) => {
        const p = randomUUID();
        await dbOf(m).membershipPlan.create({ data: { id: p, gym_id: TENANT[m], tenant_id: TENANT[m], branch_id: id(m, "A"), name: `T${n}`, duration_days: 30, price: 10 } });
        return () => run(() => togglePlanStatusAction(fd({ id: p })));
      },
    },
    { name: "membership.sell", actor: "rc", prepare: async (m) => { const c = await newClient(m); return () => run(() => createClientMembershipAction(undefined, fd({ client_id: c, membership_plan_id: id(m, "plan-normal"), branch_id: id(m, "A"), start_date: dayOffset(0), price_at_sale: "25", payment_status: "paid" }))); } },
    {
      name: "membership.update",
      actor: "rc",
      prepare: async (m) => {
        const c = await newClient(m);
        const mem = await newMembership(m, c, "NORMAL");
        return () => run(() => updateClientMembershipAction(undefined, fd({ id: mem, client_id: c, membership_plan_id: id(m, "plan-normal"), branch_id: id(m, "A"), start_date: dayOffset(-10), price_at_sale: "25", payment_status: "paid", status: "active", notes: "editada" })));
      },
    },
    { name: "membership.toggle", actor: "rc", prepare: async (m) => { const c = await newClient(m); const mem = await newMembership(m, c, "NORMAL"); return () => run(() => toggleClientMembershipStatusAction(fd({ id: mem }))); } },
    // Política
    { name: "policy.update", actor: "sa", prepare: async (_m, n) => () => run(() => updateGymBookingPolicyAction(undefined, policyForm(n))) },
    // Entrenadores, disponibilidad, ausencias, usuarios
    { name: "trainer.update", actor: "ba", prepare: async (m, n) => () => run(() => updateTrainerAction(undefined, fd({ id: id(m, "TS"), first_name: "Sol", last_name: `Auxiliar ${n}`, branch_id: id(m, "A") }))) },
    { name: "trainer.create", actor: "ba", prepare: async (m, n) => () => run(() => createTrainerAction(undefined, fd({ first_name: "Nuevo", last_name: `Perfil ${n}`, branch_id: id(m, "A") }))) },
    { name: "trainer.toggle", actor: "ba", prepare: async (m) => { const t = randomUUID(); await dbOf(m).trainer.create({ data: { id: t, gym_id: TENANT[m], tenant_id: TENANT[m], branch_id: id(m, "A"), first_name: "X", last_name: "Y" } }); return () => run(() => toggleTrainerStatusAction(fd({ id: t }))); } },
    { name: "availability.add", actor: "ba", prepare: async (m) => { const t = randomUUID(); await dbOf(m).trainer.create({ data: { id: t, gym_id: TENANT[m], tenant_id: TENANT[m], branch_id: id(m, "A"), first_name: "X", last_name: "Y" } }); return () => run(() => addAvailabilitySlotAction(undefined, fd({ trainer_id: t, day_of_week: "1", start_time: "08:00", end_time: "12:00" }))); } },
    {
      name: "availability.remove",
      actor: "ba",
      prepare: async (m) => {
        const t = randomUUID();
        const slot = randomUUID();
        await dbOf(m).trainer.create({ data: { id: t, gym_id: TENANT[m], tenant_id: TENANT[m], branch_id: id(m, "A"), first_name: "X", last_name: "Y" } });
        await dbOf(m).trainerAvailability.create({ data: { id: slot, gym_id: TENANT[m], tenant_id: TENANT[m], branch_id: id(m, "A"), trainer_id: t, day_of_week: 2, start_time: "08:00", end_time: "12:00" } });
        return () => run(() => removeAvailabilitySlotAction(undefined, fd({ slot_id: slot, trainer_id: t })));
      },
    },
    { name: "timeoff.create", actor: "ba", prepare: async (m, n) => () => run(() => createTrainerTimeOffAction(undefined, fd({ trainer_id: id(m, "TS"), starts_on: dayOffset(200 + n), ends_on: dayOffset(200 + n), reason: "Ausencia LIVE-3" }))) },
    {
      name: "timeoff.update",
      actor: "ba",
      prepare: async (m, n) => {
        const off = randomUUID();
        await dbOf(m).trainerTimeOff.create({ data: { id: off, tenant_id: TENANT[m], location_id: id(m, "A"), trainer_id: id(m, "TS"), starts_on: new Date(`${dayOffset(400 + n)}T00:00:00Z`), ends_on: new Date(`${dayOffset(400 + n)}T00:00:00Z`), reason: "Original" } });
        return () => run(() => updateTrainerTimeOffAction(undefined, fd({ id: off, trainer_id: id(m, "TS"), starts_on: dayOffset(400 + n), ends_on: dayOffset(400 + n), reason: "Editada" })));
      },
    },
    {
      name: "timeoff.deactivate",
      actor: "ba",
      prepare: async (m, n) => {
        const off = randomUUID();
        await dbOf(m).trainerTimeOff.create({ data: { id: off, tenant_id: TENANT[m], location_id: id(m, "A"), trainer_id: id(m, "TS"), starts_on: new Date(`${dayOffset(600 + n)}T00:00:00Z`), ends_on: new Date(`${dayOffset(600 + n)}T00:00:00Z`), reason: "Original" } });
        return () => run(() => deactivateTrainerTimeOffAction(fd({ id: off })));
      },
    },
    { name: "user.create trainer", actor: "ba", prepare: async (m, n) => () => run(() => createUserAction(undefined, fd({ email: `new-trainer-${m}-${n}@live3.invalid`, first_name: "Nuevo", last_name: `Entrenador ${n}`, role: "trainer", branch_id: id(m, "A"), password: PASSWORD }))) },
    // Series
    { name: "series.create", actor: "ba", prepare: async (m, n) => () => run(() => createClassSeriesAction(undefined, fd({ location_id: id(m, "A"), class_type_id: id(m, "CT"), trainer_id: id(m, "TS"), session_kind: "GROUP", title: `Serie ${n}`, weekday: String(n % 7), start_time: "05:00", end_time: "05:30", capacity: "5", valid_from: dayOffset(300 + n) }))) },
    {
      name: "series.update/toggle/generate",
      actor: "ba",
      prepare: async (m, n) => {
        const s = randomUUID();
        await dbOf(m).classSeries.create({ data: { id: s, tenant_id: TENANT[m], location_id: id(m, "A"), class_type_id: id(m, "CT"), trainer_id: id(m, "TA"), session_kind: "GROUP", title: `Base ${n}`, weekday: n % 7, start_time: "04:00", end_time: "04:30", capacity: 5, valid_from: new Date(`${dayOffset(0)}T00:00:00Z`) } });
        return async () => {
          const out = [
            await run(() => updateClassSeriesAction(undefined, fd({ id: s, title: `Base ${n} editada`, capacity: "6" }))),
            await run(() => generateClassSeriesSessionsAction(undefined, fd({ id: s }))),
            await run(() => toggleClassSeriesStatusAction(undefined, fd({ id: s }))),
          ];
          return out;
        };
      },
    },
    // Tipos de clase
    { name: "classType.create", actor: "ba", prepare: async (_m, n) => () => run(() => createClassTypeAction(undefined, fd({ name: `Tipo ${n}` }))) },
    {
      name: "classType.update/toggle",
      actor: "ba",
      prepare: async (m, n) => {
        const ct = randomUUID();
        await dbOf(m).classType.create({ data: { id: ct, gym_id: TENANT[m], tenant_id: TENANT[m], name: `Tipo base ${n}` } });
        return async () => [await run(() => updateClassTypeAction(undefined, fd({ id: ct, name: `Tipo ${n} editado` }))), await run(() => toggleClassTypeStatusAction(fd({ id: ct })))];
      },
    },
    // Actividades
    { name: "activity.create", actor: "ba", prepare: async (m, n) => () => run(() => createGymActivityAction(undefined, fd({ name: `Actividad ${n}`, sort_order: "1" }))) },
    {
      name: "activity.update/toggle",
      actor: "ba",
      prepare: async (m, n) => {
        const a = randomUUID();
        await dbOf(m).gymActivity.create({ data: { id: a, tenant_id: TENANT[m], location_id: id(m, "A"), name: `Act ${n}` } });
        return async () => [await run(() => updateGymActivityAction(undefined, fd({ id: a, name: `Act ${n} editada`, sort_order: "2", location_id: id(m, "A") }))), await run(() => toggleGymActivityStatusAction(fd({ id: a })))];
      },
    },
    // Sesiones (LIVE-2, sin regresión)
    {
      name: "session.create/update/toggle/delete",
      actor: "ba",
      prepare: async (m, n) => {
        const target = await newSession(m, 200 + n);
        const slot = slotOf(200 + n);
        const form = (extra: Record<string, string>) => fd({ branch_id: id(m, "A"), class_type_id: id(m, "CT"), trainer_id: id(m, "TS"), capacity: "10", ...extra });
        return async () => [
          await run(() => createScheduledClassAction(undefined, form({ title: `Nueva ${n}`, class_date: dayOffset(100 + n), start_time: "07:00", end_time: "08:00" }))),
          await run(() => updateScheduledClassAction(undefined, form({ id: target, title: `Editada ${n}`, class_date: slot.date, start_time: slot.start, end_time: slot.end }))),
          await run(() => toggleScheduledClassStatusAction(fd({ id: target }))),
        ];
      },
    },
    { name: "session.delete", actor: "ba", prepare: async (m, n) => { const target = await newSession(m, 400 + n); return () => run(() => deleteScheduledClassAction(fd({ id: target }))); } },
    // Reservas y asistencia del staff (recepción)
    {
      name: "booking.staff create",
      actor: "rc",
      prepare: async (m, n) => {
        const c = await newClient(m);
        await newMembership(m, c, "NORMAL");
        const s = await newSession(m, 600 + n);
        return () => run(() => createBookingAction(undefined, fd({ scheduled_class_id: s, client_id: c, idempotency_key: randomUUID() })));
      },
    },
    {
      name: "booking.staff cancel",
      actor: "rc",
      prepare: async (m, n) => {
        const c = await newClient(m);
        const s = await newSession(m, 800 + n);
        const b = await newBooking(m, s, c);
        return () => run(() => staffCancelBookingAction(fd({ booking_id: b, scheduled_class_id: s, idempotency_key: randomUUID() })));
      },
    },
    {
      name: "attendance.staff",
      actor: "rc",
      prepare: async (m, n) => {
        const c = await newClient(m);
        const s = await newSession(m, 1000 + n);
        await newBooking(m, s, c);
        return () => run(() => recordAttendanceAction(fd({ scheduled_class_id: s, client_id: c, attendance_status: "attended", idempotency_key: randomUUID() })));
      },
    },
    // Operación del entrenador (canal TRAINER)
    {
      name: "trainer.attendance+notes+activity",
      actor: "tr",
      prepare: async (m) => {
        const c = await newClient(m);
        const s = await newSession(m, 0, { started: true, trainer: id(m, "TA") });
        const b = await newBooking(m, s, c);
        return async () => [
          await run(() => trainerRecordAttendanceAction(fd({ scheduled_class_id: s, booking_id: b, attendance_status: "attended", idempotency_key: randomUUID() }))),
          await run(() => saveTrainingNotesAction(fd({ scheduled_class_id: s, booking_id: b, training_notes: "Nota LIVE-3", idempotency_key: randomUUID() }))),
          await run(() => addSessionActivityAction(fd({ scheduled_class_id: s, activity_id: id(m, "activity") }))),
        ];
      },
    },
    // Planes semanales 5A
    { name: "plan5a.create (trainer)", actor: "tr", degradeTo: "client", prepare: async (m) => { const c = await newClient(m); return () => run(() => createClientPlanAction(undefined, fd({ client_id: c, branch_id: id(m, "A"), template_id: id(m, "template"), start_date: dayOffset(0), end_date: dayOffset(20) }))); } },
    {
      name: "plan5a.recordExecution (trainer)",
      actor: "tr",
      prepare: async (m) => {
        const c = await newClient(m);
        const { pid, dayId } = await newPlan(m, c, id(m, "TA"));
        return () => run(() => recordPlanExecutionAction(undefined, fd({ plan_id: pid, day_id: dayId, local_date: dayOffset(-1), execution_status: "completed" })));
      },
    },
    { name: "plan5a.toggle (admin)", actor: "ba", degradeTo: "client", prepare: async (m) => { const c = await newClient(m); const { pid } = await newPlan(m, c, id(m, "TA")); return () => run(() => toggleClientPlanStatusAction(fd({ id: pid }))); } },
    { name: "template.create", actor: "ba", prepare: async (_m, n) => () => run(() => createTemplateAction(undefined, fd({ name: `Plantilla ${n}` }))) },
    {
      name: "template.assignSegmented",
      actor: "sa",
      prepare: async (m, n) => {
        const c = await newClient(m);
        await newMembership(m, c, "NORMAL");
        return () => run(() => assignTemplateSegmentedAction(undefined, fd({ template_id: id(m, "template"), branch_id: id(m, "A"), start_date: dayOffset(1000 + n * 40), end_date: dayOffset(1020 + n * 40) })));
      },
    },
    // Portal del alumno
    { name: "portal.book", actor: "cl", prepare: async (m, n) => { const s = await newSession(m, 1200 + n); return () => run(() => bookClassAction(undefined, fd({ class_id: s, idempotency_key: randomUUID() }))); } },
    {
      name: "portal.submitPlanDay",
      actor: "cl",
      prepare: async (m) => {
        const { dayId } = await newPlan(m, id(m, "client-cl"), id(m, "TA"));
        return () => run(() => submitPlanDayAction(undefined, fd({ plan_day_id: dayId, local_date: dayOffset(-1), execution_status: "partial" })));
      },
    },
  ];

  // ── Identidad ────────────────────────────────────────────────
  function login(mode: Mode, actor: Actor) {
    h.jwt = {
      id: id(mode, `user-${actor}`),
      role: ACTOR_ROLE[actor],
      tenant_id: TENANT[mode],
      location_id: actor === "sa" || actor === "cl" ? null : id(mode, "A"),
      auth_scope: mode === "RUNTIME_CLIENT" ? "RUNTIME_CLIENT" : "PLATFORM",
      organization_id: mode === "RUNTIME_CLIENT" ? ORG : undefined,
    };
  }

  async function restore(mode: Mode) {
    const db = dbOf(mode);
    for (const actor of Object.keys(ACTOR_ROLE) as Actor[]) {
      await db.user.update({
        where: { id: id(mode, `user-${actor}`) },
        data: { role: ACTOR_ROLE[actor], status: "active", tenant_id: TENANT[mode], gym_id: TENANT[mode], branch_id: actor === "sa" ? null : id(mode, "A") },
      });
    }
    await db.branch.update({ where: { id: id(mode, "A") }, data: { status: "active" } });
  }

  type Scenario = { name: string; legit: boolean; applies: (a: Actor) => boolean; apply: (mode: Mode, a: Actor, op: Op) => Promise<void> };
  const userWhere = (mode: Mode, a: Actor) => ({ where: { id: id(mode, `user-${a}`) } });
  const SCENARIOS: Scenario[] = [
    { name: "G legítimo", legit: true, applies: () => true, apply: async () => {} },
    { name: "A/B rol degradado", legit: false, applies: () => true, apply: async (m, a, op) => void (await dbOf(m).user.update({ ...userWhere(m, a), data: { role: op.degradeTo ?? DEGRADED[a] } })) },
    { name: "C sede reasignada", legit: false, applies: (a) => BRANCH_SCOPED.has(a), apply: async (m, a) => void (await dbOf(m).user.update({ ...userWhere(m, a), data: { branch_id: id(m, "B") } })) },
    { name: "D usuario inactivo", legit: false, applies: () => true, apply: async (m, a) => void (await dbOf(m).user.update({ ...userWhere(m, a), data: { status: "inactive" } })) },
    { name: "E otro tenant", legit: false, applies: () => true, apply: async (m, a) => void (await dbOf(m).user.update({ ...userWhere(m, a), data: { tenant_id: OTHER[m], gym_id: OTHER[m], branch_id: id(m, "O") } })) },
    { name: "F sede inactiva", legit: false, applies: (a) => BRANCH_SCOPED.has(a), apply: async (m) => void (await dbOf(m).branch.update({ where: { id: id(m, "A") }, data: { status: "inactive" } })) },
  ];

  beforeAll(async () => {
    nativeIt = await createItDatabase();
    runtimeIt = await createItDatabase();
    h.native = nativeIt.db;
    h.runtime = runtimeIt.db;
    await seed("PLATFORM_NATIVE");
    await seed("RUNTIME_CLIENT");
    await nativeIt.db.platformOrganization.create({
      data: { id: ORG, code: "live3-org", name: "Live3 Org", tenant_id: TENANT.RUNTIME_CLIENT, status: "ACTIVE", license_status: "ACTIVE" },
    });
  }, 240_000);

  afterAll(async () => {
    console.info("LIVE3_MATRIX " + JSON.stringify(results));
    console.info("LIVE3_LEGIT_FAILURES " + JSON.stringify(legitDetails));
    await nativeIt?.drop();
    await runtimeIt?.drop();
    await disconnectAdmin();
  }, 240_000);

  for (const mode of ["PLATFORM_NATIVE", "RUNTIME_CLIENT"] as const) {
    describe(mode, () => {
      for (const op of OPS) {
        it(`${op.name} [${op.actor}]: escribe con identidad vigente y no escribe tras cada revocación`, async () => {
          const row: Record<string, boolean> = {};
          for (const sc of SCENARIOS.filter((s) => s.applies(op.actor))) {
            await restore(mode);
            const call = await op.prepare(mode, seq++);
            await sc.apply(mode, op.actor, op);
            login(mode, op.actor);
            const before = await fingerprint(dbOf(mode));
            const result = await call();
            const wrote = (await fingerprint(dbOf(mode))) !== before;
            row[sc.name] = wrote;
            if (sc.legit && !wrote) legitDetails[`${mode}:${op.name}`] = result;
          }
          await restore(mode);
          results[`${mode}:${op.name}`] = row;
          const expected = Object.fromEntries(Object.keys(row).map((s) => [s, SCENARIOS.find((x) => x.name === s)!.legit]));
          expect(row).toEqual(expected);
        });
      }
    });
  }
});
