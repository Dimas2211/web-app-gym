// ─────────────────────────────────────────────────────────────────
// GYM-5D — página REAL /dashboard/reports/training-analytics contra
// PostgreSQL desechable (se omite sin GYM_BOOKING_IT_*). Solo se sustituyen
// las fronteras externas: sesión Auth.js, revalidación LIVE del runtime,
// contexto comercial, la sesión de soporte y (PLATFORM_NATIVE) el Prisma
// global, que apunta a la misma base desechable solo cuando la prueba lo pide.
//
//  G1  panorama, evolución, sucursales, entrenadores, asistencia y modalidades (cifras exactas)
//  G2  alcance: super_admin global, branch_admin una sede, filtro de sede, otro tenant
//  G3  identidad LIVE: recepción, entrenador, cliente, sede/rol cambiados, PLATFORM_NATIVE, Support Session
//  G4  módulos: gym.weekly_plans apagado, gym.classes apagado (sin consultar sus tablas)
//  G5  runtime sin la migración de 5A, límites de lectura ("Datos incompletos")
//  G6  privacidad, parámetros GET manipulados, Dedicated, zona horaria, solo lectura
//  G7  coherencia con 5A/5B/5C sobre los mismos datos
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import type { PrismaClient } from "@prisma/client";

const h = vi.hoisted(() => ({
  db: { current: null as unknown },
  jwt: { current: null as null | Record<string, unknown> },
  disabled: { current: new Set<string>() },
  support: { current: null as null | Record<string, unknown> },
  native: { current: false },
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
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
// Prisma global: lanza salvo en las pruebas PLATFORM_NATIVE (Power Gym), donde
// la base efectiva ES la global; entonces apunta a la base desechable.
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, p) => {
        if (p === "then") return undefined;
        if (!h.native.current) return () => {
          throw new Error(`global prisma.${String(p)}`);
        };
        const db = h.db.current as Record<string | symbol, unknown>;
        const v = db[p];
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(db) : v;
      },
    }
  ),
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
vi.mock("@/modules/platform/runtime/runtime-session", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getRuntimeSession: vi.fn(async () => h.support.current),
  clearRuntimeSession: vi.fn(async () => {}),
}));
vi.mock("@/modules/platform/runtime/resolve-runtime-session-profile", () => ({
  resolveRuntimeProfileForSession: vi.fn(async () => ({ tenantId: "it-tenant-1" })),
}));
vi.mock("@/modules/platform/runtime/runtime-database-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createRuntimePrismaClient: vi.fn(() => ({ client: h.db.current, disconnect: async () => {} })),
}));

import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "@/modules/classes/booking/testing/pg-it-harness";
import { createSession, MODALITIES_ON, setPolicy, T1, T2, TZ } from "@/modules/classes/booking/testing/booking-fixtures";
import { seedPlan, seedPlanWorld, W, type SeededPlan } from "./testing/plan-it-harness";
import { recordClientReport, recordTrainerExecution } from "./training-execution-service";
import { loadPlanTracking } from "./training-tracking-queries";
import { ANALYTICS_QUERY_LIMITS } from "./training-analytics-queries";
import { loadTrainerFollowUp } from "./trainer-follow-up-queries";
import { loadPortalProgress } from "@/modules/client-portal/progress-queries";
import AnalyticsPage from "@/app/(dashboard)/dashboard/reports/training-analytics/page";
import { CROSS_BRANCH_DETECTED, CROSS_BRANCH_SCOPE } from "@/app/(dashboard)/dashboard/reports/training-analytics/analytics-sections";

const NOW = "2026-03-11T15:00:00.000Z"; // miércoles 09:00 en El Salvador
const TODAY = "2026-03-11";
const SECRET = {
  training: "NOTA-PRIVADA-CLASE-5D",
  attendance: "NOTA-ASISTENCIA-5D",
  activity: "NOTA-PRIVADA-ACTIVIDAD-5D",
  comment: "COMENTARIO-ALUMNO-5D",
  feedback: "RETRO-ENTRENADOR-5D",
  reason: "MOTIVO-CORRECCION-5D",
  planNotes: "NOTA-PLAN-5D",
  clientNotes: "NOTA-FICHA-5D",
};
const STUDENT_NAMES = ["Lucía", "Mario", "Sara", "Nora", "Fede", "Omar", "Pía", "Tomás"];
const SA1 = "it-user-sa1";
const SA2 = "it-user-sa2";

type Role = "super_admin" | "branch_admin" | "reception" | "trainer" | "client";

function jwt(userId: string, role: Role, location: string | null, tenant: string = T1, scope = "RUNTIME_CLIENT") {
  h.jwt.current = { id: userId, name: "IT", email: `${userId}@it.invalid`, role, tenant_id: tenant, location_id: location, auth_scope: scope, organization_id: "it-org" };
}

const page = async (sp: Record<string, string> = {}): Promise<string> =>
  renderToStaticMarkup((await AnalyticsPage({ searchParams: Promise.resolve(sp) })) as ReactElement);

/** Valor de un indicador (<p>etiqueta</p><p>valor</p>). */
function stat(html: string, label: string): string | null {
  return new RegExp(`>${label}</p><p[^>]*>([^<]*)<`).exec(html)?.[1] ?? null;
}

/** Celdas (texto) de la primera fila cuya primera celda empieza por `label`. */
function row(html: string, label: string): string[] | null {
  for (const tr of html.match(/<tr[^>]*>.*?<\/tr>/g) ?? []) {
    const cells = [...tr.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
    if (cells[0]?.startsWith(label)) return cells;
  }
  return null;
}

const after = (html: string, marker: string) => html.slice(html.indexOf(marker));

describe.skipIf(!IT_ENABLED)("GYM-5D — analítica de entrenamiento (PostgreSQL real)", () => {
  let itdb: ItDatabase;
  let db: PrismaClient;
  let p1: SeededPlan; // Lucía, B1, Ana — vigente con registros
  let p0: SeededPlan; // Lucía, B1, Ana — heredado solapado
  let p2: SeededPlan; // Mario, B1, Beto
  let p3: SeededPlan; // Sara, B2, Carla
  let p6: SeededPlan; // Nora, B1, sin entrenador
  let pf: SeededPlan; // Fede, B1, Beto — finalizado

  beforeAll(async () => {
    itdb = await createItDatabase();
    db = itdb.db;
    h.db.current = db;
    await seedPlanWorld(db);
    await setPolicy(db, T1, MODALITIES_ON);
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });

    const trainerName = async (id: string, first: string, last: string) =>
      db.trainer.update({ where: { id }, data: { first_name: first, last_name: last } });
    await trainerName(W.TR1, "Ana", "Martínez");
    await trainerName(W.TR2, "Beto", "Ruiz");
    await trainerName(W.TR_B2, "Carla", "Sede");
    await trainerName(W.TR_T2, "Tito", "Tenant");
    const named = async (clientId: string, first: string, modality: "NORMAL" | "PERSONALIZED" | "GROUP" = "NORMAL") =>
      db.client.update({ where: { id: clientId }, data: { first_name: first, last_name: `${first}-Apellido`, modality, notes: SECRET.clientNotes } });

    p0 = await seedPlan(db, { start: "2026-02-23", end: "2026-03-15", weekdays: [1], trainerId: W.TR1, withClientUser: true });
    await named(p0.clientId, "Lucía");
    await db.clientWeeklyPlan.update({ where: { id: p0.planId }, data: { created_at: new Date("2026-02-20T12:00:00Z") } });
    p1 = await seedPlan(db, { start: "2026-03-02", end: "2026-03-29", weekdays: [1, 3], trainerId: W.TR1, clientId: p0.clientId });
    await db.clientWeeklyPlan.update({ where: { id: p1.planId }, data: { notes: SECRET.planNotes } });
    p2 = await seedPlan(db, { start: "2026-03-02", end: "2026-03-29", weekdays: [2], trainerId: W.TR2 });
    await named(p2.clientId, "Mario", "PERSONALIZED");
    p3 = await seedPlan(db, { branch: W.B2, start: "2026-03-02", end: "2026-03-29", weekdays: [3], trainerId: W.TR_B2 });
    await named(p3.clientId, "Sara", "GROUP");
    p6 = await seedPlan(db, { start: "2026-03-09", end: "2026-03-22", weekdays: [1], trainerId: null });
    await named(p6.clientId, "Nora");
    pf = await seedPlan(db, { start: "2026-01-26", end: "2026-02-22", weekdays: [1], trainerId: W.TR2 });
    await named(pf.clientId, "Fede");
    const future = await seedPlan(db, { start: "2026-03-16", end: "2026-04-12", weekdays: [1, 3], trainerId: W.TR1 });
    await named(future.clientId, "Omar");
    const inactive = await seedPlan(db, { start: "2026-03-02", end: "2026-03-29", weekdays: [1, 3], trainerId: W.TR1, status: "inactive" });
    await named(inactive.clientId, "Pía");
    const t2 = await seedPlan(db, { tenant: T2, start: "2026-03-02", end: "2026-03-29", weekdays: [1], trainerId: W.TR_T2 });
    await named(t2.clientId, "Tomás");

    const actor = { userId: SA1, role: "super_admin" as const };
    const rec = async (p: SeededPlan, weekday: number, date: string, status: "completed" | "partial" | "skipped", tenant = T1, extra: { feedback?: string; reason?: string } = {}) => {
      const r = await recordTrainerExecution(db, {
        tenantId: tenant,
        planId: p.planId,
        planDayId: p.days[weekday],
        localDate: date,
        status,
        feedback: extra.feedback ?? null,
        reason: extra.reason ?? null,
        attendanceId: null,
        timezone: tenant === T1 ? TZ : "America/New_York",
        today: TODAY,
        actor: tenant === T1 ? actor : { userId: SA2, role: "super_admin" as const },
      });
      expect(r.ok).toBe(true);
    };
    await rec(p0, 1, "2026-03-02", "completed"); // fecha gobernada por p1: no cuenta
    await rec(p1, 1, "2026-03-02", "completed", T1, { feedback: SECRET.feedback });
    expect(
      (await recordClientReport(db, { tenantId: T1, clientId: p1.clientId, planDayId: p1.days[3], localDate: "2026-03-04", status: "partial", comment: SECRET.comment, actorUserId: p0.clientUserId!, timezone: TZ, today: TODAY })).ok
    ).toBe(true);
    await rec(p1, 1, "2026-03-09", "completed");
    await rec(p1, 1, "2026-03-09", "skipped", T1, { reason: SECRET.reason });
    await rec(p2, 2, "2026-03-03", "completed");
    await rec(p2, 2, "2026-03-10", "completed");
    await rec(p3, 3, "2026-03-04", "partial");
    await rec(pf, 1, "2026-02-02", "completed");
    await rec(pf, 1, "2026-02-09", "partial");
    await rec(t2, 1, "2026-03-02", "completed", T2);
    // Plan desactivado con un registro: nunca cuenta.
    await db.clientPlanDayExecution.create({
      data: { tenant_id: T1, client_id: inactive.clientId, plan_id: inactive.planId, plan_day_id: inactive.days[1], local_date: new Date("2026-03-02T00:00:00Z"), timezone: TZ, trainer_status: "completed", trainer_recorded_at: new Date(NOW), trainer_recorded_by: SA1, trainer_recorded_role: "super_admin" },
    });
    // Inicio del seguimiento por fecha del tenant T1: 02-feb (fecha local).
    await db.$executeRawUnsafe(`UPDATE client_plan_day_executions SET created_at = '2026-02-02T15:00:00Z' WHERE tenant_id = '${T1}'`);

    // Asistencia GYM-4.
    const att = async (session: string, clientId: string, status: "attended" | "late" | "absent" | "cancelled", tenant: string = T1, notes = false) =>
      db.classAttendance.create({
        data: { scheduled_class_id: session, client_id: clientId, attendance_status: status, tenant_id: tenant, ...(notes ? { notes: SECRET.attendance, training_notes: SECRET.training } : {}) },
      });
    const s1 = await createSession(db, { branch: W.B1, trainer: W.TR2, date: "2026-03-02", kind: "OPEN" });
    const a1 = await att(s1, p1.clientId, "attended", T1, true);
    const act = crypto.randomUUID();
    await db.gymActivity.create({ data: { id: act, tenant_id: T1, name: `Remo-${act}` } });
    await db.classAttendanceActivity.create({ data: { tenant_id: T1, attendance_id: a1.id, activity_id: act, activity_name: "Remo", notes: SECRET.activity } });
    const s2 = await createSession(db, { branch: W.B1, trainer: W.TR1, date: "2026-03-06", kind: "GROUP" });
    await att(s2, p1.clientId, "late");
    await att(s2, p2.clientId, "attended");
    await att(s2, p3.clientId, "absent");
    const s3 = await createSession(db, { branch: W.B2, trainer: W.TR_B2, date: "2026-03-09", kind: "PERSONALIZED", capacity: 1 });
    await att(s3, p3.clientId, "attended");
    const s4 = await createSession(db, { branch: W.B1, trainer: W.TR2, date: "2026-03-10", kind: "OPEN" });
    await att(s4, p2.clientId, "cancelled");
    const s5 = await createSession(db, { branch: W.B1, trainer: W.TR2, date: "2026-03-20", kind: "OPEN" });
    await att(s5, p1.clientId, "attended"); // futura
    const sOld = await createSession(db, { branch: W.B1, trainer: W.TR2, date: "2025-12-01", kind: "OPEN" });
    await att(sOld, p2.clientId, "attended"); // fuera de 8 semanas, dentro de 12 meses
    const sT2 = await createSession(db, { tenant: T2, date: "2026-03-03", kind: "OPEN" });
    await att(sT2, t2.clientId, "attended", T2);
    // Reserva sin asistencia registrada: no es asistencia (no hay fila en class_attendance).
    await createSession(db, { branch: W.B1, trainer: W.TR1, date: "2026-03-04", kind: "OPEN" });
  }, 300_000);

  afterAll(async () => {
    vi.useRealTimers();
    await itdb?.drop();
    await disconnectAdmin();
  }, 180_000);

  beforeEach(() => {
    vi.setSystemTime(new Date(NOW));
    h.db.current = db;
    h.jwt.current = null;
    h.support.current = null;
    h.disabled.current = new Set();
    h.native.current = false;
  });

  describe("G1 cifras exactas (super_admin, todo el tenant)", () => {
    it("G1a panorama de planes vigentes con la fórmula de 5A", async () => {
      jwt(SA1, "super_admin", null);
      const html = await page();
      expect(html).toContain("Analítica de entrenamiento");
      expect(stat(html, "Alumnos con plan vigente")).toBe("4");
      expect(stat(html, "Planes vigentes")).toBe("5"); // ni futuro, ni desactivado, ni finalizado
      expect(stat(html, "Programados vencidos")).toBe("10");
      expect(stat(html, "Completados")).toBe("3");
      expect(stat(html, "Parciales")).toBe("2");
      expect(stat(html, "Omitidos")).toBe("1");
      expect(stat(html, "Pendientes sin registro")).toBe("4");
      expect(stat(html, "Autorreportes por revisar")).toBe("1");
      expect(stat(html, "Registros del entrenador")).toBe("5");
      expect(stat(html, "Cumplimiento")).toBe("40%"); // (3 + 0,5 × 2) / 10; promedio de % sería 33 %
      expect(html).toContain("cada fecha cuenta una sola vez");
    });

    it("G1b evolución semanal: sin datos suficientes, antes del seguimiento y total sin promediar", async () => {
      jwt(SA1, "super_admin", null);
      const html = await page();
      expect(html).toContain("Evolución semanal");
      expect(row(html, "Semana del 19")).toEqual(["Semana del 19 ene", "0", "0", "0", "0", "0", "0", "Sin datos suficientes", "0"]);
      expect(row(html, "Semana del 26")?.slice(1)).toEqual(["1", "0", "0", "0", "1", "0", "Antes del seguimiento", "0"]);
      expect(row(html, "Semana del 2 feb")?.slice(1)).toEqual(["1", "1", "0", "0", "0", "0", "100%", "0"]);
      expect(row(html, "Semana del 9 feb")?.slice(1)).toEqual(["1", "0", "1", "0", "0", "0", "50%", "0"]);
      expect(row(html, "Semana del 16 feb")?.slice(1)).toEqual(["1", "0", "0", "0", "1", "0", "Sin datos suficientes", "0"]);
      expect(row(html, "Semana del 2 mar")?.slice(1)).toEqual(["4", "2", "2", "0", "0", "1", "75%", "3"]);
      expect(row(html, "Semana del 9 mar")?.slice(1)).toEqual(["5", "1", "0", "1", "3", "0", "20%", "1"]);
      expect(row(html, "Semana del 9 mar")?.[0]).toContain("(en curso)");
      expect(row(html, "Total del período")?.slice(1)).toEqual(["14", "4", "3", "1", "6", "1", "39%", "4"]);
      expect(html).toContain("1 pendientes del período son anteriores a ese inicio");
    });

    it("G1c evolución mensual (6 y 12 meses)", async () => {
      jwt(SA1, "super_admin", null);
      const html = await page({ periodo: "meses" });
      expect(html).toContain("Evolución mensual");
      expect(row(html, "marzo de 2026")?.slice(1, 8)).toEqual(["9", "3", "2", "1", "3", "1", "44%"]);
      expect(row(html, "febrero de 2026")?.slice(1, 8)).toEqual(["4", "1", "1", "0", "2", "0", "38%"]);
      expect(row(html, "enero de 2026")?.[7]).toBe("Antes del seguimiento");
      const year = await page({ periodo: "anio" });
      expect(stat(year, "Asistió")).toBe("4"); // incluye la de diciembre
      expect(stat(html, "Asistió")).toBe("4");
      expect(stat(await page(), "Asistió")).toBe("3");
    });

    it("G1d sucursales: planes por la sede del plan, asistencia por la sede de la clase; suman el panorama", async () => {
      jwt(SA1, "super_admin", null);
      const html = await page();
      expect(html).toContain("Comparación entre sucursales");
      expect(row(html, "W Sede 1")).toEqual(["W Sede 1", "3", "4", "8", "3", "1", "44%", "3"]);
      expect(row(html, "W Sede 2")).toEqual(["W Sede 2", "1", "1", "2", "1", "0", "25%", "1"]);
      expect(row(html, "Sede 1A")).toEqual(["Sede 1A", "0", "0", "0", "0", "0", "Sin datos suficientes", "0"]);
      expect(html).not.toContain("W Sede T2");
      // §8: sin solapes entre sedes en estos datos ⇒ ninguna nota de solape ni de alcance.
      expect(html).not.toContain(CROSS_BRANCH_DETECTED);
      expect(html).not.toContain(CROSS_BRANCH_SCOPE);
    });

    it("G1e entrenadores: atribución por ClientWeeklyPlan.trainer_id, orden alfabético, sin ranking", async () => {
      jwt(SA1, "super_admin", null);
      const html = await page();
      const t = after(html, "Planes por entrenador");
      expect(row(t, "Martínez, Ana")).toEqual(["Martínez, Ana", "2", "1", "5", "1", "1", "1", "2", "1", "30%"]);
      expect(row(t, "Ruiz, Beto")).toEqual(["Ruiz, Beto", "1", "1", "2", "2", "0", "0", "0", "0", "100%"]);
      expect(row(t, "Sede, Carla")).toEqual(["Sede, Carla", "1", "1", "2", "0", "1", "0", "1", "0", "25%"]);
      expect(row(t, "Sin entrenador asignado")).toEqual(["Sin entrenador asignado", "1", "1", "1", "0", "0", "0", "1", "0", "Sin datos suficientes"]);
      // Ana impartió la clase GROUP de Mario y Sara: no la convierte en responsable de sus planes.
      expect(t.indexOf("Martínez, Ana")).toBeLessThan(t.indexOf("Ruiz, Beto"));
      expect(t.indexOf("Sede, Carla")).toBeLessThan(t.indexOf("Sin entrenador asignado"));
      expect(html).not.toContain("Tenant, Tito");
      expect(html).not.toMatch(/ranking|puntuaci/i);
    });

    it("G1f asistencia: conteos reales, sin porcentaje; reservas, canceladas y futuras fuera", async () => {
      jwt(SA1, "super_admin", null);
      const html = await page();
      const a = after(html, "Asistencia a clases");
      expect(stat(a, "Asistió")).toBe("3");
      expect(stat(a, "Llegó tarde")).toBe("1");
      expect(stat(a, "Asistencias confirmadas")).toBe("4");
      expect(stat(a, "Ausencias registradas")).toBe("1");
      expect(a.slice(0, a.indexOf("Modalidades"))).not.toMatch(/\d+%/);
    });

    it("G1g modalidades: Client.modality para planes y session_kind para asistencias (no se confunden)", async () => {
      jwt(SA1, "super_admin", null);
      const html = await page();
      const plans = after(html, "Planes vigentes por modalidad del alumno");
      expect(row(plans, "Normal")).toEqual(["Normal", "2", "3", "6", "25%"]);
      expect(row(plans, "Personalizada")).toEqual(["Personalizada", "1", "1", "2", "100%"]);
      expect(row(plans, "Grupal")).toEqual(["Grupal", "1", "1", "2", "25%"]);
      const kinds = after(html, "Asistencias por tipo de sesión");
      expect(row(kinds, "Clase abierta")).toEqual(["Clase abierta", "1", "0", "1", "0"]);
      expect(row(kinds, "Personalizada")).toEqual(["Personalizada", "1", "0", "1", "0"]);
      expect(row(kinds, "Grupal")).toEqual(["Grupal", "1", "1", "2", "1"]);
      expect(html).not.toMatch(/segmentad[ao]<\/td>/);
    });
  });

  describe("G2 alcance", () => {
    it("G2a branch_admin: solo su sede vigente, nunca agregados de otra", async () => {
      jwt(W.U_BA1, "branch_admin", W.B1);
      const html = await page();
      expect(html).toContain("Tu sucursal");
      expect(stat(html, "Planes vigentes")).toBe("4");
      expect(stat(html, "Alumnos con plan vigente")).toBe("3");
      expect(stat(html, "Programados vencidos")).toBe("8");
      expect(stat(html, "Cumplimiento")).toBe("44%");
      expect(stat(after(html, "Asistencia a clases"), "Asistencias confirmadas")).toBe("3");
      expect(html).not.toContain("W Sede 2");
      expect(html).not.toContain("Sede, Carla");
      expect(html).not.toContain('name="sede"');
      // §8: nota fija de alcance (no se leen planes de otras sedes para reconciliar).
      expect(html).toContain(CROSS_BRANCH_SCOPE);
      expect(html).not.toContain(CROSS_BRANCH_DETECTED);
    });

    it("G2b branch_admin con ?sede= de otra sucursal: se ignora", async () => {
      jwt(W.U_BA1, "branch_admin", W.B1);
      expect(await page({ sede: W.B2 })).toBe(await page());
      jwt(W.U_BA2, "branch_admin", W.B2);
      const b2 = await page({ sede: W.B1 });
      expect(stat(b2, "Planes vigentes")).toBe("1");
      expect(stat(b2, "Cumplimiento")).toBe("25%");
      expect(b2).not.toContain("W Sede 1");
    });

    it("G2c super_admin filtra una sede autorizada; una sede de otro tenant o inventada se ignora", async () => {
      jwt(SA1, "super_admin", null);
      const b2 = await page({ sede: W.B2 });
      expect(b2).toContain("Sucursal seleccionada");
      expect(stat(b2, "Planes vigentes")).toBe("1");
      expect(stat(b2, "Cumplimiento")).toBe("25%");
      expect(stat(after(b2, "Asistencia a clases"), "Asistencias confirmadas")).toBe("1");
      const all = await page();
      expect(await page({ sede: W.BT2 })).toBe(all);
      expect(await page({ sede: "no-existe" })).toBe(all);
    });

    it("G2d otro tenant Shared: super_admin de T2 solo ve T2", async () => {
      jwt(SA2, "super_admin", null, T2);
      const html = await page();
      expect(stat(html, "Planes vigentes")).toBe("1");
      expect(stat(html, "Programados vencidos")).toBe("2");
      expect(stat(html, "Cumplimiento")).toBe("50%");
      expect(stat(after(html, "Asistencia a clases"), "Asistencias confirmadas")).toBe("1");
      expect(html).toContain("Tenant, Tito");
      expect(html).not.toContain("W Sede 1");
      expect(html).not.toContain("Martínez, Ana");
    });
  });

  describe("G3 identidad LIVE", () => {
    it("G3a recepción y entrenador: aviso y cero datos", async () => {
      for (const [uid, role, loc] of [
        [W.U_RC1, "reception", W.B1],
        [W.U_TR1, "trainer", W.B1],
      ] as const) {
        jwt(uid, role, loc);
        const html = await page();
        expect(html).toContain("exclusiva de la administración");
        expect(stat(html, "Planes vigentes")).toBeNull();
        expect(html).not.toContain("W Sede 1");
      }
    });

    it("G3b alumno: redirigido fuera del dashboard", async () => {
      jwt(p0.clientUserId!, "client", null);
      await expect(page()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    });

    it("G3c branch_admin trasladado de sede con JWT vigente (RUNTIME_CLIENT): falla cerrado", async () => {
      await db.user.update({ where: { id: W.U_BA1 }, data: { branch_id: W.B2 } });
      try {
        jwt(W.U_BA1, "branch_admin", W.B1);
        const html = await page();
        expect(html).toContain("Vuelve a iniciar sesión");
        expect(stat(html, "Planes vigentes")).toBeNull();
      } finally {
        await db.user.update({ where: { id: W.U_BA1 }, data: { branch_id: W.B1 } });
      }
    });

    it("G3d rol degradado a recepción (RUNTIME_CLIENT): sin datos", async () => {
      await db.user.update({ where: { id: W.U_BA1 }, data: { role: "reception" } });
      try {
        jwt(W.U_BA1, "branch_admin", W.B1);
        const html = await page();
        expect(html).toContain("exclusiva de la administración");
        expect(stat(html, "Planes vigentes")).toBeNull();
      } finally {
        await db.user.update({ where: { id: W.U_BA1 }, data: { role: "branch_admin" } });
      }
    });

    it("G3e PLATFORM_NATIVE (Power Gym): super_admin ve el tenant; usuario desactivado o degradado con JWT vigente, no", async () => {
      h.native.current = true;
      jwt(SA1, "super_admin", null, T1, "PLATFORM");
      expect(stat(await page(), "Cumplimiento")).toBe("40%");

      await db.user.update({ where: { id: SA1 }, data: { status: "inactive" } });
      try {
        const html = await page();
        expect(html).toContain("Vuelve a iniciar sesión");
        expect(stat(html, "Planes vigentes")).toBeNull();
      } finally {
        await db.user.update({ where: { id: SA1 }, data: { status: "active" } });
      }

      await db.user.update({ where: { id: W.U_BA1 }, data: { role: "reception" } });
      try {
        jwt(W.U_BA1, "branch_admin", W.B1, T1, "PLATFORM");
        const html = await page();
        expect(html).toContain("Vuelve a iniciar sesión");
        expect(stat(html, "Planes vigentes")).toBeNull();
      } finally {
        await db.user.update({ where: { id: W.U_BA1 }, data: { role: "branch_admin" } });
      }

      await db.user.update({ where: { id: W.U_BA1 }, data: { branch_id: W.B2 } });
      try {
        jwt(W.U_BA1, "branch_admin", W.B1, T1, "PLATFORM");
        expect(await page()).toContain("Vuelve a iniciar sesión");
      } finally {
        await db.user.update({ where: { id: W.U_BA1 }, data: { branch_id: W.B1 } });
      }

      jwt(W.U_BA1, "branch_admin", W.B1, T1, "PLATFORM");
      expect(stat(await page(), "Cumplimiento")).toBe("44%");
    });

    it("G3f Support Session (solo lectura): lectura del tenant soportado, sin formularios POST", async () => {
      h.support.current = { tenantId: T1, organizationId: "it-org", openedAt: NOW };
      jwt(SA1, "super_admin", null, T1, "PLATFORM");
      const html = await page();
      expect(stat(html, "Cumplimiento")).toBe("40%");
      expect(html).not.toMatch(/method="post"/i);
    });
  });

  describe("G4 módulos", () => {
    it("G4a gym.weekly_plans apagado: la página no se sirve", async () => {
      h.disabled.current = new Set(["gym.weekly_plans"]);
      jwt(SA1, "super_admin", null);
      await expect(page()).rejects.toThrow("module_not_enabled");
    });

    it("G4b gym.classes apagado: no se consulta class_attendance y no hay indicadores de clases (ni ceros ficticios)", async () => {
      h.disabled.current = new Set(["gym.classes"]);
      h.db.current = new Proxy(db, {
        get(t, p) {
          if (p === "classAttendance" || p === "scheduledClass") throw new Error(`classes table touched: ${String(p)}`);
          const v = Reflect.get(t, p, t);
          return typeof v === "function" ? v.bind(t) : v;
        },
      });
      jwt(SA1, "super_admin", null);
      const html = await page();
      expect(stat(html, "Cumplimiento")).toBe("40%");
      expect(html).not.toContain("Asistencia a clases");
      expect(html).not.toContain("Asistencias confirmadas");
      expect(html).not.toContain("Asistencias por tipo de sesión");
      expect(row(html, "W Sede 1")).toEqual(["W Sede 1", "3", "4", "8", "3", "1", "44%"]);
      expect(row(html, "Total del período")).toHaveLength(8);
      // Sin enlaces a reportes que dependen de clases; Planes semanales se conserva.
      expect(html).not.toContain('href="/dashboard/reports/trainers/classes-taught"');
      expect(html).not.toContain('href="/dashboard/reports/attendance/by-period"');
      expect(html).toContain('href="/dashboard/weekly-plans/client-plans"');
    });
  });

  describe("G5 runtime sin 5A y límites", () => {
    it("G5a runtime REAL sin las tablas de 5A: aviso, planes contados, sin cifras de cumplimiento ni error", async () => {
      await db.$executeRawUnsafe(`ALTER TABLE "client_plan_day_execution_events" RENAME TO "g5a_events_hidden"`);
      await db.$executeRawUnsafe(`ALTER TABLE "client_plan_day_executions" RENAME TO "g5a_executions_hidden"`);
      try {
        jwt(SA1, "super_admin", null);
        const html = await page();
        expect(html).toContain("El seguimiento por fecha aún no está disponible");
        expect(stat(html, "Planes vigentes")).toBe("5");
        expect(stat(html, "Programados vencidos")).toBeNull();
        expect(html).not.toContain("40%");
        expect(html).not.toContain("Total del período");
        expect(stat(after(html, "Asistencia a clases"), "Asistencias confirmadas")).toBe("4");
      } finally {
        await db.$executeRawUnsafe(`ALTER TABLE "g5a_executions_hidden" RENAME TO "client_plan_day_executions"`);
        await db.$executeRawUnsafe(`ALTER TABLE "g5a_events_hidden" RENAME TO "client_plan_day_execution_events"`);
      }
    });

    it("G5b más planes que el máximo: Datos incompletos, sin cifras", async () => {
      const prev = { ...ANALYTICS_QUERY_LIMITS };
      Object.assign(ANALYTICS_QUERY_LIMITS, { maxPlans: 3, pageSize: 2 });
      try {
        jwt(SA1, "super_admin", null);
        const html = await page();
        expect(html).toContain("Datos incompletos");
        expect(stat(html, "Planes vigentes")).toBeNull();
        expect(html).not.toContain("40%");
        expect(html).not.toContain("Planes por entrenador");
      } finally {
        Object.assign(ANALYTICS_QUERY_LIMITS, prev);
      }
    });

    it("G5c más ejecuciones que el máximo: planes contados, cumplimiento como Datos incompletos", async () => {
      const prev = { ...ANALYTICS_QUERY_LIMITS };
      ANALYTICS_QUERY_LIMITS.maxExecutions = 2;
      try {
        jwt(SA1, "super_admin", null);
        const html = await page();
        expect(html).toContain("Datos incompletos");
        expect(stat(html, "Planes vigentes")).toBe("5");
        expect(html).not.toContain("40%");
        expect(html).not.toMatch(/\d+%/);
      } finally {
        Object.assign(ANALYTICS_QUERY_LIMITS, prev);
      }
    });

    it("G5d más asistencias que el máximo: solo la asistencia queda como Datos incompletos", async () => {
      const prev = { ...ANALYTICS_QUERY_LIMITS };
      ANALYTICS_QUERY_LIMITS.maxAttendance = 2;
      try {
        jwt(SA1, "super_admin", null);
        const html = await page();
        expect(stat(html, "Cumplimiento")).toBe("40%");
        expect(stat(html, "Asistió")).toBeNull();
        expect(after(html, "Asistencia a clases")).toContain("Datos incompletos");
        expect(row(html, "W Sede 1")?.[7]).toBe("Datos incompletos");
      } finally {
        Object.assign(ANALYTICS_QUERY_LIMITS, prev);
      }
    });

    it("G5e justo en el máximo (páginas de 1) no es incompleto y da la misma página", async () => {
      jwt(SA1, "super_admin", null);
      const expected = await page();
      const prev = { ...ANALYTICS_QUERY_LIMITS };
      // 6 planes activos del período, 9 ejecuciones de esos planes, 5 asistencias del período
      Object.assign(ANALYTICS_QUERY_LIMITS, { pageSize: 1, maxPlans: 6, maxExecutions: 9, maxAttendance: 5 });
      try {
        const html = await page();
        expect(html).not.toContain("Datos incompletos");
        expect(html).toBe(expected);
      } finally {
        Object.assign(ANALYTICS_QUERY_LIMITS, prev);
      }
    });
  });

  describe("G6 privacidad, parámetros, Dedicated, zona horaria", () => {
    it("G6a nunca nombres ni ids de alumnos, notas privadas, comentarios, retroalimentación, motivos ni notas de planes", async () => {
      jwt(SA1, "super_admin", null);
      const html = (await page()) + (await page({ periodo: "anio" })) + (await page({ sede: W.B2 }));
      for (const s of Object.values(SECRET)) expect(html).not.toContain(s);
      for (const n of STUDENT_NAMES) expect(html).not.toContain(n);
      for (const id of [p0.clientId, p2.clientId, p3.clientId, p6.clientId, pf.clientId, p0.clientUserId!, W.U_TR1, SA1]) expect(html).not.toContain(id);
      expect(html).not.toContain("Remo");
    });

    it("G6b parámetros GET manipulados (tenant, entrenador, alumno, sede) no cambian nada", async () => {
      jwt(SA1, "super_admin", null);
      const base = await page();
      expect(
        await page({ tenant_id: T2, tenantId: T2, trainer_id: W.TR2, client_id: p2.clientId, branch_id: W.B2, location_id: W.B2, gym_id: T2 })
      ).toBe(base);
      jwt(W.U_BA2, "branch_admin", W.B2);
      expect(await page({ sede: W.B1, tenant_id: T1, branch_id: W.B1 })).toBe(await page());
    });

    it("G6c Dedicated: con los mismos ids, la base física efectiva muestra solo sus datos", async () => {
      const ded = await createItDatabase();
      try {
        await seedPlanWorld(ded.db);
        await seedPlan(ded.db, { start: "2026-03-02", end: "2026-03-29", weekdays: [1, 3], trainerId: W.TR1 });
        h.db.current = ded.db;
        jwt(SA1, "super_admin", null);
        const html = await page();
        expect(stat(html, "Planes vigentes")).toBe("1");
        expect(stat(html, "Programados vencidos")).toBe("4");
        expect(stat(html, "Cumplimiento")).toBe("Sin datos suficientes");
        expect(stat(after(html, "Asistencia a clases"), "Asistencias confirmadas")).toBe("0");
      } finally {
        await ded.drop();
      }
    }, 240_000);

    it("G6d semanas y 'hoy' en la zona del gimnasio (domingo 21:00 local = lunes UTC)", async () => {
      vi.setSystemTime(new Date("2026-03-16T03:00:00.000Z")); // 15-mar 21:00 en El Salvador
      jwt(SA1, "super_admin", null);
      const html = await page();
      // Con la fecha UTC (16-mar) p0 dejaría de ser vigente y los lunes 16 vencerían.
      expect(stat(html, "Planes vigentes")).toBe("5");
      expect(stat(html, "Programados vencidos")).toBe("10");
      expect(row(html, "Semana del 9 mar")?.[0]).toContain("(en curso)");
      expect(row(html, "Semana del 16 mar")).toBeNull();
    });

    it("G6e sin zona horaria válida: aviso, sin cálculos", async () => {
      await setPolicy(db, T1, { timezone: null });
      try {
        jwt(SA1, "super_admin", null);
        const html = await page();
        expect(html).toContain("zona horaria válida");
        expect(stat(html, "Planes vigentes")).toBeNull();
      } finally {
        await setPolicy(db, T1, { timezone: TZ });
      }
    });

    it("G6f solo lectura: un único formulario GET, ningún POST; enlaces solo a vistas existentes", async () => {
      jwt(SA1, "super_admin", null);
      const html = await page();
      expect(html).not.toMatch(/method="post"/i);
      expect((html.match(/<form/g) ?? []).length).toBe(1);
      expect(html).toMatch(/<form[^>]*method="GET"/);
      expect(html).toContain('href="/dashboard/weekly-plans/client-plans"');
      expect(html).toContain('href="/dashboard/reports/attendance/by-period"');
      expect(html).toContain('href="/dashboard/reports/trainers/classes-taught"');
    });
  });

  describe("G7 coherencia con 5A / 5B / 5C", () => {
    it("G7a un plan aislado: la sucursal B2 = loadPlanTracking (5A) = historial de loadPortalProgress (5B)", async () => {
      jwt(SA1, "super_admin", null);
      const html = await page({ sede: W.B2 });
      const tracking = await loadPlanTracking(db, { tenantId: T1, planId: p3.planId, today: TODAY, audience: "STAFF", includeSessions: false });
      const pct5a = tracking!.summary.compliancePct;
      expect(stat(html, "Cumplimiento")).toBe(`${pct5a}%`);
      const progress = await loadPortalProgress({ db, tenantId: T1, gymId: T1, clientId: p3.clientId, today: TODAY, timezone: TZ, range: "semanas", includeClasses: false });
      expect(progress.training?.plans.find((p) => p.planId === p3.planId)?.counts?.compliancePct).toBe(pct5a);
    });

    it("G7b fila de Ana = panel 5C de Ana (mismos planes vigentes, misma sede)", async () => {
      jwt(SA1, "super_admin", null);
      const html = await page({ sede: W.B1 });
      const fu = await loadTrainerFollowUp(db, { tenantId: T1, trainer: { id: W.TR1, branch_id: W.B1 }, today: TODAY, includeClasses: false });
      const s = fu.summary!;
      const r = row(after(html, "Planes por entrenador"), "Martínez, Ana")!;
      expect(r.slice(1)).toEqual([
        String(s.currentPlans),
        String(s.students),
        String(s.counts.scheduled),
        String(s.counts.completed),
        String(s.counts.partial),
        String(s.counts.skipped),
        String(s.counts.pending),
        String(s.review.length),
        `${s.pct}%`,
      ]);
    });
  });
});
