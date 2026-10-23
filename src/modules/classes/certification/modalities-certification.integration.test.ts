// ─────────────────────────────────────────────────────────────────
// GYM — Certificación operativa PERSONALIZED / GROUP (cert/gym-personalized-group)
//
// Recorrido cronológico de punta a punta contra PostgreSQL REAL desechable
// (mismo arnés que 2B–5C: 127.0.0.1, puerto ≠ 5432, data_directory
// verificado; sin .env ni DATABASE_URL). Se omite sin GYM_BOOKING_IT_*.
//
// Ejecuta las Server Actions REALES (administración 3A, portal 3B, entrenador
// GYM-4, planes 5A) con los guards REALES y las lecturas REALES de 5A/5B/5C.
// Solo se simulan: la sesión de Auth.js (auth()), la puerta de licencia
// runtime, el contexto operacional (PrismaClient real, tenant, rol LIVE y
// Support Session por usuario), el entitlement comercial por módulo y
// next/cache / next/navigation. El reloj de la aplicación se controla con
// vi.useFakeTimers({ toFake: ["Date"] }) para pasar de la reserva al inicio
// de la sesión y a los días siguientes; PostgreSQL conserva su reloj real.
//
// Los datos de plataforma (tenants, sedes, usuarios staff, perfiles de
// entrenador, disponibilidad y una plantilla semanal) son fixtures. Todo lo
// demás (clientes, portal, planes, ventas, política, sesiones, series,
// actividades, reservas, asistencia, notas y planes semanales) se crea con
// las acciones reales. Cada rechazo verifica cero escrituras parciales.
// ─────────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "../booking/testing/pg-it-harness";
import { invariantViolations, NO_VIOLATIONS } from "../booking/testing/booking-fixtures";
import { localDate, zonedInstant } from "../booking/booking-eligibility";
import { weekdayOf } from "../scheduling/scheduling-rules";

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`REDIRECT ${url}`);
  }
}

type Role = "super_admin" | "branch_admin" | "reception" | "trainer" | "client";
type Ctx = { tenantId: string; role: Role; locationId: string | null; db: unknown; readOnly?: boolean };

const h = vi.hoisted(() => ({
  /** Sesión JWT que devolverá el próximo auth() (se lee de forma síncrona al invocar). */
  session: null as null | Record<string, unknown>,
  /** userId → JWT (rol/sede del token). */
  jwt: new Map<string, { role: string; tenantId: string; locationId: string | null }>(),
  /** userId → contexto operacional LIVE (rol vigente, base runtime, Support Session). */
  live: new Map<string, { tenantId: string; role: string; locationId: string | null; db: unknown; readOnly?: boolean }>(),
  disabledModules: [] as string[],
  /** Opciones con las que cada acción pidió el contexto (auditoría de write: true). */
  calls: [] as { userId: string; module?: string; write?: boolean }[],
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
vi.mock("@/modules/platform/runtime/commercial-enforcement", () => ({
  resolveCommercialEnforcementContext: vi.fn(async () => ({})),
  hasOrganizationModule: vi.fn((_ctx: unknown, code: string) => !h.disabledModules.includes(code)),
}));
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
    requireOperationalContext: vi.fn(async (sessionUser: { id: string }, options: { module?: string; write?: boolean } = {}) => {
      h.calls.push({ userId: sessionUser.id, module: options.module, write: options.write });
      if (options.module && h.disabledModules.includes(options.module)) {
        throw new OperationalContextError("MODULE_DISABLED", "Este módulo no está habilitado para tu organización.", 403);
      }
      const c = h.live.get(sessionUser.id);
      if (!c) throw new OperationalContextError("RUNTIME_UNAVAILABLE", "No se pudo acceder al entorno de la organización.", 503);
      // Support Session: el contrato de plataforma rechaza toda escritura (certificado en VI-D2).
      if (c.readOnly && options.write) {
        throw new OperationalContextError("READ_ONLY", "La sesión de soporte es de solo lectura.", 403);
      }
      return {
        context: {
          runtimeMode: "RUNTIME_CLIENT",
          authScope: "RUNTIME_CLIENT",
          effectiveUser: { id: sessionUser.id, tenant_id: c.tenantId, location_id: c.locationId, role: c.role, auth_scope: "RUNTIME_CLIENT" },
          effectiveRole: c.role,
          organizationId: null,
          tenantId: c.tenantId,
          gymId: c.tenantId,
          locationId: c.locationId,
          client: c.db,
          readOnly: Boolean(c.readOnly),
          // Forma real que lee hasOrganizationModule (module-guard) en las acciones de planes.
          commercialContext: {
            mode: "MANAGED",
            effectiveModules: new Map(
              ["gym.classes", "gym.weekly_plans", "gym.memberships", "gym.trainers"]
                .filter((m) => !h.disabledModules.includes(m))
                .map((m) => [m, { enabled: true }])
            ),
          },
        },
        dispose: async () => {},
      };
    }),
  };
});

import { createClientAction, enableClientPortalAction } from "@/modules/clients/actions";
import { createClientMembershipAction, createPlanAction } from "@/modules/memberships/actions";
import { updateGymBookingPolicyAction } from "@/modules/settings/actions";
import {
  cancelBookingAction as staffCancelBookingAction,
  createScheduledClassAction,
  deleteScheduledClassAction,
  toggleScheduledClassStatusAction,
  updateScheduledClassAction,
} from "../actions";
import { createClassSeriesAction, generateClassSeriesSessionsAction } from "../series-actions";
import { createGymActivityAction } from "../activities-actions";
import {
  addAttendanceActivityAction,
  addSessionActivityAction,
  saveTrainingNotesAction,
  trainerRecordAttendanceAction,
} from "../trainer-actions";
import { bookClassAction, cancelBookingAction, submitPlanDayAction } from "@/modules/client-portal/actions";
import { getMyAttendance, loadPortalBookings, loadPortalMembershipSummary, loadPortalSchedule } from "@/modules/client-portal/queries";
import { loadPortalProgress } from "@/modules/client-portal/progress-queries";
import { getSessionTrainingDetail, getTrainerAgenda } from "../trainer/trainer-queries";
import { assignTemplateSegmentedAction, createClientPlanAction, recordPlanExecutionAction } from "@/modules/weekly-plans/actions";
import { loadPlanTracking } from "@/modules/weekly-plans/training-tracking-queries";
import { loadTrainerFollowUp, resolveTrainerFollowUpAccess } from "@/modules/weekly-plans/trainer-follow-up-queries";

// ── Identidades sintéticas (UUID: los schemas Zod exigen .uuid()) ──
const TZ = "America/El_Salvador"; // UTC−6, sin DST
const T1 = "cert-tenant-gym"; // gimnasio certificado
const T2 = "cert-tenant-neighbour"; // vecino en la MISMA base física (Shared)
const TD = "cert-tenant-dedicated"; // gimnasio en una base física separada (Dedicated)
const B1 = randomUUID(); // sede autorizada
const B1B = randomUUID(); // otra sede del mismo gimnasio
const B2 = randomUUID();
const BD = randomUUID();
const U = {
  sa: randomUUID(),
  ba: randomUUID(),
  rc: randomUUID(),
  trA: randomUUID(), // entrenador PERSONALIZED
  trC: randomUUID(), // entrenador GROUP
  trB: randomUUID(), // entrenador de otra sede
  sa2: randomUUID(),
  support: randomUUID(), // operador de plataforma en Support Session
};
const TA = randomUUID();
const TC = randomUUID();
const TB = randomUUID();
const TZ2 = randomUUID();
const TDD = randomUUID();
const CT1 = randomUUID();
const CT2 = randomUUID();
const CTD = randomUUID();
const TEMPLATE = randomUUID();
const TEMPLATE_DAY_1 = randomUUID();
const TEMPLATE_DAY_2 = randomUUID();

const HOUR = 3_600_000;
const MIN = 60_000;
/** Reloj inicial: el instante real al cargar la prueba (CURRENT_DATE de PostgreSQL coincide). */
const T0 = new Date();
const D = (offset: number) => localDate(new Date(T0.getTime() + offset * 24 * HOUR), TZ);
const D0 = D(0);
const S = D(2); // día de las sesiones certificadas
const S_PLUS_1 = D(3);
const at = (date: string, hhmm: string): Date => {
  const instant = zonedInstant(date, hhmm, TZ);
  if (!instant) throw new Error(`instante inválido ${date} ${hhmm}`);
  return instant;
};

function fd(entries: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) if (v !== undefined && v !== null) f.set(k, String(v));
  return f;
}

/** Fija el JWT del usuario como sesión activa (auth() la lee de forma síncrona al invocar la acción). */
function as(userId: string) {
  const j = h.jwt.get(userId);
  if (!j) throw new Error(`usuario sin JWT: ${userId}`);
  h.session = { id: userId, role: j.role, tenant_id: j.tenantId, location_id: j.locationId, auth_scope: "RUNTIME_CLIENT" };
}

/** Ejecuta una acción como `userId` y normaliza el redirect de Next. */
async function act<T>(userId: string, fn: () => Promise<T>): Promise<T | { redirect: string }> {
  as(userId);
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RedirectSignal) return { redirect: err.url };
    throw err;
  }
}

function registerUser(userId: string, jwt: { role: Role; tenantId: string; locationId: string | null }, live: Ctx) {
  h.jwt.set(userId, jwt);
  h.live.set(userId, live);
}

/** Huella de todas las tablas que una operación GYM podría escribir. */
async function footprint(db: PrismaClient) {
  const [row] = await db.$queryRawUnsafe<Record<string, number>[]>(`SELECT
    (SELECT COUNT(*)::int FROM clients) AS clients,
    (SELECT COUNT(*)::int FROM users) AS users,
    (SELECT COUNT(*)::int FROM client_memberships) AS memberships,
    (SELECT COALESCE(SUM(sessions_used),0)::int FROM client_memberships) AS sessions_used,
    (SELECT COUNT(*)::int FROM scheduled_classes) AS sessions,
    (SELECT COALESCE(SUM(booked_count),0)::int FROM scheduled_classes) AS booked,
    (SELECT COUNT(*)::int FROM class_bookings) AS bookings,
    (SELECT COUNT(*)::int FROM class_bookings WHERE booking_status = 'confirmed') AS confirmed,
    (SELECT COUNT(*)::int FROM class_bookings WHERE consumption = 'CONSUMED') AS consumed,
    (SELECT COUNT(*)::int FROM gym_booking_operations) AS operations,
    (SELECT COUNT(*)::int FROM class_booking_events) AS events,
    (SELECT COUNT(*)::int FROM class_attendance) AS attendance,
    (SELECT COUNT(*)::int FROM class_attendance WHERE training_notes IS NOT NULL) AS notes,
    (SELECT COUNT(*)::int FROM scheduled_class_activities) AS common_activities,
    (SELECT COUNT(*)::int FROM class_attendance_activities) AS individual_activities,
    (SELECT COUNT(*)::int FROM client_weekly_plans) AS plans,
    (SELECT COUNT(*)::int FROM client_plan_day_executions) AS executions,
    (SELECT COUNT(*)::int FROM class_series) AS series,
    (SELECT md5(string_agg(gym_id || ':' || personalized_booking_enabled || group_booking_enabled || coalesce(timezone,''), ',' ORDER BY gym_id)) FROM gym_settings) AS settings`);
  return row;
}

/** Ejecuta un intento que debe ser rechazado y exige cero escrituras en cualquier tabla GYM. */
async function rejectedWithoutWrites<T>(db: PrismaClient, attempt: () => Promise<T>): Promise<T> {
  const before = await footprint(db);
  const result = await attempt();
  expect(await footprint(db)).toEqual(before);
  return result;
}

const isError = (r: unknown) =>
  typeof r === "object" && r !== null && ("error" in r || "errors" in r || ("redirect" in r && String((r as { redirect: string }).redirect).includes("error=")));

/** Evidencia legible para el reporte (código/mensaje de cada rechazo). */
const evidence: Record<string, unknown> = {};

describe.skipIf(!IT_ENABLED)("GYM · certificación operativa PERSONALIZED / GROUP (PostgreSQL real)", () => {
  let shared: ItDatabase;
  let dedicated: ItDatabase;
  let db: PrismaClient;
  let dbB: PrismaClient; // segunda conexión independiente (carreras reales)

  const ids = {} as Record<string, string>;
  const planId = async (name: string) => (await db.membershipPlan.findFirstOrThrow({ where: { tenant_id: T1, name } })).id;
  const sessionId = async (title: string) => (await db.scheduledClass.findFirstOrThrow({ where: { tenant_id: T1, title } })).id;
  const clientOf = async (doc: string) => db.client.findFirstOrThrow({ where: { tenant_id: T1, document_id: doc } });
  const portalRef = async (doc: string) => {
    const c = await clientOf(doc);
    return { id: c.id, branch_id: c.branch_id, modality: c.modality, status: c.status };
  };
  const bookingOf = (session: string, client: string) =>
    db.classBooking.findUniqueOrThrow({ where: { scheduled_class_id_client_id: { scheduled_class_id: session, client_id: client } } });
  const book = (userId: string, session: string, key = randomUUID()) =>
    act(userId, () => bookClassAction(undefined, fd({ class_id: session, idempotency_key: key })));
  const cancel = (userId: string, booking: string) =>
    act(userId, () => cancelBookingAction(undefined, fd({ booking_id: booking, idempotency_key: randomUUID() })));
  const userOf = async (doc: string) => (await clientOf(doc)).user_id!;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: T0 });
    shared = await createItDatabase();
    dedicated = await createItDatabase();
    db = shared.db;
    dbB = shared.extraClient();

    await db.runtimeTenant.createMany({
      data: [
        { id: T1, name: "Gimnasio Certificación", slug: "cert-gym" },
        { id: T2, name: "Gimnasio Vecino", slug: "cert-neighbour" },
      ],
    });
    await db.gym.createMany({
      data: [
        { id: T1, tenant_id: T1, name: "Gimnasio Certificación", slug: "cert-gym" },
        { id: T2, tenant_id: T2, name: "Gimnasio Vecino", slug: "cert-neighbour" },
      ],
    });
    await db.branch.createMany({
      data: [
        { id: B1, gym_id: T1, tenant_id: T1, name: "Sede Central" },
        { id: B1B, gym_id: T1, tenant_id: T1, name: "Sede Norte" },
        { id: B2, gym_id: T2, tenant_id: T2, name: "Sede Vecina" },
      ],
    });
    const staff = (id: string, tenant: string, role: Role, branch: string | null) => ({
      id,
      tenant_id: tenant,
      gym_id: tenant,
      branch_id: branch,
      email: `${id}@cert.invalid`,
      password_hash: "x",
      first_name: "Cert",
      last_name: role,
      role,
    });
    await db.user.createMany({
      data: [
        staff(U.sa, T1, "super_admin", null),
        staff(U.ba, T1, "branch_admin", B1),
        staff(U.rc, T1, "reception", B1),
        staff(U.trA, T1, "trainer", B1),
        staff(U.trC, T1, "trainer", B1),
        staff(U.trB, T1, "trainer", B1B),
        staff(U.sa2, T2, "super_admin", null),
      ],
    });
    await db.trainer.createMany({
      data: [
        // personalized_capacity 1 = valor PREDETERMINADO (DEFAULT_ONLY), no un máximo.
        { id: TA, gym_id: T1, tenant_id: T1, branch_id: B1, user_id: U.trA, first_name: "Ana", last_name: "Personal", personalized_capacity: 1 },
        { id: TC, gym_id: T1, tenant_id: T1, branch_id: B1, user_id: U.trC, first_name: "Carlos", last_name: "Grupal" },
        { id: TB, gym_id: T1, tenant_id: T1, branch_id: B1B, user_id: U.trB, first_name: "Berta", last_name: "Norte" },
        { id: TZ2, gym_id: T2, tenant_id: T2, branch_id: B2, first_name: "Zoe", last_name: "Vecina" },
      ],
    });
    const allWeek = (trainer: string, tenant: string, branch: string) =>
      [0, 1, 2, 3, 4, 5, 6].map((d) => ({ gym_id: tenant, tenant_id: tenant, branch_id: branch, trainer_id: trainer, day_of_week: d, start_time: "05:00", end_time: "23:00" }));
    await db.trainerAvailability.createMany({
      data: [...allWeek(TA, T1, B1), ...allWeek(TC, T1, B1), ...allWeek(TB, T1, B1B), ...allWeek(TZ2, T2, B2)],
    });
    await db.classType.createMany({
      data: [
        { id: CT1, gym_id: T1, tenant_id: T1, name: "Funcional", capacity_default: 10 },
        { id: CT2, gym_id: T2, tenant_id: T2, name: "Funcional Vecino", capacity_default: 10 },
      ],
    });
    // Vecino Shared con GROUP operativo (para el intento de reserva entre tenants).
    await db.gymSettings.create({ data: { gym_id: T2, tenant_id: T2, timezone: TZ, group_booking_enabled: true } });
    // Plantilla semanal (fixture): dos días, el de mañana (D+1) y el de las sesiones (S).
    await db.weeklyPlanTemplate.create({
      data: {
        id: TEMPLATE,
        gym_id: T1,
        tenant_id: T1,
        name: "Plantilla Fuerza",
        days: {
          create: [
            { id: TEMPLATE_DAY_1, weekday: weekdayOf(D(1)), session_name: "Movilidad" },
            { id: TEMPLATE_DAY_2, weekday: weekdayOf(S), session_name: "Fuerza" },
          ],
        },
      },
    });

    // ── Identidad JWT + LIVE por usuario ──
    const liveT1 = (role: Role, locationId: string | null): Ctx => ({ tenantId: T1, role, locationId, db });
    registerUser(U.sa, { role: "super_admin", tenantId: T1, locationId: null }, liveT1("super_admin", null));
    registerUser(U.ba, { role: "branch_admin", tenantId: T1, locationId: B1 }, liveT1("branch_admin", B1));
    registerUser(U.rc, { role: "reception", tenantId: T1, locationId: B1 }, liveT1("reception", B1));
    registerUser(U.trA, { role: "trainer", tenantId: T1, locationId: B1 }, liveT1("trainer", B1));
    registerUser(U.trC, { role: "trainer", tenantId: T1, locationId: B1 }, liveT1("trainer", B1));
    registerUser(U.trB, { role: "trainer", tenantId: T1, locationId: B1B }, liveT1("trainer", B1B));
    registerUser(U.sa2, { role: "super_admin", tenantId: T2, locationId: null }, { tenantId: T2, role: "super_admin", locationId: null, db });
    registerUser(U.support, { role: "super_admin", tenantId: T1, locationId: null }, { ...liveT1("super_admin", null), readOnly: true });

    // ── Base Dedicated: otro gimnasio en una base física separada ──
    const dd = dedicated.db;
    await dd.runtimeTenant.create({ data: { id: TD, name: "Gimnasio Dedicado", slug: "cert-dedicated" } });
    await dd.gym.create({ data: { id: TD, tenant_id: TD, name: "Gimnasio Dedicado", slug: "cert-dedicated" } });
    await dd.branch.create({ data: { id: BD, gym_id: TD, tenant_id: TD, name: "Sede Dedicada" } });
    await dd.trainer.create({ data: { id: TDD, gym_id: TD, tenant_id: TD, branch_id: BD, first_name: "Dani", last_name: "Dedicado" } });
    await dd.classType.create({ data: { id: CTD, gym_id: TD, tenant_id: TD, name: "Grupal Dedicado" } });
    await dd.gymSettings.create({ data: { gym_id: TD, tenant_id: TD, timezone: TZ, group_booking_enabled: true } });
  }, 240_000);

  // Cada prueba que mueve el reloj lo devuelve a T0, aunque falle a mitad.
  afterEach(() => {
    vi.setSystemTime(T0);
    h.disabledModules = [];
  });

  afterAll(async () => {
    vi.useRealTimers();
    // Evidencia para el documento de certificación (mensajes de rechazo y contadores).
    console.info("CERT_EVIDENCE " + JSON.stringify(evidence));
    await shared?.drop();
    await dedicated?.drop();
    await disconnectAdmin();
  }, 240_000);

  // ════════════════════════════════════════════════════════════════
  // F0 — Configuración: modalidades apagadas por defecto, activación por SA
  // ════════════════════════════════════════════════════════════════
  describe("F0 configuración del gimnasio", () => {
    it("F0.1 sin política: una sesión GROUP se rechaza (fallo cerrado R18) sin escrituras", async () => {
      const r = await rejectedWithoutWrites(db, () =>
        act(U.sa, () =>
          createScheduledClassAction(undefined, fd({ branch_id: B1, class_type_id: CT1, trainer_id: TC, title: "F0-group", class_date: S, start_time: "07:00", end_time: "08:00", session_kind: "GROUP", capacity: "3" }))
        )
      );
      expect(r).toMatchObject({ errors: { session_kind: expect.any(Array) } });
      evidence.F0_1 = r;
    });

    it("F0.2 BA no puede editar la política; SA activa PERSONALIZED + GROUP con zona IANA", async () => {
      const policy = fd({
        timezone: TZ,
        personalized_booking_enabled: "on",
        group_booking_enabled: "on",
        personalized_default_capacity: "1",
        booking_horizon_days: "14",
        booking_min_lead_minutes: "0",
        cancel_min_lead_minutes: "120",
        late_cancel_consumes_session: "on",
        attendance_edit_window_hours: "48",
        series_generation_weeks: "4",
      });
      expect(await rejectedWithoutWrites(db, () => act(U.ba, () => updateGymBookingPolicyAction(undefined, policy)))).toEqual({ redirect: "/dashboard" });
      expect(await act(U.sa, () => updateGymBookingPolicyAction(undefined, policy))).toEqual({ success: "Política de reservas guardada." });
      expect(await db.gymSettings.findUniqueOrThrow({ where: { gym_id: T1 } })).toMatchObject({
        tenant_id: T1,
        timezone: TZ,
        personalized_booking_enabled: true,
        group_booking_enabled: true,
        personalized_default_capacity: 1,
        cancel_min_lead_minutes: 120,
        late_cancel_consumes_session: true,
        apply_policy_to_open: false,
      });
    });

    it("F0.3 catálogo de actividades (global) creado por SA", async () => {
      await act(U.sa, () => createGymActivityAction(undefined, fd({ name: "Sentadilla", code: "SQ", sort_order: "1" })));
      await act(U.sa, () => createGymActivityAction(undefined, fd({ name: "Remo", code: "RW", sort_order: "2" })));
      ids.actSq = (await db.gymActivity.findFirstOrThrow({ where: { tenant_id: T1, code: "SQ" } })).id;
      ids.actRw = (await db.gymActivity.findFirstOrThrow({ where: { tenant_id: T1, code: "RW" } })).id;
      expect((await db.gymActivity.findUniqueOrThrow({ where: { id: ids.actSq } })).location_id).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════════
  // F1 — PERSONALIZED
  // ════════════════════════════════════════════════════════════════
  describe("F1 PERSONALIZED", () => {
    it("F1.1 alta de dos alumnos PERSONALIZED (BA) + portal habilitado; recepción solo NORMAL", async () => {
      for (const doc of ["P1", "P2"]) {
        expect(await act(U.ba, () => createClientAction(undefined, fd({ first_name: `Alumno ${doc}`, last_name: "Personal", branch_id: B1, document_id: doc, modality: "PERSONALIZED" })))).toEqual({
          redirect: "/dashboard/clients",
        });
        const c = await clientOf(doc);
        expect(c).toMatchObject({ modality: "PERSONALIZED", tenant_id: T1, branch_id: B1 });
        await act(U.ba, () => enableClientPortalAction(undefined, fd({ client_id: c.id, portal_email: `${doc.toLowerCase()}@cert.invalid`, portal_password: "Cert-Pass-2026" })));
        const userId = (await clientOf(doc)).user_id!;
        expect(userId).toBeTruthy();
        registerUser(userId, { role: "client", tenantId: T1, locationId: null }, { tenantId: T1, role: "client", locationId: null, db });
      }
      const r = await rejectedWithoutWrites(db, () =>
        act(U.rc, () => createClientAction(undefined, fd({ first_name: "R", last_name: "X", branch_id: B1, document_id: "RX", modality: "PERSONALIZED" })))
      );
      expect(r).toMatchObject({ errors: { modality: [expect.any(String)] } });
    });

    it("F1.2 plan PERSONALIZED (4 sesiones) y venta con entrenador autorizado y pago válido", async () => {
      await act(U.sa, () => createPlanAction(undefined, fd({ name: "Personal 4", duration_days: "30", price: "60", access_type: "full", sessions_limit: "4", modality: "PERSONALIZED" })));
      await act(U.sa, () => createPlanAction(undefined, fd({ name: "Normal mensual", duration_days: "30", price: "25", access_type: "full", modality: "NORMAL" })));
      await act(U.sa, () => createPlanAction(undefined, fd({ name: "Grupal 8", duration_days: "30", price: "40", access_type: "full", sessions_limit: "8", modality: "GROUP" })));
      const pers = await planId("Personal 4");
      for (const doc of ["P1", "P2"]) {
        const c = await clientOf(doc);
        // Venta sin entrenador → rechazo; con entrenador de la sede → snapshot coherente.
        const noTrainer = await rejectedWithoutWrites(db, () =>
          act(U.rc, () => createClientMembershipAction(undefined, fd({ client_id: c.id, membership_plan_id: pers, branch_id: B1, start_date: D0, price_at_sale: "60", payment_status: "paid" })))
        );
        expect(noTrainer).toMatchObject({ errors: { assigned_trainer_id: expect.any(Array) } });
        expect(
          await act(U.rc, () =>
            createClientMembershipAction(undefined, fd({ client_id: c.id, membership_plan_id: pers, branch_id: B1, start_date: D0, price_at_sale: "60", payment_status: "paid", assigned_trainer_id: TA }))
          )
        ).toEqual({ redirect: "/dashboard/memberships/client-memberships" });
        expect(await db.clientMembership.findFirstOrThrow({ where: { client_id: c.id } })).toMatchObject({
          modality: "PERSONALIZED",
          sessions_total: 4,
          sessions_used: 0,
          assigned_trainer_id: TA,
          payment_status: "paid",
          tenant_id: T1,
        });
      }
      // Modalidad incompatible: un plan NORMAL no se vende a un alumno PERSONALIZED.
      const p1 = await clientOf("P1");
      const wrong = await rejectedWithoutWrites(db, async () =>
        act(U.sa, async () => createClientMembershipAction(undefined, fd({ client_id: p1.id, membership_plan_id: await planId("Normal mensual"), branch_id: B1, start_date: D0, price_at_sale: "25", payment_status: "paid" })))
      );
      expect(wrong).toMatchObject({ errors: { membership_plan_id: expect.any(Array) } });
    });

    it("F1.3 sesiones PERSONALIZED: cupo predeterminado del entrenador (1) y cupo explícito mayor (DEFAULT_ONLY)", async () => {
      const k = (title: string, extra: Record<string, string>) =>
        fd({ branch_id: B1, class_type_id: CT1, title, class_date: S, session_kind: "PERSONALIZED", ...extra });
      expect(await act(U.ba, () => createScheduledClassAction(undefined, k("SP1", { trainer_id: TA, start_time: "07:00", end_time: "08:00" })))).toEqual({ redirect: "/dashboard/classes" });
      expect(await act(U.ba, () => createScheduledClassAction(undefined, k("SP2", { trainer_id: TA, start_time: "09:00", end_time: "10:00", capacity: "2" })))).toEqual({ redirect: "/dashboard/classes" });
      expect(await act(U.ba, () => createScheduledClassAction(undefined, k("SPC", { trainer_id: TC, start_time: "12:00", end_time: "13:00" })))).toEqual({ redirect: "/dashboard/classes" });
      const sp1 = await db.scheduledClass.findFirstOrThrow({ where: { title: "SP1" } });
      const sp2 = await db.scheduledClass.findFirstOrThrow({ where: { title: "SP2" } });
      expect(sp1).toMatchObject({ session_kind: "PERSONALIZED", capacity: 1, trainer_id: TA, is_personalized: false, tenant_id: T1 });
      expect(sp1.starts_at?.toISOString()).toBe(at(S, "07:00").toISOString());
      expect(sp2.capacity).toBe(2); // mayor que el predeterminado del entrenador: permitido (DEFAULT_ONLY)
      ids.SP1 = sp1.id;
      ids.SP2 = sp2.id;
      ids.SPC = await sessionId("SPC");
    });

    it("F1.4 saldo y calendario: el alumno ve solo las sesiones de su entrenador autorizado", async () => {
      const p1 = await portalRef("P1");
      const summary = await loadPortalMembershipSummary({ db, tenantId: T1, client: p1 });
      expect(summary.primary).toMatchObject({ modality: "PERSONALIZED", sessionsTotal: 4, sessionsUsed: 0, sessionsRemaining: 4, trainerName: expect.stringContaining("Ana") });
      const sched = await loadPortalSchedule({ db, tenantId: T1, client: p1, week: S });
      const seen = sched.days.flatMap((d) => d.sessions.map((s) => s.id));
      expect(seen).toEqual(expect.arrayContaining([ids.SP1, ids.SP2]));
      expect(seen).not.toContain(ids.SPC); // otro entrenador: oculto en la consulta
      const sp1 = sched.days.flatMap((d) => d.sessions).find((s) => s.id === ids.SP1)!;
      expect(sp1.evaluation).toMatchObject({ state: "AVAILABLE", canBook: true });
    });

    it("F1.5 reserva: confirmación, consumo exacto de una sesión y cupo", async () => {
      const [p1, u1] = [await clientOf("P1"), await userOf("P1")];
      expect(await book(u1, ids.SP1)).toEqual({ success: true });
      const b = await bookingOf(ids.SP1, p1.id);
      expect(b).toMatchObject({ booking_status: "confirmed", consumption: "CONSUMED", channel: "PORTAL", tenant_id: T1 });
      expect((await db.clientMembership.findFirstOrThrow({ where: { client_id: p1.id } })).sessions_used).toBe(1);
      expect((await db.scheduledClass.findUniqueOrThrow({ where: { id: ids.SP1 } })).booked_count).toBe(1);
      expect(await db.classBookingEvent.count({ where: { booking_id: b.id, event_type: "BOOKED" } })).toBe(1);
      ids.bP1SP1 = b.id;
    });

    it("F1.6 agenda compartida: el otro alumno autorizado ve SP1 completa, sin datos de quien reservó, y se le rechaza", async () => {
      const [p1, p2, u2] = [await clientOf("P1"), await portalRef("P2"), await userOf("P2")];
      const sched = await loadPortalSchedule({ db, tenantId: T1, client: p2, week: S });
      const view = sched.days.flatMap((d) => d.sessions).find((s) => s.id === ids.SP1)!;
      expect(view).toMatchObject({ booked: 1, capacity: 1, ownBookingId: null });
      expect(view.evaluation.state).toBe("FULL");
      const json = JSON.stringify(sched);
      expect(json).not.toContain(p1.id);
      expect(json).not.toContain(ids.bP1SP1);
      expect(json).not.toContain(p1.first_name);
      const r = await rejectedWithoutWrites(db, () => book(u2, ids.SP1));
      expect(isError(r)).toBe(true);
      evidence.F1_6_full = r;
    });

    it("F1.7 cupo explícito 2: ambos alumnos reservan la MISMA sesión (no es cita exclusiva)", async () => {
      expect(await book(await userOf("P1"), ids.SP2)).toEqual({ success: true });
      expect(await book(await userOf("P2"), ids.SP2)).toEqual({ success: true });
      expect((await db.scheduledClass.findUniqueOrThrow({ where: { id: ids.SP2 } })).booked_count).toBe(2);
    });

    it("F1.8 cancelación dentro de política: libera cupo y saldo (CLIENT_IN_POLICY → RELEASED)", async () => {
      const p2 = await clientOf("P2");
      const b = await bookingOf(ids.SP2, p2.id);
      expect(await cancel(await userOf("P2"), b.id)).toEqual({ success: true });
      expect(await bookingOf(ids.SP2, p2.id)).toMatchObject({ booking_status: "cancelled", cancellation_type: "CLIENT_IN_POLICY", consumption: "RELEASED" });
      expect((await db.clientMembership.findFirstOrThrow({ where: { client_id: p2.id } })).sessions_used).toBe(0);
      expect((await db.scheduledClass.findUniqueOrThrow({ where: { id: ids.SP2 } })).booked_count).toBe(1);
    });

    it("F1.9 otro entrenador: reservar la sesión de TC con ids manipulados → rechazo sin escrituras", async () => {
      const r = await rejectedWithoutWrites(db, async () => book(await userOf("P1"), ids.SPC));
      expect(isError(r)).toBe(true);
      evidence.F1_9_other_trainer = r;
    });

    it("F1.10 asistencia, actividad individual y nota privada del entrenador en SP1", async () => {
      const p1 = await clientOf("P1");
      // Antes del inicio el entrenador no registra (R32) — sin escrituras.
      const early = await rejectedWithoutWrites(db, () =>
        act(U.trA, () => trainerRecordAttendanceAction(fd({ scheduled_class_id: ids.SP1, booking_id: ids.bP1SP1, attendance_status: "attended", idempotency_key: randomUUID() })))
      );
      expect(isError(early)).toBe(true);
      evidence.F1_10_before_start = early;

      vi.setSystemTime(new Date(at(S, "07:00").getTime() + 30 * MIN));
      // Otro entrenador (TC) no opera la sesión de TA.
      const foreign = await rejectedWithoutWrites(db, () =>
        act(U.trC, () => trainerRecordAttendanceAction(fd({ scheduled_class_id: ids.SP1, booking_id: ids.bP1SP1, attendance_status: "attended", idempotency_key: randomUUID() })))
      );
      expect(isError(foreign)).toBe(true);
      // Entrenador autorizado.
      const ok = await act(U.trA, () => trainerRecordAttendanceAction(fd({ scheduled_class_id: ids.SP1, booking_id: ids.bP1SP1, attendance_status: "attended", idempotency_key: randomUUID() })));
      expect(ok).toEqual({ redirect: `/dashboard/classes/${ids.SP1}?notice=${encodeURIComponent("Asistencia registrada.")}` });
      const att = await db.classAttendance.findFirstOrThrow({ where: { scheduled_class_id: ids.SP1, client_id: p1.id } });
      expect(att).toMatchObject({ attendance_status: "attended", tenant_id: T1, booking_id: ids.bP1SP1 });
      ids.attP1 = att.id;
      // La asistencia no altera consumo ni cupo.
      expect((await db.clientMembership.findFirstOrThrow({ where: { client_id: p1.id } })).sessions_used).toBe(2);
      await act(U.trA, () => addAttendanceActivityAction(fd({ scheduled_class_id: ids.SP1, attendance_id: att.id, activity_id: ids.actSq, notes: "3x10" })));
      expect(await db.classAttendanceActivity.count({ where: { attendance_id: att.id } })).toBe(1);
      await act(U.trA, () => saveTrainingNotesAction(fd({ scheduled_class_id: ids.SP1, booking_id: ids.bP1SP1, training_notes: "NOTA-PRIVADA-P1 molestia rodilla", idempotency_key: randomUUID() })));
      expect(await db.classAttendance.findUniqueOrThrow({ where: { id: att.id } })).toMatchObject({ training_notes: "NOTA-PRIVADA-P1 molestia rodilla", attendance_status: "attended" });
    });

    it("F1.11 cancelación tardía (< 120 min): CLIENT_LATE y la sesión sigue consumida", async () => {
      vi.setSystemTime(new Date(at(S, "09:00").getTime() - 60 * MIN));
      const p1 = await clientOf("P1");
      const b = await bookingOf(ids.SP2, p1.id);
      expect(await cancel(await userOf("P1"), b.id)).toEqual({ success: true });
      expect(await bookingOf(ids.SP2, p1.id)).toMatchObject({ booking_status: "cancelled", cancellation_type: "CLIENT_LATE", consumption: "CONSUMED" });
      expect((await db.clientMembership.findFirstOrThrow({ where: { client_id: p1.id } })).sessions_used).toBe(2);
      expect((await db.scheduledClass.findUniqueOrThrow({ where: { id: ids.SP2 } })).booked_count).toBe(0);
      vi.setSystemTime(T0);
    });

    it("F1.12 privacidad: el portal del alumno no expone notas privadas; otro entrenador no ve el detalle", async () => {
      const p1 = await clientOf("P1");
      const attendance = await getMyAttendance(p1.id, db, T1);
      expect(JSON.stringify(attendance)).not.toContain("NOTA-PRIVADA");
      expect(await getSessionTrainingDetail(db, T1, ids.SP1, { includePrivateNotes: false, assignedTrainerId: TC })).toBeNull();
      const own = await getSessionTrainingDetail(db, T1, ids.SP1, { includePrivateNotes: true, assignedTrainerId: TA });
      expect(own?.session.attendance[0]).toMatchObject({ attendance_status: "attended" });
    });
  });

  // ════════════════════════════════════════════════════════════════
  // F2 — GROUP
  // ════════════════════════════════════════════════════════════════
  describe("F2 GROUP", () => {
    it("F2.1 alta de cuatro alumnos GROUP y venta GROUP sin entrenador", async () => {
      const grp = await planId("Grupal 8");
      for (const doc of ["G1", "G2", "G3", "G4"]) {
        await act(U.ba, () => createClientAction(undefined, fd({ first_name: `Alumno ${doc}`, last_name: "Grupal", branch_id: B1, document_id: doc, modality: "GROUP" })));
        const c = await clientOf(doc);
        await act(U.ba, () => enableClientPortalAction(undefined, fd({ client_id: c.id, portal_email: `${doc.toLowerCase()}@cert.invalid`, portal_password: "Cert-Pass-2026" })));
        const userId = (await clientOf(doc)).user_id!;
        registerUser(userId, { role: "client", tenantId: T1, locationId: null }, { tenantId: T1, role: "client", locationId: null, db });
        expect(
          await act(U.rc, () => createClientMembershipAction(undefined, fd({ client_id: c.id, membership_plan_id: grp, branch_id: B1, start_date: D0, price_at_sale: "40", payment_status: "paid", assigned_trainer_id: TA })))
        ).toEqual({ redirect: "/dashboard/memberships/client-memberships" });
        // GROUP no lleva entrenador en la membresía aunque el formulario lo envíe.
        expect(await db.clientMembership.findFirstOrThrow({ where: { client_id: c.id } })).toMatchObject({ modality: "GROUP", sessions_total: 8, assigned_trainer_id: null });
      }
    });

    it("F2.2 sesión GROUP con cupo 3; fuera de disponibilidad y solapada → rechazo sin escrituras", async () => {
      const k = (title: string, extra: Record<string, string>) =>
        fd({ branch_id: B1, class_type_id: CT1, trainer_id: TC, title, class_date: S, session_kind: "GROUP", ...extra });
      expect(await act(U.ba, () => createScheduledClassAction(undefined, k("SG1", { start_time: "07:00", end_time: "08:00", capacity: "3" })))).toEqual({ redirect: "/dashboard/classes" });
      ids.SG1 = await sessionId("SG1");
      const outside = await rejectedWithoutWrites(db, () => act(U.ba, () => createScheduledClassAction(undefined, k("SG-out", { start_time: "03:00", end_time: "04:00", capacity: "3" }))));
      expect(outside).toMatchObject({ errors: expect.any(Object) });
      const overlap = await rejectedWithoutWrites(db, () => act(U.ba, () => createScheduledClassAction(undefined, k("SG-overlap", { start_time: "07:30", end_time: "08:30", capacity: "3" }))));
      expect(overlap).toMatchObject({ errors: { start_time: [expect.stringContaining("ya tiene una clase")] } });
      evidence.F2_2 = { outside, overlap };
      for (const [title, start, end, cap] of [["SG2", "09:00", "10:00", "1"], ["SG3", "11:00", "12:00", "5"]] as const) {
        await act(U.ba, () => createScheduledClassAction(undefined, k(title, { start_time: start, end_time: end, capacity: cap })));
        ids[title] = await sessionId(title);
      }
    });

    it("F2.3 serie recurrente GROUP: 4 sesiones, repetición idempotente", async () => {
      const r = await act(U.ba, () =>
        createClassSeriesAction(undefined, fd({ location_id: B1, class_type_id: CT1, trainer_id: TC, session_kind: "GROUP", title: "Serie Grupal", weekday: weekdayOf(S), start_time: "18:00", end_time: "19:00", capacity: "3", valid_from: D0 }))
      );
      expect(r).toMatchObject({ redirect: expect.stringMatching(/^\/dashboard\/classes\/series\//) });
      const series = await db.classSeries.findFirstOrThrow({ where: { title: "Serie Grupal" } });
      const g = await act(U.ba, () => generateClassSeriesSessionsAction(undefined, fd({ id: series.id })));
      expect((g as { report: { created: unknown[] } }).report.created).toHaveLength(4);
      const again = await act(U.ba, () => generateClassSeriesSessionsAction(undefined, fd({ id: series.id })));
      expect((again as { report: { created: unknown[]; skippedExisting: unknown[] } }).report).toMatchObject({ created: [] });
      const sessions = await db.scheduledClass.findMany({ where: { series_id: series.id }, orderBy: { class_date: "asc" } });
      expect(sessions).toHaveLength(4);
      expect(sessions.every((s) => s.session_kind === "GROUP" && s.capacity === 3 && s.trainer_id === TC)).toBe(true);
      expect(sessions[0].starts_at?.toISOString()).toBe(at(S, "18:00").toISOString());
      ids.SERIES_FIRST = sessions[0].id;
    });

    it("F2.4 portal GROUP: ve GROUP con cupos y horario local; no ve OPEN ni PERSONALIZED", async () => {
      const g1 = await portalRef("G1");
      const sched = await loadPortalSchedule({ db, tenantId: T1, client: g1, week: S });
      const views = sched.days.flatMap((d) => d.sessions);
      const seen = views.map((s) => s.id);
      expect(seen).toEqual(expect.arrayContaining([ids.SG1, ids.SG2, ids.SG3, ids.SERIES_FIRST]));
      expect(seen).not.toContain(ids.SP1);
      expect(views.every((v) => v.kind === "GROUP")).toBe(true);
      expect(views.find((v) => v.id === ids.SG1)).toMatchObject({ start: "07:00", end: "08:00", capacity: 3, booked: 0 });
    });

    it("F2.5 varios alumnos reservan hasta el límite; el cuarto recibe cupo agotado sin escrituras", async () => {
      for (const doc of ["G1", "G2", "G3"]) expect(await book(await userOf(doc), ids.SG1)).toEqual({ success: true });
      expect((await db.scheduledClass.findUniqueOrThrow({ where: { id: ids.SG1 } })).booked_count).toBe(3);
      const full = await rejectedWithoutWrites(db, async () => book(await userOf("G4"), ids.SG1));
      expect(isError(full)).toBe(true);
      evidence.F2_5_full = full;
    });

    it("F2.6 cancelación libera cupo y sesión; el cuarto alumno toma el lugar", async () => {
      const g1 = await clientOf("G1");
      expect(await cancel(await userOf("G1"), (await bookingOf(ids.SG1, g1.id)).id)).toEqual({ success: true });
      expect((await db.scheduledClass.findUniqueOrThrow({ where: { id: ids.SG1 } })).booked_count).toBe(2);
      expect((await db.clientMembership.findFirstOrThrow({ where: { client_id: g1.id } })).sessions_used).toBe(0);
      expect(await book(await userOf("G4"), ids.SG1)).toEqual({ success: true });
      expect((await db.scheduledClass.findUniqueOrThrow({ where: { id: ids.SG1 } })).booked_count).toBe(3);
    });

    it("F2.7 cancelación por staff (con motivo) y re-reserva del alumno: el motor la reactiva (decisión D)", async () => {
      const g2 = await clientOf("G2");
      const b = await bookingOf(ids.SG1, g2.id);
      await act(U.ba, () => staffCancelBookingAction(fd({ booking_id: b.id, scheduled_class_id: ids.SG1, reason: "Reprogramación solicitada", idempotency_key: randomUUID() })));
      expect(await bookingOf(ids.SG1, g2.id)).toMatchObject({ booking_status: "cancelled", cancellation_type: "STAFF", consumption: "RELEASED" });
      const view = (await loadPortalSchedule({ db, tenantId: T1, client: await portalRef("G2"), week: S })).days.flatMap((d) => d.sessions).find((s) => s.id === ids.SG1)!;
      evidence.F2_7_view_after_staff_cancel = { state: view.evaluation.state, canBook: view.evaluation.canBook, isReactivation: view.evaluation.isReactivation, ownCancellation: view.ownCancellation };
      expect(await book(await userOf("G2"), ids.SG1)).toEqual({ success: true });
      expect(await bookingOf(ids.SG1, g2.id)).toMatchObject({ booking_status: "confirmed", consumption: "CONSUMED", id: b.id });
      expect(await db.classBookingEvent.count({ where: { booking_id: b.id, event_type: "REACTIVATED" } })).toBe(1);
    });

    it("F2.8 concurrencia real: último cupo (2 conexiones) y doble clic con la misma clave", async () => {
      const [u2, u3] = [await userOf("G2"), await userOf("G3")];
      h.live.set(u3, { ...h.live.get(u3)!, db: dbB }); // G3 usa otra conexión física
      const before = await footprint(db);
      as(u2);
      const p2 = bookClassAction(undefined, fd({ class_id: ids.SG2, idempotency_key: randomUUID() }));
      as(u3);
      const p3 = bookClassAction(undefined, fd({ class_id: ids.SG2, idempotency_key: randomUUID() }));
      const results = await Promise.all([p2, p3]);
      expect(results.filter((r) => "success" in r)).toHaveLength(1);
      expect(results.filter((r) => "error" in r)).toHaveLength(1);
      expect((await db.scheduledClass.findUniqueOrThrow({ where: { id: ids.SG2 } })).booked_count).toBe(1);
      expect((await footprint(db)).confirmed).toBe(before.confirmed + 1);
      evidence.F2_8_last_seat = results;

      const u1 = await userOf("G1");
      h.live.set(u1, { ...h.live.get(u1)!, db: dbB });
      const sameKey = randomUUID();
      as(u1);
      const a = bookClassAction(undefined, fd({ class_id: ids.SG3, idempotency_key: sameKey }));
      h.live.set(u1, { ...h.live.get(u1)!, db });
      as(u1);
      const b = bookClassAction(undefined, fd({ class_id: ids.SG3, idempotency_key: sameKey }));
      expect(await Promise.all([a, b])).toEqual([{ success: true }, { success: true }]);
      const g1 = await clientOf("G1");
      expect(await db.classBooking.count({ where: { scheduled_class_id: ids.SG3, client_id: g1.id } })).toBe(1);
      expect(await db.gymBookingOperation.count({ where: { tenant_id: T1, idempotency_key: sameKey } })).toBe(1);
      expect((await db.clientMembership.findFirstOrThrow({ where: { client_id: g1.id } })).sessions_used).toBe(1);
      h.live.set(u3, { ...h.live.get(u3)!, db });
    });

    it("F2.9 reserva duplicada (otra clave) → rechazo sin escrituras", async () => {
      const r = await rejectedWithoutWrites(db, async () => book(await userOf("G1"), ids.SG3));
      expect(isError(r)).toBe(true);
      evidence.F2_9_duplicate = r;
    });

    it("F2.10 agenda del entrenador y listado de participantes", async () => {
      const agenda = await getTrainerAgenda(db, T1, TC);
      const upcomingIds = [...agenda.todaySessions, ...agenda.upcoming].map((s) => s.id);
      expect(upcomingIds).toEqual(expect.arrayContaining([ids.SG1, ids.SG2, ids.SG3, ids.SERIES_FIRST, ids.SPC]));
      expect(upcomingIds).not.toContain(ids.SP1); // sesión de otro entrenador
      const detail = await getSessionTrainingDetail(db, T1, ids.SG1, { includePrivateNotes: false, assignedTrainerId: TC });
      const names = detail!.session.bookings.map((b) => b.client.first_name).sort();
      expect(names).toEqual(["Alumno G2", "Alumno G3", "Alumno G4"]);
    });

    it("F2.11 asistencia individual attended / late / absent, actividades comunes e individuales, nota privada", async () => {
      vi.setSystemTime(new Date(at(S, "07:00").getTime() + 20 * MIN));
      const status: Record<string, "attended" | "late" | "absent"> = { G2: "attended", G3: "late", G4: "absent" };
      for (const [doc, s] of Object.entries(status)) {
        const c = await clientOf(doc);
        const b = await bookingOf(ids.SG1, c.id);
        await act(U.trC, () => trainerRecordAttendanceAction(fd({ scheduled_class_id: ids.SG1, booking_id: b.id, attendance_status: s, idempotency_key: randomUUID() })));
        const att = await db.classAttendance.findFirstOrThrow({ where: { scheduled_class_id: ids.SG1, client_id: c.id } });
        expect(att.attendance_status).toBe(s);
        if (s === "absent") expect(att.checked_in_at).toBeNull();
        ids[`att${doc}`] = att.id;
      }
      // Actividad común (una por sesión; repetir no duplica).
      await act(U.trC, () => addSessionActivityAction(fd({ scheduled_class_id: ids.SG1, activity_id: ids.actRw })));
      const again = await act(U.trC, () => addSessionActivityAction(fd({ scheduled_class_id: ids.SG1, activity_id: ids.actRw })));
      expect(again).toMatchObject({ redirect: expect.stringContaining(encodeURIComponent("La actividad ya estaba registrada.")) });
      expect(await db.scheduledClassActivity.count({ where: { scheduled_class_id: ids.SG1 } })).toBe(1);
      // Actividad específica de un alumno presente; el ausente no recibe actividad.
      await act(U.trC, () => addAttendanceActivityAction(fd({ scheduled_class_id: ids.SG1, attendance_id: ids.attG2, activity_id: ids.actSq })));
      expect(await db.classAttendanceActivity.count({ where: { attendance_id: ids.attG2 } })).toBe(1);
      const absent = await rejectedWithoutWrites(db, () => act(U.trC, () => addAttendanceActivityAction(fd({ scheduled_class_id: ids.SG1, attendance_id: ids.attG4, activity_id: ids.actSq }))));
      expect(isError(absent)).toBe(true);
      evidence.F2_11_absent_activity = absent;
      const g3Booking = (await bookingOf(ids.SG1, (await clientOf("G3")).id)).id;
      await act(U.trC, () => saveTrainingNotesAction(fd({ scheduled_class_id: ids.SG1, booking_id: g3Booking, training_notes: "NOTA-PRIVADA-G3 técnica", idempotency_key: randomUUID() })));
      expect((await db.classAttendance.findUniqueOrThrow({ where: { id: ids.attG3 } })).training_notes).toBe("NOTA-PRIVADA-G3 técnica");
      // Ausente sigue consumido (R31); la asistencia no mueve contadores.
      expect((await db.clientMembership.findFirstOrThrow({ where: { client_id: (await clientOf("G4")).id } })).sessions_used).toBe(1);
    });

    it("F2.12 cancelación fuera de plazo (sesión iniciada) → rechazo sin escrituras", async () => {
      vi.setSystemTime(new Date(at(S, "07:00").getTime() + 20 * MIN));
      const g2 = await clientOf("G2");
      const r = await rejectedWithoutWrites(db, async () => cancel(await userOf("G2"), (await bookingOf(ids.SG1, g2.id)).id));
      expect(isError(r)).toBe(true);
      evidence.F2_12_after_start = r;
      vi.setSystemTime(T0);
    });

    it("F2.13 historial: cada alumno ve solo lo suyo y sin notas privadas", async () => {
      for (const doc of ["G2", "G3", "G4"]) {
        const c = await clientOf(doc);
        const att = await getMyAttendance(c.id, db, T1);
        expect(att).toHaveLength(1);
        expect(JSON.stringify(att)).not.toContain("NOTA-PRIVADA");
        const bookings = await loadPortalBookings({ db, tenantId: T1, client: await portalRef(doc) });
        const all = JSON.stringify(bookings);
        for (const other of ["G1", "G2", "G3", "G4"].filter((d) => d !== doc)) expect(all).not.toContain((await clientOf(other)).id);
      }
    });
  });

  // ════════════════════════════════════════════════════════════════
  // F3 — Pruebas negativas (cada rechazo sin escrituras parciales)
  // ════════════════════════════════════════════════════════════════
  describe("F3 negativas", () => {
    it("F3.1 matriz de modalidades: NORMAL→GROUP, NORMAL→PERSONALIZED, GROUP→PERSONALIZED, PERSONALIZED→GROUP", async () => {
      await act(U.rc, () => createClientAction(undefined, fd({ first_name: "Alumno N1", last_name: "Normal", branch_id: B1, document_id: "N1" })));
      const n1 = await clientOf("N1");
      await act(U.rc, () => enableClientPortalAction(undefined, fd({ client_id: n1.id, portal_email: "n1@cert.invalid", portal_password: "Cert-Pass-2026" })));
      const un = (await clientOf("N1")).user_id!;
      registerUser(un, { role: "client", tenantId: T1, locationId: null }, { tenantId: T1, role: "client", locationId: null, db });
      await act(U.rc, async () => createClientMembershipAction(undefined, fd({ client_id: n1.id, membership_plan_id: await planId("Normal mensual"), branch_id: B1, start_date: D0, price_at_sale: "25", payment_status: "paid" })));
      expect(await db.clientMembership.findFirstOrThrow({ where: { client_id: n1.id } })).toMatchObject({ modality: "NORMAL", sessions_total: null });
      const cases = {
        NORMAL_to_GROUP: [un, ids.SG3],
        NORMAL_to_PERSONALIZED: [un, ids.SP2],
        GROUP_to_PERSONALIZED: [await userOf("G3"), ids.SP2],
        PERSONALIZED_to_GROUP: [await userOf("P2"), ids.SG3],
      } as const;
      const out: Record<string, unknown> = {};
      for (const [name, [u, s]] of Object.entries(cases)) {
        out[name] = await rejectedWithoutWrites(db, () => book(u, s));
        expect(isError(out[name])).toBe(true);
      }
      evidence.F3_1 = out;
    });

    it("F3.2 membresía vencida, pago pendiente y sesiones agotadas", async () => {
      const pers = await planId("Personal 4");
      // Vencida (fixture: venta anterior ya terminada).
      await act(U.ba, () => createClientAction(undefined, fd({ first_name: "Alumno X", last_name: "Vencida", branch_id: B1, document_id: "XE", modality: "PERSONALIZED" })));
      const xe = await clientOf("XE");
      await db.clientMembership.create({
        data: { gym_id: T1, tenant_id: T1, branch_id: B1, client_id: xe.id, membership_plan_id: pers, start_date: new Date(`${D(-40)}T00:00:00Z`), end_date: new Date(`${D(-10)}T00:00:00Z`), price_at_sale: 60, final_amount: 60, payment_status: "paid", status: "active", modality: "PERSONALIZED", sessions_total: 4, assigned_trainer_id: TA },
      });
      // Pago pendiente (venta real con estado pending).
      await act(U.ba, () => createClientAction(undefined, fd({ first_name: "Alumno X", last_name: "Pendiente", branch_id: B1, document_id: "XP", modality: "PERSONALIZED" })));
      const xp = await clientOf("XP");
      await act(U.rc, () => createClientMembershipAction(undefined, fd({ client_id: xp.id, membership_plan_id: pers, branch_id: B1, start_date: D0, price_at_sale: "60", payment_status: "pending", assigned_trainer_id: TA })));
      // Agotada: plan GROUP de 1 sesión, ya usada.
      await act(U.sa, () => createPlanAction(undefined, fd({ name: "Grupal 1", duration_days: "30", price: "5", access_type: "full", sessions_limit: "1", modality: "GROUP" })));
      await act(U.ba, () => createClientAction(undefined, fd({ first_name: "Alumno X", last_name: "Agotada", branch_id: B1, document_id: "XA", modality: "GROUP" })));
      const xa = await clientOf("XA");
      await act(U.rc, async () => createClientMembershipAction(undefined, fd({ client_id: xa.id, membership_plan_id: await planId("Grupal 1"), branch_id: B1, start_date: D0, price_at_sale: "5", payment_status: "paid" })));
      for (const c of [xe, xp, xa]) {
        await act(U.ba, () => enableClientPortalAction(undefined, fd({ client_id: c.id, portal_email: `${c.document_id!.toLowerCase()}@cert.invalid`, portal_password: "Cert-Pass-2026" })));
        const u = (await clientOf(c.document_id!)).user_id!;
        registerUser(u, { role: "client", tenantId: T1, locationId: null }, { tenantId: T1, role: "client", locationId: null, db });
      }
      expect(await book(await userOf("XA"), ids.SG3)).toEqual({ success: true });
      const out = {
        expired: await rejectedWithoutWrites(db, async () => book(await userOf("XE"), ids.SP2)),
        pending_payment: await rejectedWithoutWrites(db, async () => book(await userOf("XP"), ids.SP2)),
        exhausted: await rejectedWithoutWrites(db, async () => book(await userOf("XA"), ids.SERIES_FIRST)),
      };
      for (const r of Object.values(out)) expect(isError(r)).toBe(true);
      // Sin divulgar horarios PERSONALIZED con pago pendiente.
      const pendingView = await loadPortalSchedule({ db, tenantId: T1, client: await portalRef("XP"), week: S });
      expect(pendingView.days.flatMap((d) => d.sessions.map((s) => s.id))).not.toContain(ids.SP2);
      evidence.F3_2 = out;
    });

    it("F3.3 otra sede, otro tenant (Shared) y módulo deshabilitado", async () => {
      expect(
        await act(U.sa, () => createScheduledClassAction(undefined, fd({ branch_id: B1B, class_type_id: CT1, trainer_id: TB, title: "SG-north", class_date: S, start_time: "07:00", end_time: "08:00", session_kind: "GROUP", capacity: "5" })))
      ).toEqual({ redirect: "/dashboard/classes" });
      const north = await sessionId("SG-north");
      const neighbour = randomUUID();
      await db.scheduledClass.create({
        data: { id: neighbour, gym_id: T2, tenant_id: T2, branch_id: B2, class_type_id: CT2, trainer_id: TZ2, title: "Vecina", class_date: new Date(`${S}T00:00:00Z`), start_time: "07:00", end_time: "08:00", capacity: 5, session_kind: "GROUP", starts_at: at(S, "07:00"), ends_at: at(S, "08:00") },
      });
      const g3 = await userOf("G3");
      const out: Record<string, unknown> = {
        other_branch: await rejectedWithoutWrites(db, () => book(g3, north)),
        other_tenant: await rejectedWithoutWrites(db, () => book(g3, neighbour)),
      };
      h.disabledModules = ["gym.classes"];
      out.module_disabled = await rejectedWithoutWrites(db, () => book(g3, ids.SERIES_FIRST));
      expect(out.module_disabled).toEqual({ error: "Este módulo no está habilitado para tu organización." });
      h.disabledModules = [];
      for (const r of Object.values(out)) expect(isError(r)).toBe(true);
      // El vecino no ve nada del gimnasio certificado.
      expect(await db.scheduledClass.findFirst({ where: { id: ids.SG1, tenant_id: T2 } })).toBeNull();
      evidence.F3_3 = out;
    });

    it("F3.4 modalidad desactivada: GROUP apagado bloquea reservas nuevas; se restaura", async () => {
      const base = { timezone: TZ, personalized_default_capacity: "1", booking_horizon_days: "14", booking_min_lead_minutes: "0", cancel_min_lead_minutes: "120", late_cancel_consumes_session: "on", attendance_edit_window_hours: "48", series_generation_weeks: "4" };
      await act(U.sa, () => updateGymBookingPolicyAction(undefined, fd({ ...base, personalized_booking_enabled: "on" })));
      expect((await db.gymSettings.findUniqueOrThrow({ where: { gym_id: T1 } })).group_booking_enabled).toBe(false);
      const r = await rejectedWithoutWrites(db, async () => book(await userOf("G4"), ids.SERIES_FIRST));
      expect(isError(r)).toBe(true);
      evidence.F3_4_group_disabled = r;
      await act(U.sa, () => updateGymBookingPolicyAction(undefined, fd({ ...base, personalized_booking_enabled: "on", group_booking_enabled: "on" })));
      expect((await db.gymSettings.findUniqueOrThrow({ where: { gym_id: T1 } })).group_booking_enabled).toBe(true);
    });

    it("F3.5 rol LIVE degradado (JWT vigente) y Support Session de solo lectura", async () => {
      const g1 = await clientOf("G1");
      // G1 reserva la primera sesión de la serie para tener una asistencia pendiente.
      expect(await book(await userOf("G1"), ids.SERIES_FIRST)).toEqual({ success: true });
      const b = await bookingOf(ids.SERIES_FIRST, g1.id);
      vi.setSystemTime(new Date(at(S, "18:00").getTime() + 10 * MIN));
      const attendance = fd({ scheduled_class_id: ids.SERIES_FIRST, booking_id: b.id, attendance_status: "attended", idempotency_key: randomUUID() });
      // Entrenador con JWT trainer pero rol LIVE reception.
      h.live.set(U.trC, { ...h.live.get(U.trC)!, role: "reception" });
      const degraded = await rejectedWithoutWrites(db, () => act(U.trC, () => trainerRecordAttendanceAction(attendance)));
      expect(isError(degraded)).toBe(true);
      h.live.set(U.trC, { ...h.live.get(U.trC)!, role: "trainer" });
      // BA con JWT branch_admin pero rol LIVE reception: no programa sesiones.
      h.live.set(U.ba, { ...h.live.get(U.ba)!, role: "reception" });
      const baDegraded = await rejectedWithoutWrites(db, () =>
        act(U.ba, () => createScheduledClassAction(undefined, fd({ branch_id: B1, class_type_id: CT1, trainer_id: TC, title: "SG-degraded", class_date: S_PLUS_1, start_time: "07:00", end_time: "08:00", session_kind: "GROUP", capacity: "3" })))
      );
      expect(isError(baDegraded)).toBe(true);
      h.live.set(U.ba, { ...h.live.get(U.ba)!, role: "branch_admin" });
      // Support Session: toda escritura se rechaza antes de tocar datos.
      const support = {
        session: await rejectedWithoutWrites(db, () => act(U.support, () => createScheduledClassAction(undefined, fd({ branch_id: B1, class_type_id: CT1, trainer_id: TC, title: "SG-support", class_date: S_PLUS_1, start_time: "07:00", end_time: "08:00", session_kind: "GROUP", capacity: "3" })))),
        booking: await rejectedWithoutWrites(db, () => act(U.support, () => staffCancelBookingAction(fd({ booking_id: b.id, reason: "soporte", idempotency_key: randomUUID() })))),
        policy: await rejectedWithoutWrites(db, () => act(U.support, () => updateGymBookingPolicyAction(undefined, fd({ timezone: TZ })))),
      };
      expect(support.session).toMatchObject({ error: expect.stringContaining("solo lectura") });
      expect(await bookingOf(ids.SERIES_FIRST, g1.id)).toMatchObject({ booking_status: "confirmed" });
      // Con el rol restaurado, el entrenador sí registra.
      await act(U.trC, () => trainerRecordAttendanceAction(attendance));
      expect((await db.classAttendance.findFirstOrThrow({ where: { scheduled_class_id: ids.SERIES_FIRST, client_id: g1.id } })).attendance_status).toBe("attended");
      vi.setSystemTime(T0);
      evidence.F3_5 = { degraded, baDegraded, support };
    });

    it("F3.5b DEFECTO LIVE-1: BA con rol LIVE degradado no crea, edita, cancela ni borra sesiones de la agenda", async () => {
      // Sesión sin reservas en la que probar edición, estado y borrado.
      expect(
        await act(U.ba, () => createScheduledClassAction(undefined, fd({ branch_id: B1, class_type_id: CT1, trainer_id: TC, title: "SG-live", class_date: S_PLUS_1, start_time: "09:00", end_time: "10:00", session_kind: "GROUP", capacity: "3" })))
      ).toEqual({ redirect: "/dashboard/classes" });
      const live = await db.scheduledClass.findFirstOrThrow({ where: { title: "SG-live" } });
      const degrade = () => h.live.set(U.ba, { ...h.live.get(U.ba)!, role: "reception" });
      const restore = () => h.live.set(U.ba, { ...h.live.get(U.ba)!, role: "branch_admin" });
      /** Huella + estado de la sesión objetivo: detecta altas, renombres, cancelaciones y borrados. */
      const state = async () => ({
        ...(await footprint(db)),
        target: await db.scheduledClass.findUnique({ where: { id: live.id }, select: { title: true, status: true } }),
      });
      const attempts: Record<string, () => Promise<unknown>> = {
        create: () =>
          act(U.ba, () => createScheduledClassAction(undefined, fd({ branch_id: B1, class_type_id: CT1, trainer_id: TC, title: "SG-live-2", class_date: S_PLUS_1, start_time: "11:00", end_time: "12:00", session_kind: "GROUP", capacity: "3" }))),
        update: () =>
          act(U.ba, () => updateScheduledClassAction(undefined, fd({ id: live.id, branch_id: B1, class_type_id: CT1, trainer_id: TC, title: "SG-live-renamed", class_date: S_PLUS_1, start_time: "09:00", end_time: "10:00", session_kind: "GROUP", capacity: "3" }))),
        toggle: () => act(U.ba, () => toggleScheduledClassStatusAction(fd({ id: live.id, idempotency_key: randomUUID() }))),
        delete: () => act(U.ba, () => deleteScheduledClassAction(fd({ id: live.id }))),
      };
      const outcome: Record<string, { result: unknown; wrote: boolean }> = {};
      degrade();
      try {
        for (const [name, attempt] of Object.entries(attempts)) {
          const before = await state();
          const result = await attempt();
          outcome[name] = { result, wrote: JSON.stringify(await state()) !== JSON.stringify(before) };
        }
      } finally {
        restore();
      }
      evidence.F3_5b = outcome;
      expect(Object.fromEntries(Object.entries(outcome).map(([k, v]) => [k, v.wrote]))).toEqual({ create: false, update: false, toggle: false, delete: false });
      // LIVE-2: el rol de la sesión (reception) ya no coincide con la identidad vigente → fail closed.
      const changed = { error: "Tu rol o tu sede cambiaron. Vuelve a iniciar sesión para continuar." };
      expect(outcome.create.result).toEqual(changed);
      expect(outcome.update.result).toEqual(changed);
      expect(await db.scheduledClass.findUniqueOrThrow({ where: { id: live.id } })).toMatchObject({ title: "SG-live", status: "scheduled" });
      // Control positivo: con el rol LIVE vigente, el mismo BA sí opera.
      expect(await act(U.ba, () => deleteScheduledClassAction(fd({ id: live.id })))).toMatchObject({ redirect: expect.stringContaining("/dashboard/classes") });
      expect(await db.scheduledClass.count({ where: { id: live.id } })).toBe(0);
    });

    it("F3.6 toda acción de escritura ejercida pidió el contexto con write: true", () => {
      const writers = h.calls.filter((c) => c.write === true);
      expect(writers.length).toBeGreaterThan(50);
      // Ninguna llamada de escritura de estas acciones omitió el flag (las lecturas no pasan por aquí).
      expect(h.calls.filter((c) => c.write !== true)).toEqual([]);
    });

    it("F3.7 Dedicated: la reserva se escribe solo en su base física", async () => {
      const dd = dedicated.db;
      const client = randomUUID();
      const user = randomUUID();
      const session = randomUUID();
      const plan = randomUUID();
      await dd.user.create({ data: { id: user, tenant_id: TD, gym_id: TD, email: `${user}@cert.invalid`, password_hash: "x", first_name: "D", last_name: "D", role: "client" } });
      await dd.client.create({ data: { id: client, gym_id: TD, tenant_id: TD, branch_id: BD, first_name: "Alumno", last_name: "Dedicado", modality: "GROUP", user_id: user } });
      await dd.membershipPlan.create({ data: { id: plan, gym_id: TD, tenant_id: TD, name: "Grupal D", duration_days: 30, price: 40, modality: "GROUP", sessions_limit: 4 } });
      await dd.clientMembership.create({
        data: { gym_id: TD, tenant_id: TD, branch_id: BD, client_id: client, membership_plan_id: plan, start_date: new Date(`${D(-1)}T00:00:00Z`), end_date: new Date(`${D(29)}T00:00:00Z`), price_at_sale: 40, final_amount: 40, payment_status: "paid", status: "active", modality: "GROUP", sessions_total: 4 },
      });
      await dd.scheduledClass.create({
        data: { id: session, gym_id: TD, tenant_id: TD, branch_id: BD, class_type_id: CTD, trainer_id: TDD, title: "Grupal D", class_date: new Date(`${S}T00:00:00Z`), start_time: "07:00", end_time: "08:00", capacity: 4, session_kind: "GROUP", starts_at: at(S, "07:00"), ends_at: at(S, "08:00") },
      });
      registerUser(user, { role: "client", tenantId: TD, locationId: null }, { tenantId: TD, role: "client", locationId: null, db: dd });
      const sharedBefore = await footprint(db);
      expect(await book(user, session)).toEqual({ success: true });
      expect((await dd.scheduledClass.findUniqueOrThrow({ where: { id: session } })).booked_count).toBe(1);
      expect(await dd.classBooking.count({ where: { client_id: client, consumption: "CONSUMED" } })).toBe(1);
      expect(await footprint(db)).toEqual(sharedBefore);
      expect(await db.classBooking.count({ where: { tenant_id: TD } })).toBe(0);
      expect(await invariantViolations(dd)).toEqual(NO_VIOLATIONS);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // F4 — Planes semanales (5A/5B/5C) con PERSONALIZED y GROUP
  // ════════════════════════════════════════════════════════════════
  describe("F4 planes semanales", () => {
    it("F4.1 plan individual de P1 (BA, entrenador TA) y de G2 (el propio TC)", async () => {
      const p1 = await clientOf("P1");
      const g2 = await clientOf("G2");
      expect(await act(U.ba, () => createClientPlanAction(undefined, fd({ client_id: p1.id, branch_id: B1, trainer_id: TA, template_id: TEMPLATE, start_date: D0, end_date: D(27) })))).toMatchObject({
        redirect: expect.stringContaining("/dashboard/weekly-plans/client-plans"),
      });
      expect(await act(U.trC, () => createClientPlanAction(undefined, fd({ client_id: g2.id, branch_id: B1, template_id: TEMPLATE, start_date: D0, end_date: D(27) })))).toMatchObject({
        redirect: expect.stringContaining("/dashboard/weekly-plans/client-plans"),
      });
      const plans = await db.clientWeeklyPlan.findMany({ where: { tenant_id: T1, client_id: { in: [p1.id, g2.id] } }, include: { days: true } });
      expect(plans).toHaveLength(2);
      expect(plans.every((p) => p.assignment_type === "individual" && p.days.length === 2)).toBe(true);
      ids.planP1 = plans.find((p) => p.client_id === p1.id)!.id;
      ids.planG2 = plans.find((p) => p.client_id === g2.id)!.id;
      expect(plans.find((p) => p.id === ids.planG2)!.trainer_id).toBe(TC);
    });

    it("F4.2 autorreporte del alumno y registro del entrenador vinculado a la asistencia (5A)", async () => {
      vi.setSystemTime(at(S_PLUS_1, "09:00"));
      const dayOf = async (plan: string, weekday: number) => (await db.clientWeeklyPlanDay.findFirstOrThrow({ where: { client_weekly_plan_id: plan, weekday } })).id;
      for (const [doc, plan] of [["P1", ids.planP1], ["G2", ids.planG2]] as const) {
        expect(
          await act(await userOf(doc), async () => submitPlanDayAction(undefined, fd({ plan_day_id: await dayOf(plan, weekdayOf(D(1))), local_date: D(1), execution_status: "partial", client_feedback: "Me faltó tiempo" })))
        ).toEqual({ success: true });
      }
      const rec = (userId: string, plan: string, attendance: string) =>
        act(userId, async () => recordPlanExecutionAction(undefined, fd({ plan_id: plan, day_id: await dayOf(plan, weekdayOf(S)), local_date: S, execution_status: "completed", trainer_feedback: "Buen trabajo", attendance_id: attendance })));
      // TC no registra en el plan de P1 (asignado a TA): sin escrituras.
      const foreign = await rejectedWithoutWrites(db, () => rec(U.trC, ids.planP1, ids.attP1));
      expect(isError(foreign)).toBe(true);
      expect(await rec(U.trA, ids.planP1, ids.attP1)).toEqual({ ok: true });
      expect(await rec(U.trC, ids.planG2, ids.attG2)).toEqual({ ok: true });
      // Vincular la asistencia de OTRO alumno se rechaza (trigger + servicio).
      const wrongLink = await rejectedWithoutWrites(db, async () =>
        act(U.trA, async () => recordPlanExecutionAction(undefined, fd({ plan_id: ids.planP1, day_id: await dayOf(ids.planP1, weekdayOf(D(1))), local_date: D(1), execution_status: "partial", attendance_id: ids.attG3 })))
      );
      expect(isError(wrongLink)).toBe(true);
      // Marcar el plan no altera asistencia, reservas ni consumos.
      expect(await invariantViolations(db)).toEqual(NO_VIOLATIONS);
      evidence.F4_2 = { foreign, wrongLink };
    });

    it("F4.3 integración 5A / 5B / 5C: el mismo 75 % para el mismo plan y fecha", async () => {
      const today = S_PLUS_1;
      for (const [doc, plan, trainer] of [["P1", ids.planP1, TA], ["G2", ids.planG2, TC]] as const) {
        const c = await clientOf(doc);
        const tracking = await loadPlanTracking(db, { tenantId: T1, planId: plan, today, audience: "STAFF", includeSessions: true });
        expect(tracking!.summary).toMatchObject({ scheduled: 2, completed: 1, partial: 1, pending: 0, selfReportedOnly: 1, compliancePct: 75 });
        const linked = tracking!.occurrences.find((o) => o.date === S)!;
        expect(linked.execution?.attendance).toMatchObject({ stillValid: true });
        const progress = await loadPortalProgress({ db, tenantId: T1, gymId: T1, clientId: c.id, today, timezone: TZ, range: "semanas", includeClasses: true });
        expect(progress.training!.summary).toMatchObject({ scheduled: 2, completed: 1, partial: 1, compliancePct: 75 });
        expect(progress.attendance!.frequency).toBeTruthy();
        expect(JSON.stringify(progress)).not.toContain("NOTA-PRIVADA");
        const follow = await loadTrainerFollowUp(db, { tenantId: T1, trainer: { id: trainer, branch_id: B1 }, today, includeClasses: true });
        const row = follow.rows.find((r) => r.planId === plan)!;
        expect(row).toMatchObject({ pct: 75, toReview: 1 });
        expect(row.attendance).toBe(1);
        expect(follow.summary).toMatchObject({ students: 1, currentPlans: 1, trainerRecorded: 1, pct: 75 });
        expect(follow.rows.map((r) => r.planId)).toEqual([plan]); // cada entrenador ve solo SU plan
        evidence[`F4_3_${doc}`] = { tracking: tracking!.summary, progress: progress.training!.summary, follow: follow.summary && { pct: follow.summary.pct, students: follow.summary.students } };
      }
      // El panel 5C es exclusivo del rol LIVE trainer con perfil activo.
      as(U.ba);
      const denied = await resolveTrainerFollowUpAccess(h.session as never, { tenantId: T1, client: db, locationId: B1, runtimeMode: "RUNTIME_CLIENT", effectiveRole: "branch_admin" });
      expect(denied.ok).toBe(false);
      vi.setSystemTime(T0);
    });

    it("F4.4 auditoría «plan grupal»: la asignación segmentada crea planes INDIVIDUALES por alumno, sin filtro de modalidad ni vínculo con sesiones GROUP", async () => {
      const start = D(35);
      const end = D(62);
      const before = await db.clientWeeklyPlan.count({ where: { tenant_id: T1 } });
      const r = await act(U.sa, () => assignTemplateSegmentedAction(undefined, fd({ template_id: TEMPLATE, branch_id: B1, start_date: start, end_date: end })));
      const created = await db.clientWeeklyPlan.findMany({ where: { tenant_id: T1, start_date: new Date(`${start}T00:00:00Z`) }, include: { client: { select: { modality: true } }, days: true } });
      expect(r).toEqual({ assigned: created.length, skipped: 0 });
      expect(await db.clientWeeklyPlan.count({ where: { tenant_id: T1 } })).toBe(before + created.length);
      // Una fila por alumno con assignment_type "segmented"; los días se copian (no se comparten).
      expect(new Set(created.map((p) => p.client_id)).size).toBe(created.length);
      expect(created.every((p) => p.assignment_type === "segmented" && p.days.length === 2 && p.trainer_id === null)).toBe(true);
      const modalities = [...new Set(created.map((p) => p.client.modality))].sort();
      // Incluye alumnos NORMAL, PERSONALIZED y GROUP de la sede: el segmento no es la modalidad GROUP.
      expect(modalities).toEqual(["GROUP", "NORMAL", "PERSONALIZED"]);
      const dayIds = created.flatMap((p) => p.days.map((d) => d.id));
      expect(new Set(dayIds).size).toBe(dayIds.length);
      evidence.F4_4 = { assigned: created.length, modalities };
    });
  });

  // ════════════════════════════════════════════════════════════════
  // F5 — Contadores finales e invariantes
  // ════════════════════════════════════════════════════════════════
  describe("F5 contadores", () => {
    it("F5.1 contadores de reservas y sesiones exactos e invariantes I1–I5 en ambas bases", async () => {
      const used = async (doc: string) => (await db.clientMembership.findFirstOrThrow({ where: { client_id: (await clientOf(doc)).id } })).sessions_used;
      const booked = async (s: string) => (await db.scheduledClass.findUniqueOrThrow({ where: { id: s } })).booked_count;
      const counters = {
        sessions_used: { P1: await used("P1"), P2: await used("P2"), G1: await used("G1"), G2: await used("G2"), G3: await used("G3"), G4: await used("G4"), XA: await used("XA") },
        booked_count: { SP1: await booked(ids.SP1), SP2: await booked(ids.SP2), SG1: await booked(ids.SG1), SG2: await booked(ids.SG2), SG3: await booked(ids.SG3), SERIES_FIRST: await booked(ids.SERIES_FIRST) },
      };
      evidence.F5_counters = counters;
      expect(counters.sessions_used).toMatchObject({ P1: 2, P2: 0, G1: 2, G4: 1, XA: 1 });
      expect(counters.sessions_used.G2 + counters.sessions_used.G3).toBe(1 + 1 + 1); // SG1 (G2, G3) + último cupo SG2 (uno de los dos)
      expect(counters.booked_count).toEqual({ SP1: 1, SP2: 0, SG1: 3, SG2: 1, SG3: 2, SERIES_FIRST: 1 });
      expect(await invariantViolations(db)).toEqual(NO_VIOLATIONS);
      expect(await invariantViolations(dedicated.db)).toEqual(NO_VIOLATIONS);
    });
  });
});
