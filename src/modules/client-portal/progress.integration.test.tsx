// ─────────────────────────────────────────────────────────────────
// GYM-5B — página REAL /portal/progreso contra PostgreSQL desechable (se
// omite sin GYM_BOOKING_IT_*). Solo se sustituyen las fronteras externas:
// sesión Auth.js, revalidación LIVE del runtime y contexto comercial. El
// Prisma global lanza si se usa (la página debe leer del runtime efectivo).
//
//  G1  resumen, evolución, planes, asistencia y retroalimentación del alumno
//  G2  privacidad: sin notas privadas, motivos, ids ni datos de otro alumno
//  G3  otro alumno / otro tenant / rol LIVE cambiado
//  G4  módulos: weekly_plans apagado no consulta nada; classes apagado no
//      consulta asistencia; base sin tablas de GYM-5A no se rompe
//  G5  casos especiales: sin datos, sin plan, membresía vencida, sin zona
//      horaria, período, fecha local en el límite del día
//  G6  riesgos de datos: ocurrencias anteriores al inicio del seguimiento,
//      planes heredados solapados, topes de consulta
//  G7  revisión externa: coherencia con GYM-5A (caso real de Sofía) y
//      consultas truncadas sin cifras parciales presentadas como completas
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PrismaClient } from "@prisma/client";

const h = vi.hoisted(() => ({
  db: { current: null as unknown },
  jwt: { current: null as null | Record<string, unknown> },
  disabled: { current: new Set<string>() },
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, { get: (_t, p) => (p === "then" ? undefined : () => { throw new Error(`global prisma.${String(p)}`); }) }),
}));
vi.mock("@/lib/auth/auth", () => ({ auth: async () => (h.jwt.current ? { user: h.jwt.current } : null) }));
vi.mock("@/modules/platform/runtime/runtime-organization-access-gate", () => ({
  enforceRuntimeOrganizationAccess: vi.fn(async () => {}),
}));
vi.mock("@/modules/platform/runtime/commercial-enforcement", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireOrganizationModule: vi.fn(async (_t: string, code: string) => {
    if (h.disabled.current.has(code)) throw new Error(`NEXT_REDIRECT:/dashboard?commercial_error=module_not_enabled`);
  }),
  resolveCommercialEnforcementContext: vi.fn(async () => ({
    mode: "MANAGED",
    effectiveModules: new Map(["gym.weekly_plans", "gym.classes"].map((c) => [c, { enabled: !h.disabled.current.has(c) }])),
  })),
}));
vi.mock("@/modules/platform/runtime/require-runtime-organization-context", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireRuntimeOrganizationContext: async (user: { id: string; tenant_id: string; location_id: string | null }) => {
    const db = h.db.current as PrismaClient;
    const live = await db.user.findUnique({ where: { id: user.id }, select: { status: true, tenant_id: true, role: true } });
    if (!live || live.status !== "active" || live.tenant_id !== user.tenant_id) throw new Error("RUNTIME_IDENTITY");
    return {
      context: {
        organization: { id: "it-org", name: "IT", tenantId: user.tenant_id },
        tenantId: user.tenant_id,
        locationId: user.location_id,
        runtimeDb: db,
        authScope: "RUNTIME_CLIENT",
        role: live.role,
      },
      dispose: async () => {},
    };
  },
}));

import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "@/modules/classes/booking/testing/pg-it-harness";
import { createClient, createMember, createSession, setPolicy, T1, T2, TZ } from "@/modules/classes/booking/testing/booking-fixtures";
import { seedPlan, seedPlanWorld, W } from "@/modules/weekly-plans/testing/plan-it-harness";
import { recordClientReport, recordTrainerExecution } from "@/modules/weekly-plans/training-execution-service";
import ProgresoPage from "@/app/(portal)/portal/progreso/page";
import { PROGRESS_PLANS_LIMIT, PROGRESS_QUERY_LIMITS } from "@/modules/client-portal/progress-queries";
import { addDays } from "@/modules/weekly-plans/training-tracking-rules";
import { loadPlanTracking } from "@/modules/weekly-plans/training-tracking-queries";

const NOW = "2026-03-11T15:00:00.000Z"; // miércoles 09:00 en El Salvador
const TODAY = "2026-03-11";
const TRACKING_EPOCH = "2026-01-01T18:00:00.000Z";
const SECRET_NOTE = "NOTA-PRIVADA-ENTRENADOR-5B";
const SECRET_ACT = "NOTA-PRIVADA-ACTIVIDAD-5B";
const SECRET_REASON = "MOTIVO-PRIVADO-CORRECCION-5B";
const SECRET_PLAN_NOTE = "NOTA-INTERNA-PLAN-5B";
const SECRET_CLIENT_NOTE = "NOTA-INTERNA-CLIENTE-5B";
const SECRET_RECEPTION = "NOTA-RECEPCION-5B";
const FEEDBACK_A = "Excelente técnica 5B";
const FEEDBACK_B = "FEEDBACK-DEL-ALUMNO-B";
const FEEDBACK_C = "FEEDBACK-OCULTO-POR-MEMBRESIA";
const ACTOR = "it-user-tr1-actor-5b";

type Role = "client" | "reception";

function jwt(userId: string, role: Role, tenant: string = T1) {
  h.jwt.current = {
    id: userId,
    name: "IT",
    email: `${userId}@it.invalid`,
    role,
    tenant_id: tenant,
    location_id: tenant === T1 ? W.B1 : W.BT2,
    auth_scope: "RUNTIME_CLIENT",
    organization_id: "it-org",
  };
}

const page = (periodo?: string) => ProgresoPage({ searchParams: Promise.resolve(periodo ? { periodo } : {}) });
const render = async (periodo?: string) => renderToStaticMarkup(await page(periodo));

/** Proxy del runtime que registra qué delegados se usan (y opcionalmente sustituye alguno). */
function spyDb(db: PrismaClient, override: Record<string, unknown> = {}) {
  const used = new Set<string>();
  const proxy = new Proxy(db, {
    get(target, prop, receiver) {
      if (typeof prop === "string") used.add(prop);
      if (typeof prop === "string" && prop in override) return override[prop];
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return { proxy: proxy as PrismaClient, used };
}

function ok(r: { ok: boolean }) {
  expect(r).toMatchObject({ ok: true });
}

describe.skipIf(!IT_ENABLED)("GYM-5B — /portal/progreso (PostgreSQL real)", () => {
  let it5: ItDatabase;
  let db: PrismaClient;
  let a: { clientId: string; userId: string };
  let b: { clientId: string; userId: string };
  let c: { clientId: string; userId: string };
  let d: { clientId: string; userId: string };
  let e: { clientId: string; userId: string };
  let f: { clientId: string; userId: string };
  let g: { clientId: string; userId: string };
  let t2User: string;

  async function attend(clientId: string, date: string, status: "attended" | "late" | "absent" | "cancelled", sessionId?: string) {
    const sid = sessionId ?? (await createSession(db, { branch: W.B1, trainer: W.TR1, date, kind: "OPEN" }));
    const row = await db.classAttendance.create({
      data: { tenant_id: T1, scheduled_class_id: sid, client_id: clientId, attendance_status: status, training_notes: SECRET_NOTE, notes: SECRET_RECEPTION },
    });
    return { sessionId: sid, attendanceId: row.id };
  }

  const trainer = (planId: string, dayId: string, date: string, status: "completed" | "partial" | "skipped", extra: { feedback?: string; reason?: string; attendanceId?: string } = {}) =>
    recordTrainerExecution(db, {
      tenantId: T1, planId, planDayId: dayId, localDate: date, status, feedback: extra.feedback ?? null, reason: extra.reason ?? null,
      attendanceId: extra.attendanceId ?? null, actor: { userId: ACTOR, role: "trainer" }, timezone: TZ, today: TODAY,
    });
  const self = (clientId: string, userId: string, dayId: string, date: string, status: "completed" | "partial" | "skipped") =>
    recordClientReport(db, { tenantId: T1, clientId, planDayId: dayId, localDate: date, status, comment: null, actorUserId: userId, timezone: TZ, today: TODAY });

  beforeAll(async () => {
    it5 = await createItDatabase();
    db = it5.db;
    h.db.current = db;
    await seedPlanWorld(db);
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
    const goal = await db.goal.create({ data: { name: `Hipertrofia-${crypto.randomUUID().slice(0, 6)}`, description: "Ganar fuerza de forma progresiva" } });

    const member = async () => {
      const m = await createMember(db, { id: crypto.randomUUID(), branch: W.B1, withUser: true });
      return { clientId: m.clientId, userId: m.userId! };
    };

    // ── Alumno A: historial completo ─────────────────────────────
    a = await member();
    await db.client.update({ where: { id: a.clientId }, data: { goal_id: goal.id, notes: SECRET_CLIENT_NOTE } });
    const march = await seedPlan(db, { start: "2026-03-02", end: "2026-04-26", clientId: a.clientId, weekdays: [1, 3], trainerId: W.TR1 });
    await db.clientWeeklyPlan.update({ where: { id: march.planId }, data: { notes: SECRET_PLAN_NOTE } });
    const s0302 = await attend(a.clientId, "2026-03-02", "attended");
    await attend(a.clientId, "2026-03-04", "late");
    await attend(a.clientId, "2026-03-09", "absent");
    await attend(a.clientId, "2026-03-10", "cancelled");
    await attend(a.clientId, "2026-02-10", "attended");
    const act = crypto.randomUUID();
    await db.gymActivity.create({ data: { id: act, tenant_id: T1, name: `Remo-${act}` } });
    await db.classAttendanceActivity.create({ data: { tenant_id: T1, attendance_id: s0302.attendanceId, activity_id: act, activity_name: "Remo", notes: SECRET_ACT } });
    // 02: corrección con motivo privado; el estado final del entrenador (completed) vincula la asistencia.
    ok(await trainer(march.planId, march.days[1], "2026-03-02", "skipped"));
    ok(await trainer(march.planId, march.days[1], "2026-03-02", "completed", { feedback: FEEDBACK_A, reason: SECRET_REASON, attendanceId: s0302.attendanceId }));
    // 04: el alumno dice omitido, el entrenador registra parcial (prevalece).
    ok(await self(a.clientId, a.userId, march.days[3], "2026-03-04", "skipped"));
    ok(await trainer(march.planId, march.days[3], "2026-03-04", "partial"));
    // 09: solo autorreporte.
    ok(await self(a.clientId, a.userId, march.days[1], "2026-03-09", "completed"));
    // 11 (hoy): pendiente.

    // Febrero: martes y viernes (8 vencidos), 1 completado, 1 omitido.
    const feb = await seedPlan(db, { start: "2026-02-02", end: "2026-02-27", clientId: a.clientId, weekdays: [2, 5], trainerId: W.TR1 });
    ok(await trainer(feb.planId, feb.days[5], "2026-02-06", "completed"));
    ok(await trainer(feb.planId, feb.days[5], "2026-02-13", "skipped"));
    // Enero: desactivado por el gimnasio, con un completado: no suma al resumen.
    const jan = await seedPlan(db, { start: "2026-01-05", end: "2026-01-30", clientId: a.clientId, weekdays: [1], trainerId: W.TR1, status: "inactive" });
    ok(await trainer(jan.planId, jan.days[1], "2026-01-19", "completed"));
    // Mayo: futuro.
    await seedPlan(db, { start: "2026-05-04", end: "2026-05-31", clientId: a.clientId, weekdays: [1], trainerId: W.TR1 });
    // Diciembre: heredado sin tenant, con estado anterior al seguimiento por fecha.
    const legacyId = crypto.randomUUID();
    await db.clientWeeklyPlan.create({
      data: {
        id: legacyId, gym_id: T1, tenant_id: null, branch_id: W.B1, client_id: a.clientId, trainer_id: W.TR1,
        start_date: new Date("2025-12-01T00:00:00Z"), end_date: new Date("2025-12-26T00:00:00Z"), status: "active",
      },
    });
    await db.clientWeeklyPlanDay.create({ data: { client_weekly_plan_id: legacyId, weekday: 1, session_name: "Legado", execution_status: "completed" } });

    // ── Alumno B (mismo tenant): su propio plan y la MISMA sesión del 02 ──
    b = await member();
    const pb = await seedPlan(db, { start: "2026-03-02", end: "2026-04-26", clientId: b.clientId, weekdays: [1], trainerId: W.TR1 });
    await attend(b.clientId, "2026-03-02", "attended", s0302.sessionId);
    ok(await trainer(pb.planId, pb.days[1], "2026-03-09", "completed", { feedback: FEEDBACK_B }));

    // ── Alumno C: membresía vencida hace más de 3 días hábiles ───
    const mc = await createMember(db, { id: crypto.randomUUID(), branch: W.B1, withUser: true, startOffsetDays: -40, endOffsetDays: -10 });
    c = { clientId: mc.clientId, userId: mc.userId! };
    const pc = await seedPlan(db, { start: "2026-03-02", end: "2026-04-26", clientId: c.clientId, weekdays: [1], trainerId: W.TR1 });
    ok(await trainer(pc.planId, pc.days[1], "2026-03-02", "completed", { feedback: FEEDBACK_C }));
    await attend(c.clientId, "2026-03-04", "attended");

    // ── Alumno D: nuevo, sin registros. Alumno E: asistencias sin plan ──
    d = await member();
    e = await member();
    await attend(e.clientId, "2026-03-05", "attended");

    // ── Usuario de T2 enlazado por error a un Client de T1 ────────
    t2User = `g3-user-t2-${crypto.randomUUID().slice(0, 8)}`;
    await db.user.create({ data: { id: t2User, tenant_id: T2, gym_id: T2, email: `${t2User}@it.invalid`, password_hash: "x", first_name: "U", last_name: "T2", role: "client" } });
    const linked = (await createClient(db, { id: crypto.randomUUID(), tenant: T1, branch: W.B1 })).clientId;
    await db.client.update({ where: { id: linked }, data: { user_id: t2User } });
    await seedPlan(db, { start: "2026-03-02", end: "2026-04-26", clientId: linked, weekdays: [1], trainerId: W.TR1 });

    // ── Alumno F: planes heredados SOLAPADOS (anteriores al lock de 5A) ──
    // P1 lunes 02-mar..29-mar; P2 (más reciente) lunes 09-mar..05-abr.
    f = await member();
    const p1 = await seedPlan(db, { start: "2026-03-02", end: "2026-03-29", clientId: f.clientId, weekdays: [1], trainerId: W.TR1 });
    const p2 = await seedPlan(db, { start: "2026-03-09", end: "2026-04-05", clientId: f.clientId, weekdays: [1], trainerId: W.TR1 });
    ok(await trainer(p1.planId, p1.days[1], "2026-03-02", "completed"));
    ok(await trainer(p2.planId, p2.days[1], "2026-03-09", "completed"));
    ok(await trainer(p1.planId, p1.days[1], "2026-03-09", "skipped")); // doble registro heredado del 09

    // ── Alumno G: plan vigente desplazado del historial por 24 planes futuros ──
    g = await member();
    const pg = await seedPlan(db, { start: "2026-03-02", end: "2026-03-15", clientId: g.clientId, weekdays: [1], trainerId: W.TR1 });
    ok(await trainer(pg.planId, pg.days[1], "2026-03-02", "completed"));
    ok(await trainer(pg.planId, pg.days[1], "2026-03-09", "completed"));
    for (let i = 0; i < PROGRESS_PLANS_LIMIT; i++) {
      const start = addDays("2026-05-04", 7 * i);
      await seedPlan(db, { start, end: addDays(start, 6), clientId: g.clientId, weekdays: [1], trainerId: W.TR1 });
    }
    // Plan antiguo fuera del período y del historial reciente: el historial queda parcial (25 de 26).
    await seedPlan(db, { start: "2025-06-02", end: "2025-06-29", clientId: g.clientId, weekdays: [1], trainerId: W.TR1 });

    // GYM-5A "desplegado" en el tenant antes de todos los planes del escenario
    // (created_at lo fija el reloj real de la BD, no el reloj simulado).
    await db.clientPlanDayExecution.updateMany({ where: { tenant_id: T1 }, data: { created_at: new Date(TRACKING_EPOCH) } });
  }, 180_000);

  afterAll(async () => {
    vi.useRealTimers();
    await it5?.drop();
    await disconnectAdmin();
  }, 180_000);

  beforeEach(() => {
    vi.setSystemTime(new Date(NOW));
    h.db.current = db;
    h.jwt.current = null;
    h.disabled.current = new Set();
  });

  describe("G1 progreso propio", () => {
    it("G1a resumen: suma de conteos de planes activos (no promedio), parcial 0,5, entrenador prevalece", async () => {
      jwt(a.userId, "client");
      const html = await render();
      expect(html).toContain("Mi progreso");
      // Marzo 4 vencidos (2 completados, 1 parcial, 1 pendiente) + febrero 8 (1 completado, 1 omitido).
      // (3 + 0,5) / 12 = 29 %. El promedio de porcentajes (63 + 13) / 2 = 38 % sería incorrecto.
      expect(html).toContain("29%");
      expect(html).not.toContain("38%");
      expect(html).toMatch(/Programados vencidos<\/p><p[^>]*>12</);
      expect(html).toMatch(/Completados<\/p><p[^>]*>3</);
      expect(html).toMatch(/Parciales<\/p><p[^>]*>1</);
      expect(html).toMatch(/Omitidos<\/p><p[^>]*>1</);
      expect(html).toMatch(/Pendientes<\/p><p[^>]*>7</);
      expect(html).toMatch(/Solo autorreportados<\/p><p[^>]*>1</);
    });

    it("G1b planes: cada uno con su período y cálculo; vencido, desactivado, futuro y heredado", async () => {
      jwt(a.userId, "client");
      const html = await render();
      expect(html).toContain("Evolución de planes");
      expect(html).toContain("63%"); // marzo (2 + 0,5) / 4
      expect(html).toContain("13%"); // febrero 1 / 8
      expect(html).toContain("25%"); // enero, desactivado: se muestra pero no suma al resumen
      expect(html).toContain("Desactivado por el gimnasio");
      expect(html).toContain("Finalizado");
      expect(html).toContain("Próximo");
      expect(html).toContain("Aún no inicia.");
      expect(html).toContain("Plan anterior al seguimiento por fecha");
      expect(html).toContain("registros anteriores al seguimiento por fecha");
    });

    it("G1c asistencia: attended + late, tardanza distinguida, sin duplicar la vinculada al plan", async () => {
      jwt(a.userId, "client");
      const html = await render();
      expect(html).toContain("Asistencia a clases");
      expect(html).toContain("3 en 8 semanas"); // 02-10, 03-02 (vinculada al plan), 03-04 (tarde)
      expect(html).toContain("Llegó tarde");
      expect(html).toContain("Ausencias registradas en el período: 1");
      expect(html).toMatch(/Esta semana<\/p><p[^>]*>0</); // 09 ausente, 10 cancelada
      expect(html).toMatch(/Este mes<\/p><p[^>]*>2</);
      expect(html).toContain("Tus autorreportes del plan no cuentan aquí");
    });

    it("G1d objetivo cualitativo y retroalimentación visible del entrenador; sin resultados físicos inventados", async () => {
      jwt(a.userId, "client");
      const html = await render();
      expect(html).toContain("Hipertrofia-");
      expect(html).toContain("Ganar fuerza de forma progresiva");
      expect(html).toContain("no un resultado medido");
      expect(html).toContain(FEEDBACK_A);
      expect(html).not.toMatch(/\bkg\b|grasa corporal:|masa muscular ganada|calor[ií]as/i);
    });
  });

  it("G2 privacidad: sin notas privadas, motivos, ids de usuarios ni datos de otro alumno", async () => {
    jwt(a.userId, "client");
    const html = await render();
    for (const secret of [SECRET_NOTE, SECRET_ACT, SECRET_REASON, SECRET_PLAN_NOTE, SECRET_CLIENT_NOTE, SECRET_RECEPTION, ACTOR, FEEDBACK_B, b.clientId, b.userId]) {
      expect(html).not.toContain(secret);
    }
  });

  describe("G3 aislamiento", () => {
    it("G3a otro alumno ve solo lo suyo", async () => {
      jwt(b.userId, "client");
      const html = await render();
      expect(html).toContain(FEEDBACK_B);
      expect(html).not.toContain(FEEDBACK_A);
      expect(html).not.toContain("29%");
      expect(html).toContain("1 en 8 semanas"); // la sesión compartida del 02 cuenta una vez para B
      expect(html).not.toContain(a.clientId);
    });

    it("G3b usuario de otro tenant enlazado a un Client de T1 → sin perfil y sin datos", async () => {
      jwt(t2User, "client", T2);
      const html = await render();
      expect(html).toContain("Tu perfil de cliente aún no está configurado.");
      expect(html).not.toContain("Evolución de planes");
      expect(html).not.toContain("Asistencia a clases");
    });

    it("G3c rol LIVE cambiado (JWT client, LIVE reception) pierde acceso", async () => {
      await db.user.update({ where: { id: a.userId }, data: { role: "reception" } });
      try {
        jwt(a.userId, "client");
        const html = await render();
        expect(html).toContain("Tu cuenta no tiene acceso al portal del alumno.");
        expect(html).not.toContain(FEEDBACK_A);
        expect(html).not.toContain("Asistencia a clases");
      } finally {
        await db.user.update({ where: { id: a.userId }, data: { role: "client" } });
      }
    });

    it("G3d sin sesión no renderiza", async () => {
      await expect(page()).rejects.toThrow(/NEXT_REDIRECT/);
    });
  });

  describe("G4 módulos y runtime", () => {
    it("G4a gym.weekly_plans apagado → bloquea antes de consultar cualquier tabla del alumno", async () => {
      h.disabled.current.add("gym.weekly_plans");
      const spy = spyDb(db);
      h.db.current = spy.proxy;
      jwt(a.userId, "client");
      const html = await render();
      expect(html).toContain("no está disponible en tu gimnasio");
      expect(html).not.toContain(FEEDBACK_A);
      for (const model of ["client", "clientWeeklyPlan", "clientWeeklyPlanDay", "clientPlanDayExecution", "classAttendance", "clientMembership", "gymSettings"]) {
        expect(spy.used.has(model)).toBe(false);
      }
    });

    it("G4b gym.classes apagado → no consulta asistencia ni la muestra como cero", async () => {
      h.disabled.current.add("gym.classes");
      const spy = spyDb(db);
      h.db.current = spy.proxy;
      jwt(a.userId, "client");
      const html = await render();
      expect(html).toContain("29%");
      expect(html).not.toContain("Asistencia a clases");
      expect(html).not.toContain("No hay asistencias confirmadas");
      expect(spy.used.has("classAttendance")).toBe(false);
    });

    it("G4c base runtime sin tablas de GYM-5A (P2021) → aviso, sin error ni porcentajes", async () => {
      const missing = Object.assign(new Error("The table `client_plan_day_executions` does not exist"), { code: "P2021" });
      const fail = async () => { throw missing; };
      const spy = spyDb(db, { clientPlanDayExecution: { findMany: fail, aggregate: fail } });
      h.db.current = spy.proxy;
      jwt(a.userId, "client");
      const html = await render();
      expect(html).toContain("El seguimiento por fecha aún no está disponible");
      expect(html).not.toContain("29%");
      expect(html).not.toContain("Evolución de planes");
      expect(html).toContain("Asistencia a clases");
    });
  });

  describe("G4d runtime REAL sin las tablas de GYM-5A (Runtime Shared aún sin la migración)", () => {
    it("tablas de 5A ausentes en la BD → aviso, asistencia y objetivo visibles, sin error", async () => {
      // Simula de verdad (no con mock) un runtime sin 20261021000000_gym_training_executions.
      await db.$executeRawUnsafe(`ALTER TABLE "client_plan_day_execution_events" RENAME TO "g4d_events_hidden"`);
      await db.$executeRawUnsafe(`ALTER TABLE "client_plan_day_executions" RENAME TO "g4d_executions_hidden"`);
      try {
        jwt(a.userId, "client");
        const html = await render();
        expect(html).toContain("El seguimiento por fecha aún no está disponible");
        expect(html).not.toContain("29%");
        expect(html).toContain("Asistencia a clases");
        expect(html).toContain("3 en 8 semanas");
        expect(html).toContain("Objetivo y retroalimentación");
      } finally {
        await db.$executeRawUnsafe(`ALTER TABLE "g4d_executions_hidden" RENAME TO "client_plan_day_executions"`);
        await db.$executeRawUnsafe(`ALTER TABLE "g4d_events_hidden" RENAME TO "client_plan_day_execution_events"`);
      }
      expect(await render()).toContain("29%");
    });
  });

  describe("G5 casos especiales", () => {
    it("G5a alumno nuevo: sin datos suficientes, nunca 0 %", async () => {
      jwt(d.userId, "client");
      const html = await render();
      expect(html).toContain("Sin datos suficientes");
      expect(html).toContain("Aún no tienes planes personalizados asignados.");
      expect(html).toContain("No hay asistencias confirmadas en este período.");
      expect(html).toContain("Tu gimnasio aún no registró un objetivo para ti.");
      expect(html).not.toMatch(/>0%</);
    });

    it("G5b asistencias sin plan: asistencia sí, cumplimiento sin datos", async () => {
      jwt(e.userId, "client");
      const html = await render();
      expect(html).toContain("1 en 8 semanas");
      expect(html).toContain("Aún no tienes planes personalizados asignados.");
      expect(html).toContain("Sin datos suficientes");
    });

    it("G5c membresía vencida > 3 días hábiles → planes ocultos (política vigente); asistencia visible", async () => {
      jwt(c.userId, "client");
      const html = await render();
      expect(html).toContain("Planes no disponibles");
      expect(html).not.toContain(FEEDBACK_C);
      expect(html).not.toContain("Evolución de planes");
      expect(html).not.toContain("Resumen personal");
      expect(html).toContain("Asistencia a clases");
    });

    it("G5d gimnasio sin zona horaria → sin cálculo por fecha y sin leer ejecuciones", async () => {
      await setPolicy(db, T1, { timezone: null });
      try {
        const spy = spyDb(db);
        h.db.current = spy.proxy;
        jwt(a.userId, "client");
        const html = await render();
        expect(html).toContain("configurar su zona horaria");
        expect(html).not.toContain("29%");
        expect(spy.used.has("clientPlanDayExecution")).toBe(false);
        expect(spy.used.has("classAttendance")).toBe(false);
      } finally {
        await setPolicy(db, T1, { timezone: TZ });
      }
    });

    it("G5e período por lista blanca; 12 meses mantiene la fórmula", async () => {
      jwt(a.userId, "client");
      const year = await render("anio");
      expect(year).toMatch(/aria-current="page"[^>]*>12 meses</);
      expect(year).toContain("29%");
      const bogus = await render("'><script>");
      expect(bogus).toMatch(/aria-current="page"[^>]*>8 semanas</);
      expect(bogus).not.toContain("<script>");
    });

    it("G5f fecha local del gimnasio en el límite del día (no UTC)", async () => {
      jwt(a.userId, "client");
      vi.setSystemTime(new Date("2026-03-12T05:30:00.000Z")); // 23:30 del 11 en El Salvador
      expect(await render()).toContain("Datos al 11 de marzo de 2026");
      vi.setSystemTime(new Date("2026-03-12T06:30:00.000Z")); // 00:30 del 12
      expect(await render()).toContain("Datos al 12 de marzo de 2026");
    });
  });

  describe("G6 riesgos de datos", () => {
    it("G6a pendientes anteriores al inicio del seguimiento: se identifican, el denominador es el de GYM-5A", async () => {
      // Seguimiento iniciado el 03-mar (local): febrero tiene 6 pendientes anteriores, sin registro posible.
      await db.clientPlanDayExecution.updateMany({ where: { tenant_id: T1 }, data: { created_at: new Date("2026-03-03T18:00:00.000Z") } });
      try {
        jwt(a.userId, "client");
        const html = await render();
        expect(html).toMatch(/Programados vencidos<\/p><p[^>]*>12</);
        expect(html).toMatch(/Cumplimiento<\/p><p[^>]*>29%</);
        expect(html).not.toContain("58%");
        expect(html).toMatch(/6 de los pendientes son anteriores al inicio del seguimiento/);
        expect(html).toContain("13%"); // febrero en el historial: mismo cálculo que GYM-5A
        expect(html).toContain("Antes del seguimiento"); // semanas de febrero sin registros
      } finally {
        await db.clientPlanDayExecution.updateMany({ where: { tenant_id: T1 }, data: { created_at: new Date(TRACKING_EPOCH) } });
      }
    });

    it("G6b planes heredados solapados: cada fecha cuenta una vez, con el plan más reciente", async () => {
      jwt(f.userId, "client");
      const html = await render();
      // Sin reparto: 3 vencidos (02 y 09 de P1 + 09 de P2), 2 completados, 1 omitido = 67 %.
      expect(html).toMatch(/Programados vencidos<\/p><p[^>]*>2</);
      expect(html).toMatch(/Omitidos<\/p><p[^>]*>0</);
      expect(html).toMatch(/Cumplimiento<\/p><p[^>]*>100%</);
      expect(html).not.toContain("67%");
      expect(html).toContain("coincide con un plan más reciente");
    });

    it("G6c el resumen no depende del tope del historial de planes", async () => {
      jwt(g.userId, "client");
      const html = await render();
      // El plan vigente es el 25.º por fecha de inicio (24 planes futuros más recientes).
      expect(html).toMatch(/Programados vencidos<\/p><p[^>]*>2</);
      expect(html).toMatch(/Cumplimiento<\/p><p[^>]*>100%</);
      expect(html).toContain("Vigente");
    });

    it("G6e sin tope alcanzado no hay avisos de datos incompletos", async () => {
      jwt(a.userId, "client");
      const html = await render();
      expect(html).not.toContain("Datos incompletos");
      expect(html).not.toMatch(/Se muestran \d+ de \d+ planes/); // A tiene menos planes que el límite del historial
    });
  });

  describe("G7 revisión externa", () => {
    it("G7a H1 caso Sofía: 'Mi progreso' coincide con GYM-5A (25 %) aunque el seguimiento empezó el 22-oct", async () => {
      // Plan real de prueba (Power Gym): 19/10–15/11/2026, lun–jue; al 22/10 vencen 19, 20, 21 y 22.
      // Parciales registrados el 21 y el 22; la primera ejecución del gimnasio es del 22/10.
      vi.setSystemTime(new Date("2026-10-22T15:00:00.000Z")); // jueves 09:00 en El Salvador
      const m = await createMember(db, { id: crypto.randomUUID(), branch: W.B1, withUser: true });
      const sofia = { clientId: m.clientId, userId: m.userId! };
      const plan = await seedPlan(db, { start: "2026-10-19", end: "2026-11-15", clientId: sofia.clientId, weekdays: [1, 2, 3, 4], trainerId: W.TR1 });
      const rec = (dayId: string, date: string) =>
        recordTrainerExecution(db, {
          tenantId: T1, planId: plan.planId, planDayId: dayId, localDate: date, status: "partial", feedback: null, reason: null,
          attendanceId: null, actor: { userId: ACTOR, role: "trainer" }, timezone: TZ, today: "2026-10-22",
        });
      ok(await rec(plan.days[3], "2026-10-21"));
      ok(await rec(plan.days[4], "2026-10-22"));
      await db.clientPlanDayExecution.updateMany({ where: { tenant_id: T1 }, data: { created_at: new Date("2026-10-22T14:00:00.000Z") } });
      try {
        const tracking = await loadPlanTracking(db, { tenantId: T1, planId: plan.planId, today: "2026-10-22", audience: "CLIENT", includeSessions: false });
        expect(tracking?.summary).toMatchObject({ scheduled: 4, partial: 2, pending: 2, compliancePct: 25 });

        jwt(sofia.userId, "client");
        const html = await render();
        expect(html).toMatch(/Cumplimiento<\/p><p[^>]*>25%</);
        expect(html).toMatch(/Programados vencidos<\/p><p[^>]*>4</);
        expect(html).toMatch(/Parciales<\/p><p[^>]*>2</);
        expect(html).toMatch(/Pendientes<\/p><p[^>]*>2</);
        expect(html).not.toContain("50%");
        // Los dos pendientes anteriores al inicio del seguimiento se identifican, sin otro porcentaje.
        expect(html).toMatch(/2 de los pendientes son anteriores al inicio del seguimiento/);
      } finally {
        await db.clientPlanDayExecution.updateMany({ where: { tenant_id: T1 }, data: { created_at: new Date(TRACKING_EPOCH) } });
      }
    });

    it("G7b H2 historial: aclara cuando solo muestra los planes más recientes", async () => {
      jwt(g.userId, "client");
      const html = await render();
      expect(html).toContain("Se muestran 25 de 26 planes: los más recientes y los del período consultado.");
    });

    const withLimits = async <T,>(limits: Partial<typeof PROGRESS_QUERY_LIMITS>, fn: () => Promise<T>): Promise<T> => {
      const saved = { ...PROGRESS_QUERY_LIMITS };
      Object.assign(PROGRESS_QUERY_LIMITS, limits);
      try {
        return await fn();
      } finally {
        Object.assign(PROGRESS_QUERY_LIMITS, saved);
      }
    };

    it("G7c H2 asistencia por encima del máximo: 'Datos incompletos', sin totales ni promedio", async () => {
      jwt(a.userId, "client");
      // A tiene 4 asistencias en el período (02-10, 03-02, 03-04 tarde, 03-09 ausente).
      const html = await withLimits({ pageSize: 2, maxAttendanceRows: 3 }, () => render());
      expect(html).toContain("Datos incompletos");
      expect(html).toContain("no se calculan los totales, el promedio semanal ni el gráfico");
      expect(html).not.toMatch(/\d+ en 8 semanas/);
      expect(html).not.toMatch(/Esta semana<\/p><p[^>]*>\d/);
      expect(html).toContain("Llegó tarde"); // últimas clases: consulta propia, completa
      expect(html).toMatch(/Cumplimiento<\/p><p[^>]*>29%</); // el resumen de planes no se ve afectado
    });

    it("G7d H2 planes del período por encima del máximo: 'Datos incompletos', sin porcentaje, totales ni evolución", async () => {
      jwt(a.userId, "client");
      // A tiene 3 planes que tocan el período de 8 semanas (enero desactivado, febrero, marzo).
      const html = await withLimits({ pageSize: 1, maxWindowPlans: 2 }, () => render());
      expect(html).toContain("Datos incompletos");
      expect(html).not.toMatch(/Cumplimiento<\/p><p[^>]*>\d+%</);
      expect(html).not.toMatch(/Programados vencidos<\/p><p[^>]*>\d/);
      expect(html).not.toContain("Ver datos en tabla");
      expect(html).toContain("Evolución de planes"); // cada plan conserva su cálculo propio
      expect(html).toContain("3 en 8 semanas"); // la asistencia no se ve afectada
    });

    it("G7e paginación exacta: con páginas de 1 fila el resultado es idéntico", async () => {
      jwt(a.userId, "client");
      const normal = await render();
      const paged = await withLimits({ pageSize: 1 }, () => render());
      expect(paged).toBe(normal);
      expect(paged).toMatch(/Cumplimiento<\/p><p[^>]*>29%</);
      expect(paged).toContain("3 en 8 semanas");
    });

    it("G7f límite exacto: justo en el máximo NO es incompleto", async () => {
      jwt(a.userId, "client");
      const html = await withLimits({ pageSize: 2, maxAttendanceRows: 4, maxWindowPlans: 3 }, () => render());
      expect(html).not.toContain("Datos incompletos");
      expect(html).toContain("3 en 8 semanas");
    });
  });
});
