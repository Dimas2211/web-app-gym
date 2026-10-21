// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3B — portal del alumno contra PostgreSQL REAL desechable
// (mismo arnés que 2B/3A: 127.0.0.1, puerto ≠ 5432, data_directory
// verificado; sin .env ni DATABASE_URL). Se omite sin GYM_BOOKING_IT_*.
//
// Ejecuta las lecturas reales (loadPortalSchedule / loadPortalBookings /
// loadPortalMembershipSummary / getMyAttendance / openPortalContext) y las
// Server Actions reales del portal (bookClassAction / cancelBookingAction →
// GymBookingService). Solo se simulan la sesión (requireClient), el
// contexto operacional (PrismaClient real + tenant + rol LIVE por usuario)
// y next/cache. Cada alumno puede usar su propio PrismaClient: las carreras
// usan conexiones independientes, sin sleeps.
//
// Tenants sintéticos: T1 (El Salvador, modalidades ON), T2 (defaults,
// vecino en la MISMA base física: Shared) y T3 (America/New_York, DST).
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "../classes/booking/testing/pg-it-harness";
import {
  B1B,
  createClient,
  createMember,
  createMembership,
  createSession,
  dayOffset,
  invariantViolations,
  key,
  MODALITIES_ON,
  NO_VIOLATIONS,
  seedBase,
  setPolicy,
  T1,
  T2,
  TRAINER_A,
  TRAINER_C,
} from "../classes/booking/testing/booking-fixtures";
import { zonedInstant } from "../classes/booking/booking-eligibility";

const h = vi.hoisted(() => ({
  /** Usuario de sesión que devolverá el próximo requireClient() (se lee de forma síncrona). */
  user: null as null | { id: string },
  /** userId → contexto operacional (tenant efectivo, rol LIVE, PrismaClient). */
  registry: new Map<string, { tenantId: string; gymId: string; role: string; db: unknown }>(),
  disabledModules: [] as string[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions/guards", () => ({
  requireClient: vi.fn(async () => h.user),
}));
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
    requireOperationalContext: vi.fn(async (sessionUser: { id: string }, options: { module?: string } = {}) => {
      if (options.module && h.disabledModules.includes(options.module)) {
        throw new OperationalContextError("MODULE_DISABLED", "Módulo no habilitado para esta organización.", 403);
      }
      const c = h.registry.get(sessionUser.id);
      if (!c) throw new OperationalContextError("RUNTIME_UNAVAILABLE", "No se pudo acceder al entorno de la organización.", 503);
      return {
        context: {
          runtimeMode: "RUNTIME_CLIENT",
          authScope: "RUNTIME_CLIENT",
          effectiveUser: { id: sessionUser.id, tenant_id: c.tenantId, location_id: null, role: c.role, auth_scope: "RUNTIME_CLIENT" },
          organizationId: null,
          tenantId: c.tenantId,
          gymId: c.gymId,
          locationId: null,
          client: c.db,
          readOnly: false,
          commercialContext: null,
        },
        dispose: async () => {},
      };
    }),
  };
});

import { bookClassAction, cancelBookingAction } from "./actions";
import { openPortalContext } from "./portal-context";
import {
  getMyAttendance,
  loadPortalBookings,
  loadPortalMembershipSummary,
  loadPortalSchedule,
  type PortalSchedule,
  type PortalSessionView,
} from "./queries";
import { weekStart } from "./portal-schedule";

type Member = { clientId: string; userId: string | null };

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe.skipIf(!IT_ENABLED)("GYM-3B portal del alumno — integración PostgreSQL real", () => {
  let it3b: ItDatabase;
  let db: PrismaClient;
  let db2: PrismaClient;

  const T3 = "it3b-tenant-ny";
  const B3 = "it3b-branch-ny";
  const TRAINER_NY = "it3b-trainer-ny";
  const CT3 = "it3b-ct-ny";
  const NY = "America/New_York";

  beforeAll(async () => {
    it3b = await createItDatabase();
    db = it3b.db;
    db2 = it3b.extraClient();
    await seedBase(db);
    await setPolicy(db, T1, MODALITIES_ON);
    // T3: gimnasio en Nueva York (DST) con GROUP habilitado.
    await db.runtimeTenant.create({ data: { id: T3, name: "IT NY", slug: "it-ny" } });
    await db.gym.create({ data: { id: T3, tenant_id: T3, name: "IT NY", slug: "it-ny" } });
    await db.branch.create({ data: { id: B3, gym_id: T3, tenant_id: T3, name: "Sede NY" } });
    await db.trainer.create({ data: { id: TRAINER_NY, gym_id: T3, tenant_id: T3, branch_id: B3, first_name: "T", last_name: "NY" } });
    await db.classType.create({ data: { id: CT3, gym_id: T3, tenant_id: T3, name: "Grupal NY" } });
    await setPolicy(db, T3, { timezone: NY, group_booking_enabled: true });
  }, 180_000);

  afterAll(async () => {
    if (db) expect(await invariantViolations(db)).toEqual(NO_VIOLATIONS);
    await it3b?.drop();
    await disconnectAdmin();
  }, 180_000);

  /** Sesión con id UUID (bookClassSchema valida el formato). */
  const newSession = (input: Parameters<typeof createSession>[1]) => createSession(db, { id: randomUUID(), ...input });

  /** Registra el contexto del alumno (tenant efectivo, rol LIVE y conexión). */
  function register(m: Member, opts: { tenant?: string; role?: string; db?: PrismaClient } = {}) {
    const tenant = opts.tenant ?? T1;
    h.registry.set(m.userId!, { tenantId: tenant, gymId: tenant, role: opts.role ?? "client", db: opts.db ?? db });
    return m;
  }

  /** Llama una acción como el alumno `m` (requireClient se resuelve de forma síncrona al invocarla). */
  function as<T>(m: Member, fn: () => Promise<T>): Promise<T> {
    h.user = { id: m.userId! };
    return fn();
  }
  const book = (m: Member, sessionId: string, k = key()) =>
    as(m, () => bookClassAction(undefined, fd({ class_id: sessionId, idempotency_key: k })));
  const cancel = (m: Member, bookingId: string, k = key()) =>
    as(m, () => cancelBookingAction(undefined, fd({ booking_id: bookingId, idempotency_key: k })));

  async function clientRef(m: Member) {
    return db.client.findUniqueOrThrow({
      where: { id: m.clientId },
      select: { id: true, branch_id: true, modality: true, status: true },
    });
  }
  async function schedule(m: Member, date: string, opts: { tenant?: string; now?: Date } = {}): Promise<PortalSchedule> {
    return loadPortalSchedule({ db, tenantId: opts.tenant ?? T1, client: await clientRef(m), week: weekStart(date), now: opts.now });
  }
  function find(s: PortalSchedule, sessionId: string): PortalSessionView | undefined {
    return s.days.flatMap((d) => d.sessions).find((v) => v.id === sessionId);
  }
  const allIds = (s: PortalSchedule) => s.days.flatMap((d) => d.sessions.map((v) => v.id));
  const bookingIdOf = async (sessionId: string, clientId: string) =>
    (await db.classBooking.findUniqueOrThrow({
      where: { scheduled_class_id_client_id: { scheduled_class_id: sessionId, client_id: clientId } },
      select: { id: true },
    })).id;
  const writes = async () => ({
    bookings: await db.classBooking.count(),
    operations: await db.gymBookingOperation.count(),
    events: await db.classBookingEvent.count(),
  });

  // ── A. Consultas autorizadas por modalidad ──────────────────────

  describe("A. visibilidad y elegibilidad", () => {
    const day = dayOffset(3);

    it("A1 NORMAL: solo OPEN de su sede y tenant; cupo desde booked_count; lleno visible como COMPLETO", async () => {
      const m = register(await createMember(db, { withUser: true }));
      const open = await newSession({ date: day, start: "06:00", end: "07:00" });
      const full = await newSession({ date: day, start: "09:00", end: "10:00", capacity: 1 });
      const personalized = await newSession({ date: day, start: "11:00", end: "12:00", kind: "PERSONALIZED", capacity: 1 });
      const group = await newSession({ date: day, start: "13:00", end: "14:00", kind: "GROUP" });
      const otherBranch = await newSession({ date: day, branch: B1B, trainer: "it-trainer-b", start: "15:00", end: "16:00" });
      const otherTenant = await newSession({ tenant: T2, date: day, start: "06:00", end: "07:00" });
      const filler = register(await createMember(db, { withUser: true }));
      expect(await book(filler, full)).toEqual({ success: true });

      const s = await schedule(m, day);
      const ids = allIds(s);
      expect(ids).toEqual(expect.arrayContaining([open, full]));
      expect(ids).not.toContain(personalized);
      expect(ids).not.toContain(group);
      expect(ids).not.toContain(otherBranch);
      expect(ids).not.toContain(otherTenant);
      expect(find(s, open)!.evaluation.state).toBe("AVAILABLE");
      expect(find(s, full)).toMatchObject({ booked: 1, capacity: 1 });
      expect(find(s, full)!.evaluation).toMatchObject({ state: "FULL", canBook: false });
      expect(s.days).toHaveLength(7);
    });

    it("A2 PERSONALIZED: solo sesiones del entrenador autorizado por la membresía (privacidad); sin entrenador → aviso y nada", async () => {
      const m = register(await createMember(db, { withUser: true, modality: "PERSONALIZED", sessionsTotal: 4, trainerId: TRAINER_A }));
      const mine = await newSession({ date: day, start: "06:00", end: "07:00", kind: "PERSONALIZED", capacity: 1 });
      const otherTrainer = await newSession({ date: day, start: "06:00", end: "07:00", kind: "PERSONALIZED", capacity: 1, trainer: TRAINER_C });
      const open = await newSession({ date: day, start: "08:00", end: "09:00" });
      const s = await schedule(m, day);
      expect(allIds(s)).toContain(mine);
      expect(allIds(s)).not.toContain(otherTrainer);
      expect(allIds(s)).not.toContain(open);
      expect(find(s, mine)!.evaluation.state).toBe("AVAILABLE");
      expect(s.allowedKind).toBe("PERSONALIZED");

      const noTrainer = register(await createMember(db, { withUser: true, modality: "PERSONALIZED", sessionsTotal: 4, trainerId: null }));
      const s2 = await schedule(noTrainer, day);
      expect(allIds(s2)).toEqual([]);
      expect(s2.notices.join(" ")).toMatch(/entrenador/);
      // Por manipulación del id: el servicio lo rechaza.
      expect(await book(noTrainer, mine)).toEqual({ error: "Tu membresía no incluye sesiones con este entrenador." });
    });

    it("A3 GROUP: solo GROUP; plazas disponibles; snapshot NORMAL → NO ELEGIBLE por modalidad", async () => {
      const m = register(await createMember(db, { withUser: true, modality: "GROUP", sessionsTotal: 8 }));
      const g = await newSession({ date: day, start: "17:00", end: "18:00", kind: "GROUP", capacity: 8 });
      const open = await newSession({ date: day, start: "17:00", end: "18:00" });
      const s = await schedule(m, day);
      expect(allIds(s)).toContain(g);
      expect(allIds(s)).not.toContain(open);
      expect(find(s, g)!.evaluation.state).toBe("AVAILABLE");

      const wrongSnapshot = register(await createClient(db, { withUser: true, modality: "GROUP" }));
      await createMembership(db, { clientId: wrongSnapshot.clientId, modality: "NORMAL" });
      const s2 = await schedule(wrongSnapshot, day);
      expect(find(s2, g)!.evaluation.block).toMatchObject({ kind: "membership", code: "MODALITY_MISMATCH" });
    });

    it("A4 NORMAL sin membresía / vencida / suspendida / pago incompatible → NO ELEGIBLE por membresía", async () => {
      const open = await newSession({ date: day, start: "19:00", end: "20:00" });
      const none = register(await createClient(db, { withUser: true }));
      const expired = register(await createMember(db, { withUser: true, startOffsetDays: -40, endOffsetDays: -1 }));
      const suspended = register(await createClient(db, { withUser: true }));
      await createMembership(db, { clientId: suspended.clientId, status: "suspended" });
      const unpaid = register(await createMember(db, { withUser: true, payment: "pending" }));
      for (const m of [none, expired, suspended, unpaid]) {
        const v = find(await schedule(m, day), open)!;
        expect(v.evaluation).toMatchObject({ state: "NOT_ELIGIBLE", canBook: false });
        expect(v.evaluation.block?.code).toBe("NO_ELIGIBLE_MEMBERSHIP");
      }
    });

    it("A5 sesión cancelada → CANCELADO; fecha pasada → FINALIZADO (sin acciones)", async () => {
      const m = register(await createMember(db, { withUser: true }));
      const cancelled = await newSession({ date: day, start: "21:00", end: "22:00", status: "cancelled" });
      const past = await newSession({ date: dayOffset(-1), start: "07:00", end: "08:00" });
      expect(find(await schedule(m, day), cancelled)!.evaluation.state).toBe("CANCELLED");
      const pastView = find(await schedule(m, dayOffset(-1)), past)!;
      expect(pastView.evaluation).toMatchObject({ state: "FINISHED", canBook: false, canCancel: false });
    });

    it("A6 modalidad deshabilitada en el gimnasio (T2 defaults): aviso y ninguna sesión GROUP nueva", async () => {
      const m = register(await createMember(db, { withUser: true, tenant: T2, modality: "GROUP", sessionsTotal: 4 }), { tenant: T2 });
      const g = await newSession({ tenant: T2, date: day, start: "07:00", end: "08:00", kind: "GROUP" });
      const s = await schedule(m, day, { tenant: T2 });
      expect(allIds(s)).not.toContain(g);
      expect(s.notices).toContain("Las reservas de esta modalidad no están habilitadas en el gimnasio.");
      expect(await book(m, g)).toEqual({ error: "Las reservas de esta modalidad no están habilitadas en el gimnasio." });
    });
  });

  // ── B. Seguridad ────────────────────────────────────────────────

  describe("B. seguridad del portal", () => {
    const day = dayOffset(4);

    it("B1 alumno A no ve ni cancela la reserva de B (cero escrituras)", async () => {
      const a = register(await createMember(db, { withUser: true }));
      const b = register(await createMember(db, { withUser: true }));
      const s = await newSession({ date: day, start: "06:00", end: "07:00" });
      expect(await book(b, s)).toEqual({ success: true });
      const bBooking = await bookingIdOf(s, b.clientId);

      const aBookings = await loadPortalBookings({ db, tenantId: T1, client: await clientRef(a) });
      expect([...aBookings.upcoming, ...aBookings.past, ...aBookings.cancelled].map((v) => v.ownBookingId)).not.toContain(bBooking);
      const view = find(await schedule(a, day), s)!;
      expect(view.ownBookingId).toBeNull(); // A ve la sesión, nunca la reserva de B

      const before = await writes();
      expect(await cancel(a, bBooking)).toEqual({ error: "Clase o reserva no encontrada." });
      expect(await writes()).toEqual(before);
      expect((await db.classBooking.findUniqueOrThrow({ where: { id: bBooking } })).booking_status).toBe("confirmed");
    });

    it("B2 NORMAL envía id PERSONALIZED; GROUP envía id OPEN; otra sede → rechazados sin escrituras", async () => {
      const normal = register(await createMember(db, { withUser: true }));
      const group = register(await createMember(db, { withUser: true, modality: "GROUP", sessionsTotal: 4 }));
      const p = await newSession({ date: day, start: "08:00", end: "09:00", kind: "PERSONALIZED", capacity: 1 });
      const o = await newSession({ date: day, start: "08:00", end: "09:00" });
      const otherBranch = await newSession({ date: day, branch: B1B, trainer: "it-trainer-b", start: "10:00", end: "11:00" });
      const before = await writes();
      expect(await book(normal, p)).toEqual({ error: "Tu membresía no corresponde a esta clase." });
      expect(await book(group, o)).toEqual({ error: "Tu membresía no corresponde a esta clase." });
      expect(await book(normal, otherBranch)).toEqual({ error: "Clase no disponible o no pertenece a tu sucursal." });
      expect(await writes()).toEqual(before);
    });

    it("B3 alumno de T1 envía id de sesión de T2 → rechazado, cero escrituras", async () => {
      const a = register(await createMember(db, { withUser: true }));
      const t2Session = await newSession({ tenant: T2, date: day, start: "12:00", end: "13:00" });
      const before = await writes();
      expect(await book(a, t2Session)).toEqual({ error: "Clase o reserva no encontrada." });
      expect(await writes()).toEqual(before);
    });

    it("B4 Shared: calendario e historial de T2 sin ninguna fila de T1 (misma base física)", async () => {
      const t1 = register(await createMember(db, { withUser: true }));
      const t1Session = await newSession({ date: day, start: "14:00", end: "15:00" });
      expect(await book(t1, t1Session)).toEqual({ success: true });
      const t2 = register(await createMember(db, { withUser: true, tenant: T2 }), { tenant: T2 });
      const t2Session = await newSession({ tenant: T2, date: day, start: "14:00", end: "15:00" });
      const s = await schedule(t2, day, { tenant: T2 });
      expect(allIds(s)).toContain(t2Session);
      const t1Ids = new Set((await db.scheduledClass.findMany({ where: { tenant_id: T1 }, select: { id: true } })).map((r) => r.id));
      expect(allIds(s).filter((id) => t1Ids.has(id))).toEqual([]);
      // Contexto manipulado: el alumno de T1 leído con el tenant de T2 no obtiene sesiones de T1.
      const crossed = await loadPortalSchedule({ db, tenantId: T2, client: await clientRef(t1), week: weekStart(day) });
      expect(allIds(crossed).filter((id) => t1Ids.has(id))).toEqual([]);
    });

    it("B5 openPortalContext: tenant del contexto distinto al del Client → sin perfil; rol LIVE trainer → denegado; módulo deshabilitado → denegado", async () => {
      const m = register(await createMember(db, { withUser: true }), { tenant: T2 });
      expect(await openPortalContext({ id: m.userId } as never, { module: "gym.classes" })).toMatchObject({ ok: false, reason: "NO_PROFILE" });
      register(m, { tenant: T1, role: "trainer" });
      expect(await openPortalContext({ id: m.userId } as never, { module: "gym.classes" })).toMatchObject({ ok: false, reason: "FORBIDDEN" });
      register(m, { tenant: T1 });
      h.disabledModules = ["gym.classes"];
      try {
        expect(await openPortalContext({ id: m.userId } as never, { module: "gym.classes" })).toMatchObject({ ok: false, reason: "MODULE_DISABLED" });
        expect(await book(m, await newSession({ date: day, start: "16:00", end: "17:00" }))).toEqual({
          error: "Módulo no habilitado para esta organización.",
        });
      } finally {
        h.disabledModules = [];
      }
      const okAccess = await openPortalContext({ id: m.userId } as never, { module: "gym.classes" });
      expect(okAccess.ok && okAccess.client.id).toBe(m.clientId);
    });

    it("B6 datos privados: asistencia sin notas internas; reservas sin motivo del staff", async () => {
      const m = register(await createMember(db, { withUser: true }));
      const s = await newSession({ date: dayOffset(-2), start: "07:00", end: "08:00" });
      await db.classAttendance.create({
        data: { scheduled_class_id: s, client_id: m.clientId, attendance_status: "late", notes: "nota interna", training_notes: "privado del entrenador" },
      });
      const att = await getMyAttendance(m.clientId, db, T1);
      expect(att).toHaveLength(1);
      expect(att[0].attendance_status).toBe("late");
      expect(JSON.stringify(att)).not.toMatch(/nota interna|privado del entrenador/);
      expect(Object.keys(att[0])).not.toEqual(expect.arrayContaining(["notes", "training_notes", "recorded_by_user_id"]));

      const s2 = await newSession({ date: day, start: "18:00", end: "19:00" });
      expect(await book(m, s2)).toEqual({ success: true });
      await db.classBooking.update({ where: { id: await bookingIdOf(s2, m.clientId) }, data: { notes: "comentario admin" } });
      const views = await loadPortalBookings({ db, tenantId: T1, client: await clientRef(m) });
      expect(JSON.stringify(views)).not.toMatch(/comentario admin/);
    });
  });

  // ── C. Integración: reservar, cancelar, reactivar, saldo ────────

  describe("C. flujo de reserva", () => {
    const day = dayOffset(5);

    it("C1 GROUP: reservar → RESERVADO y saldo baja; cancelar en política → libera; reservar de nuevo → reactivación", async () => {
      const m = register(await createMember(db, { withUser: true, modality: "GROUP", sessionsTotal: 3 }));
      const g = await newSession({ date: day, start: "06:00", end: "07:00", kind: "GROUP", capacity: 5 });
      expect(await book(m, g)).toEqual({ success: true });
      let v = find(await schedule(m, day), g)!;
      expect(v.evaluation).toMatchObject({ state: "BOOKED", canCancel: true, cancelWarning: null });
      expect(v.booked).toBe(1);
      let summary = await loadPortalMembershipSummary({ db, tenantId: T1, client: await clientRef(m) });
      expect(summary.primary).toMatchObject({ modality: "GROUP", sessionsTotal: 3, sessionsUsed: 1, sessionsRemaining: 2 });
      expect((await loadPortalBookings({ db, tenantId: T1, client: await clientRef(m) })).upcoming.map((b) => b.id)).toContain(g);

      expect(await cancel(m, v.ownBookingId!)).toEqual({ success: true });
      v = find(await schedule(m, day), g)!;
      expect(v.evaluation).toMatchObject({ state: "AVAILABLE", canBook: true, isReactivation: true });
      expect(v.ownCancellation).toBe("CLIENT_IN_POLICY");
      summary = await loadPortalMembershipSummary({ db, tenantId: T1, client: await clientRef(m) });
      expect(summary.primary!.sessionsRemaining).toBe(3);
      expect((await loadPortalBookings({ db, tenantId: T1, client: await clientRef(m) })).cancelled.map((b) => b.id)).toContain(g);

      expect(await book(m, g)).toEqual({ success: true });
      const events = await db.classBookingEvent.findMany({ where: { scheduled_class_id: g }, orderBy: { occurred_at: "asc" }, select: { event_type: true } });
      expect(events.map((e) => e.event_type)).toEqual(["BOOKED", "CANCELLED", "REACTIVATED"]);
      expect(find(await schedule(m, day), g)!.evaluation.state).toBe("BOOKED");
    });

    it("C2 PERSONALIZED: última sesión disponible → reserva; después MEMBERSHIP_EXHAUSTED en calendario y en la acción", async () => {
      const m = register(await createMember(db, { withUser: true, modality: "PERSONALIZED", sessionsTotal: 1, trainerId: TRAINER_C }));
      const s1 = await newSession({ date: day, start: "08:00", end: "09:00", kind: "PERSONALIZED", capacity: 1, trainer: TRAINER_C });
      const s2 = await newSession({ date: day, start: "10:00", end: "11:00", kind: "PERSONALIZED", capacity: 1, trainer: TRAINER_C });
      expect(find(await schedule(m, day), s1)!.evaluation.state).toBe("AVAILABLE");
      expect(await book(m, s1)).toEqual({ success: true });
      const v2 = find(await schedule(m, day), s2)!;
      expect(v2.evaluation).toMatchObject({ state: "NOT_ELIGIBLE", canBook: false });
      expect(v2.evaluation.block).toMatchObject({ kind: "membership", code: "MEMBERSHIP_EXHAUSTED" });
      expect(await book(m, s2)).toEqual({ error: "Ya usaste todas las sesiones de tu membresía." });
      const summary = await loadPortalMembershipSummary({ db, tenantId: T1, client: await clientRef(m) });
      expect(summary.primary).toMatchObject({ sessionsRemaining: 0, trainerMissing: false, trainerName: "T C" });
    });

    it("C3 cancelación tardía: aviso de descuento y la sesión sigue consumida", async () => {
      const m = register(await createMember(db, { withUser: true, modality: "GROUP", sessionsTotal: 2 }));
      const soon = await newSession({ startsAt: new Date(Date.now() + 60 * 60_000), kind: "GROUP", capacity: 4 });
      expect(await book(m, soon)).toEqual({ success: true });
      const today = dayOffset(0);
      const v = (await loadPortalBookings({ db, tenantId: T1, client: await clientRef(m) })).upcoming.find((b) => b.id === soon)!;
      expect(v.date === today || v.date === dayOffset(1)).toBe(true);
      expect(v.evaluation.canCancel).toBe(true);
      expect(v.evaluation.cancelWarning).toMatch(/tardía/);
      expect(await cancel(m, v.ownBookingId!)).toEqual({ success: true });
      const summary = await loadPortalMembershipSummary({ db, tenantId: T1, client: await clientRef(m) });
      expect(summary.primary!.sessionsUsed).toBe(1);
    });
  });

  // ── D. Concurrencia e idempotencia (acciones reales, conexiones independientes) ──

  describe("D. concurrencia e idempotencia", () => {
    const day = dayOffset(6);

    it("D1 dos alumnos ven el último cupo; ambos reservan a la vez → uno gana, el otro SESSION_FULL y ve COMPLETO", async () => {
      const a = register(await createMember(db, { withUser: true, modality: "GROUP", sessionsTotal: 4 }), { db });
      const b = register(await createMember(db, { withUser: true, modality: "GROUP", sessionsTotal: 4 }), { db: db2 });
      const s = await newSession({ date: day, start: "06:00", end: "07:00", kind: "GROUP", capacity: 1 });
      expect(find(await schedule(a, day), s)!.evaluation.state).toBe("AVAILABLE");
      expect(find(await schedule(b, day), s)!.evaluation.state).toBe("AVAILABLE");
      const [ra, rb] = await Promise.all([book(a, s), book(b, s)]);
      const results = [ra, rb];
      expect(results.filter((r) => "success" in r)).toHaveLength(1);
      expect(results.filter((r) => "error" in r)).toEqual([{ error: "Esta clase ya no tiene cupo disponible." }]);
      const loser = "error" in ra ? a : b;
      expect(find(await schedule(loser, day), s)!.evaluation).toMatchObject({ state: "FULL", canBook: false });
      expect((await db.scheduledClass.findUniqueOrThrow({ where: { id: s } })).booked_count).toBe(1);
    });

    it("D2 doble clic del mismo intento (misma key, dos conexiones) → una reserva, una operación; reintento = replay; nueva key = ALREADY_BOOKED", async () => {
      const m = register(await createMember(db, { withUser: true }));
      const s = await newSession({ date: day, start: "08:00", end: "09:00" });
      const k = key();
      const before = await writes();
      h.registry.get(m.userId!)!.db = db;
      const first = book(m, s, k);
      h.registry.get(m.userId!)!.db = db2;
      const second = book(m, s, k);
      expect(await Promise.all([first, second])).toEqual([{ success: true }, { success: true }]);
      expect(await book(m, s, k)).toEqual({ success: true });
      const after = await writes();
      expect(after.bookings - before.bookings).toBe(1);
      expect(after.operations - before.operations).toBe(1);
      expect(await book(m, s, key())).toEqual({ error: "Ya tienes una reserva confirmada para esta clase." });
    });

    it("D3 cancelación simultánea desde dos solicitudes → una cancela; la otra 'ya cancelada'; una sola liberación", async () => {
      const m = register(await createMember(db, { withUser: true, modality: "GROUP", sessionsTotal: 2 }));
      const s = await newSession({ date: day, start: "10:00", end: "11:00", kind: "GROUP", capacity: 3 });
      expect(await book(m, s)).toEqual({ success: true });
      const bookingId = await bookingIdOf(s, m.clientId);
      h.registry.get(m.userId!)!.db = db;
      const c1 = cancel(m, bookingId);
      h.registry.get(m.userId!)!.db = db2;
      const c2 = cancel(m, bookingId);
      const results = await Promise.all([c1, c2]);
      expect(results.filter((r) => "success" in r)).toHaveLength(1);
      expect(results.filter((r) => "error" in r)).toEqual([{ error: "Esta reserva ya está cancelada." }]);
      const m2 = await db.clientMembership.findFirstOrThrow({ where: { client_id: m.clientId }, select: { sessions_used: true } });
      expect(m2.sessions_used).toBe(0);
      expect((await db.scheduledClass.findUniqueOrThrow({ where: { id: s } })).booked_count).toBe(0);
    });

    it("D4 cambio de modalidad del cliente entre la consulta y la reserva → la acción rechaza; el calendario se actualiza", async () => {
      const m = register(await createMember(db, { withUser: true }));
      const s = await newSession({ date: day, start: "12:00", end: "13:00" });
      expect(find(await schedule(m, day), s)!.evaluation.state).toBe("AVAILABLE");
      await db.client.update({ where: { id: m.clientId }, data: { modality: "GROUP" } });
      expect(await book(m, s)).toEqual({ error: "Tu membresía no corresponde a esta clase." });
      const after = await schedule(m, day);
      expect(after.allowedKind).toBe("GROUP");
      expect(allIds(after)).not.toContain(s);
    });

    it("D5 cambio de política durante la consulta del calendario (GROUP deshabilitado) → MODALITY_DISABLED y aviso", async () => {
      await setPolicy(db, T2, { timezone: "America/El_Salvador", group_booking_enabled: true });
      const m = register(await createMember(db, { withUser: true, tenant: T2, modality: "GROUP", sessionsTotal: 4 }), { tenant: T2 });
      const g = await newSession({ tenant: T2, date: day, start: "14:00", end: "15:00", kind: "GROUP" });
      expect(find(await schedule(m, day, { tenant: T2 }), g)!.evaluation.state).toBe("AVAILABLE");
      await setPolicy(db, T2, { group_booking_enabled: false });
      expect(await book(m, g)).toEqual({ error: "Las reservas de esta modalidad no están habilitadas en el gimnasio." });
      const after = await schedule(m, day, { tenant: T2 });
      expect(allIds(after)).not.toContain(g);
      expect(after.notices).toHaveLength(1);
      await setPolicy(db, T2, { timezone: null, group_booking_enabled: false });
    });
  });

  // ── E. Timezone y compatibilidad histórica ──────────────────────

  describe("E. timezone y OPEN heredado", () => {
    it("E1 America/New_York: 07:00 antes y después del fin de DST; día del gimnasio correcto", async () => {
      const m = register(await createClient(db, { withUser: true, tenant: T3, branch: B3, modality: "GROUP" }), { tenant: T3 });
      const mk = async (date: string) => {
        const id = `it3b-ny-${date}`;
        await db.scheduledClass.create({
          data: {
            id,
            gym_id: T3,
            tenant_id: T3,
            branch_id: B3,
            class_type_id: CT3,
            trainer_id: TRAINER_NY,
            title: "Grupal NY",
            class_date: new Date(`${date}T00:00:00.000Z`),
            start_time: "07:00",
            end_time: "08:00",
            capacity: 6,
            session_kind: "GROUP",
            starts_at: zonedInstant(date, "07:00", NY),
            ends_at: zonedInstant(date, "08:00", NY),
          },
        });
        return id;
      };
      const before = await mk("2026-10-30");
      const after = await mk("2026-11-03");
      const now = new Date("2026-10-28T12:00:00.000Z");
      const w1 = await schedule(m, "2026-10-30", { tenant: T3, now });
      const w2 = await schedule(m, "2026-11-03", { tenant: T3, now });
      expect(find(w1, before)).toMatchObject({ date: "2026-10-30", start: "07:00", end: "08:00" });
      expect(find(w2, after)).toMatchObject({ date: "2026-11-03", start: "07:00", end: "08:00" });
      expect(w1.days.find((d) => d.date === "2026-10-30")!.sessions.map((s) => s.id)).toContain(before);
      expect(w2.days.find((d) => d.date === "2026-11-03")!.sessions.map((s) => s.id)).toContain(after);
      expect(w2.week).toMatchObject({ start: "2026-11-02", end: "2026-11-08" });
    });

    it("E2 OPEN histórico: reserva/cancelación heredadas (sin canal) y asistencia aparecen en el historial", async () => {
      const m = register(await createMember(db, { withUser: true, startOffsetDays: -60 }));
      const old1 = await newSession({ date: dayOffset(-10), start: "07:00", end: "08:00" });
      const old2 = await newSession({ date: dayOffset(-9), start: "07:00", end: "08:00" });
      const legacy = await db.classBooking.create({ data: { scheduled_class_id: old1, client_id: m.clientId, booking_status: "confirmed" } });
      await db.classBooking.create({ data: { scheduled_class_id: old2, client_id: m.clientId, booking_status: "cancelled" } });
      await db.classAttendance.create({ data: { scheduled_class_id: old1, client_id: m.clientId, attendance_status: "attended", booking_id: legacy.id } });
      const views = await loadPortalBookings({ db, tenantId: T1, client: await clientRef(m) });
      const past = views.past.find((b) => b.id === old1)!;
      expect(past).toMatchObject({ bookingStatus: "confirmed", attendance: "attended", kind: "OPEN" });
      expect(past.evaluation).toMatchObject({ state: "FINISHED", canCancel: false });
      const cancelled = views.cancelled.find((b) => b.id === old2)!;
      expect(cancelled.ownCancellation).toBeNull();
      expect(cancelled.evaluation.canBook).toBe(false);
      const summary = await loadPortalMembershipSummary({ db, tenantId: T1, client: await clientRef(m) });
      expect(summary.primary).toMatchObject({ modality: "NORMAL", sessionsTotal: null, sessionsRemaining: null });
    });

    it("E3 OPEN con apply_policy_to_open = false: sin horizonte nuevo (clase a 20 días sigue reservable) y cancelación el mismo día", async () => {
      const m = register(await createMember(db, { withUser: true, endOffsetDays: 40 }));
      const far = await newSession({ date: dayOffset(20), start: "07:00", end: "08:00" });
      expect(find(await schedule(m, dayOffset(20)), far)!.evaluation.state).toBe("AVAILABLE");
      expect(await book(m, far)).toEqual({ success: true });
      const todaySession = await newSession({ date: dayOffset(0), start: "00:00", end: "00:30" });
      expect(await book(m, todaySession)).toEqual({ success: true });
      const v = find(await schedule(m, dayOffset(0)), todaySession)!;
      expect(v.evaluation).toMatchObject({ state: "BOOKED", canCancel: true });
      expect(await cancel(m, v.ownBookingId!)).toEqual({ success: true });
    });
  });

  it("Z invariantes de contadores y bitácora sin violaciones", async () => {
    expect(await invariantViolations(db)).toEqual(NO_VIOLATIONS);
  });
});
