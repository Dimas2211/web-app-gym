// ─────────────────────────────────────────────────────────────────
// GYM-5C — página REAL /dashboard/weekly-plans/seguimiento contra PostgreSQL
// desechable (se omite sin GYM_BOOKING_IT_*). Solo se sustituyen las
// fronteras externas: sesión Auth.js, revalidación LIVE del runtime,
// contexto comercial y la sesión de soporte.
//
//  F1  datos de Ana: alcance exacto, indicadores, colas y coherencia con 5A/5B
//  F2  aislamiento: otro entrenador, otra sede, otro tenant, relaciones que NO autorizan
//  F3  identidad LIVE: rol degradado, perfil inactivo/desvinculado, recepción, cliente, admin
//  F4  módulos: gym.weekly_plans apagado, gym.classes apagado (sin consultar sus tablas)
//  F5  acceso directo a planes ajenos y parámetros del navegador ignorados
//  F6  Support Session (solo lectura) y runtime sin la migración de 5A
//  F7  privacidad: notas, comentarios, retroalimentación, motivos, bitácora
//  F8  base runtime efectiva (Dedicated) y límites de lectura ("Datos incompletos")
//  F9  zona horaria ausente, entrenador sin planes, filtros
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
// Support Session ("Operar como cliente"): cookie y perfil de base simulados.
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
import { createSession, setPolicy, T1, T2, TZ } from "@/modules/classes/booking/testing/booking-fixtures";
import { seedClient, seedPlan, seedPlanWorld, W, type SeededPlan } from "./testing/plan-it-harness";
import { recordClientReport, recordTrainerExecution } from "./training-execution-service";
import { loadPlanTracking } from "./training-tracking-queries";
import { authorizePlan } from "./plan-access";
import { FOLLOW_UP_QUERY_LIMITS } from "./trainer-follow-up-queries";
import { loadPortalProgress } from "@/modules/client-portal/progress-queries";
import FollowUpPage from "@/app/(dashboard)/dashboard/weekly-plans/seguimiento/page";
import ClientPlanDetailPage from "@/app/(dashboard)/dashboard/weekly-plans/client-plans/[id]/page";

const NOW = "2026-03-11T15:00:00.000Z"; // miércoles 09:00 en El Salvador
const TODAY = "2026-03-11";
const SECRET = {
  training: "NOTA-PRIVADA-CLASE-5C",
  activity: "NOTA-PRIVADA-ACTIVIDAD-5C",
  comment: "COMENTARIO-ALUMNO-5C",
  feedback: "RETRO-ENTRENADOR-5C",
  reason: "MOTIVO-CORRECCION-5C",
  planNotes: "NOTA-PLAN-5C",
  clientNotes: "NOTA-FICHA-5C",
};
const U_TRB2 = "w5c-user-tr-b2";
const U_TRT2 = "w5c-user-tr-t2";

type Role = "super_admin" | "branch_admin" | "reception" | "trainer" | "client";

function jwt(userId: string, role: Role, location: string | null, tenant: string = T1, scope = "RUNTIME_CLIENT") {
  h.jwt.current = { id: userId, name: "IT", email: `${userId}@it.invalid`, role, tenant_id: tenant, location_id: location, auth_scope: scope, organization_id: "it-org" };
}

const page = async (sp: Record<string, string> = {}): Promise<string> =>
  renderToStaticMarkup((await FollowUpPage({ searchParams: Promise.resolve(sp) })) as ReactElement);

async function named(db: PrismaClient, clientId: string, first: string, last: string) {
  await db.client.update({ where: { id: clientId }, data: { first_name: first, last_name: last } });
}

const NO_DATA = ["Martínez", "Díaz", "Ruiz", "Otro", "Asignada", "SedeDos", "TenantDos"];

describe.skipIf(!IT_ENABLED)("GYM-5C — panel del entrenador (PostgreSQL real)", () => {
  let it5: ItDatabase;
  let db: PrismaClient;
  let lucia: SeededPlan; // Ana, vigente, con registros
  let luciaNext: SeededPlan; // Ana, próximo
  let bruno: SeededPlan; // Ana, finalizado sin registros
  let carla: SeededPlan; // Ana, desactivado
  let wrongBranch: SeededPlan; // trainer_id = Ana pero sede B2 (fuera de su alcance)
  let diego: SeededPlan; // TR2
  let elenaId: string; // assigned_trainer = Ana y asistió a su clase, sin plan de Ana
  let sedeDos: SeededPlan; // TR_B2
  let tenantDos: SeededPlan; // TR_T2

  beforeAll(async () => {
    it5 = await createItDatabase();
    db = it5.db;
    h.db.current = db;
    await seedPlanWorld(db);
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });

    // Usuarios para el entrenador de B2 (T1) y el de T2.
    await db.user.createMany({
      data: [
        { id: U_TRB2, tenant_id: T1, gym_id: T1, branch_id: W.B2, email: `${U_TRB2}@it.invalid`, password_hash: "x", first_name: "W", last_name: "b2", role: "trainer" },
        { id: U_TRT2, tenant_id: T2, gym_id: T2, branch_id: W.BT2, email: `${U_TRT2}@it.invalid`, password_hash: "x", first_name: "W", last_name: "t2", role: "trainer" },
      ],
    });
    await db.trainer.update({ where: { id: W.TR_B2 }, data: { user_id: U_TRB2 } });
    await db.trainer.update({ where: { id: W.TR_T2 }, data: { user_id: U_TRT2 } });

    lucia = await seedPlan(db, { start: "2026-03-02", end: "2026-03-29", weekdays: [1, 3], trainerId: W.TR1, withClientUser: true });
    await named(db, lucia.clientId, "Lucía", "Martínez");
    await db.client.update({ where: { id: lucia.clientId }, data: { notes: SECRET.clientNotes } });
    await db.clientWeeklyPlan.update({ where: { id: lucia.planId }, data: { notes: SECRET.planNotes } });
    luciaNext = await seedPlan(db, { start: "2026-03-30", end: "2026-04-26", weekdays: [1], trainerId: W.TR1, clientId: lucia.clientId });
    bruno = await seedPlan(db, { start: "2026-02-02", end: "2026-02-22", weekdays: [1, 3], trainerId: W.TR1 });
    await named(db, bruno.clientId, "Bruno", "Díaz");
    carla = await seedPlan(db, { start: "2026-03-02", end: "2026-03-29", weekdays: [2], trainerId: W.TR1, status: "inactive" });
    await named(db, carla.clientId, "Carla", "Ruiz");
    wrongBranch = await seedPlan(db, { branch: W.B2, start: "2026-03-02", end: "2026-03-29", trainerId: W.TR1 });
    await named(db, wrongBranch.clientId, "Fuera", "OtraSede");
    diego = await seedPlan(db, { start: "2026-03-02", end: "2026-03-29", trainerId: W.TR2 });
    await named(db, diego.clientId, "Diego", "Otro");
    sedeDos = await seedPlan(db, { branch: W.B2, start: "2026-03-02", end: "2026-03-29", trainerId: W.TR_B2 });
    await named(db, sedeDos.clientId, "Sara", "SedeDos");
    tenantDos = await seedPlan(db, { tenant: T2, start: "2026-03-02", end: "2026-03-29", trainerId: W.TR_T2 });
    await named(db, tenantDos.clientId, "Tomás", "TenantDos");

    // Elena: asignada a Ana en su ficha y asistió a una clase de Ana, pero su plan es de TR2.
    const elena = await seedClient(db);
    elenaId = elena.clientId;
    await named(db, elenaId, "Elena", "Asignada");
    await db.client.update({ where: { id: elenaId }, data: { assigned_trainer_id: W.U_TR1 } });
    await seedPlan(db, { start: "2026-03-02", end: "2026-03-29", trainerId: W.TR2, clientId: elenaId });
    const anaClass = await createSession(db, { branch: W.B1, trainer: W.TR1, date: "2026-03-03", kind: "OPEN" });
    await db.classAttendance.create({ data: { scheduled_class_id: anaClass, client_id: elenaId, attendance_status: "attended", tenant_id: T1 } });

    // Lucía: lunes 02 completado por Ana con asistencia vinculada (notas privadas),
    // miércoles 04 solo autorreporte, lunes 09 omitido → corregido a completado con motivo.
    const s1 = await createSession(db, { branch: W.B1, trainer: W.TR2, date: "2026-03-02", kind: "OPEN" });
    const att = await db.classAttendance.create({
      data: { scheduled_class_id: s1, client_id: lucia.clientId, attendance_status: "attended", tenant_id: T1, training_notes: SECRET.training, notes: SECRET.training },
    });
    const act = crypto.randomUUID();
    await db.gymActivity.create({ data: { id: act, tenant_id: T1, name: `Remo-${act}` } });
    await db.classAttendanceActivity.create({ data: { tenant_id: T1, attendance_id: att.id, activity_id: act, activity_name: "Remo", notes: SECRET.activity } });
    const s2 = await createSession(db, { branch: W.B1, trainer: W.TR2, date: "2026-03-06", kind: "OPEN" });
    await db.classAttendance.create({ data: { scheduled_class_id: s2, client_id: lucia.clientId, attendance_status: "late", tenant_id: T1 } });
    const s3 = await createSession(db, { branch: W.B1, trainer: W.TR2, date: "2026-03-07", kind: "OPEN" });
    await db.classAttendance.create({ data: { scheduled_class_id: s3, client_id: lucia.clientId, attendance_status: "absent", tenant_id: T1 } });

    const actor = { userId: W.U_TR1, role: "trainer" as const };
    const base = { tenantId: T1, planId: lucia.planId, timezone: TZ, today: TODAY, actor };
    expect((await recordTrainerExecution(db, { ...base, planDayId: lucia.days[1], localDate: "2026-03-02", status: "completed", feedback: SECRET.feedback, reason: null, attendanceId: att.id })).ok).toBe(true);
    expect(
      (await recordClientReport(db, { tenantId: T1, clientId: lucia.clientId, planDayId: lucia.days[3], localDate: "2026-03-04", status: "partial", comment: SECRET.comment, actorUserId: lucia.clientUserId!, timezone: TZ, today: TODAY })).ok
    ).toBe(true);
    expect((await recordTrainerExecution(db, { ...base, planDayId: lucia.days[1], localDate: "2026-03-09", status: "skipped", feedback: null, reason: null, attendanceId: null })).ok).toBe(true);
    expect((await recordTrainerExecution(db, { ...base, planDayId: lucia.days[1], localDate: "2026-03-09", status: "completed", feedback: null, reason: SECRET.reason, attendanceId: null })).ok).toBe(true);
  }, 240_000);

  afterAll(async () => {
    vi.useRealTimers();
    await it5?.drop();
    await disconnectAdmin();
  }, 180_000);

  beforeEach(() => {
    vi.setSystemTime(new Date(NOW));
    h.db.current = db;
    h.jwt.current = null;
    h.support.current = null;
    h.disabled.current = new Set();
  });

  describe("F1 datos de Ana", () => {
    it("F1a indicadores de planes vigentes con la fórmula de 5A", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      const html = await page();
      expect(html).toContain("Seguimiento de mis alumnos");
      expect(html).toContain("Alumnos con plan vigente");
      // 4 programados vencidos: 02 completado, 04 parcial (autorreporte), 09 completado, 11 pendiente
      expect(html).toMatch(/Vencidos sin registro<\/p><p[^>]*>1</);
      expect(html).toMatch(/Autorreportes por revisar<\/p><p[^>]*>1</);
      expect(html).toMatch(/Con registro del entrenador<\/p><p[^>]*>2</);
      expect(html).toMatch(/Cumplimiento<\/p><p[^>]*>63%</);
      expect(html).toMatch(/Planes vigentes<\/p><p[^>]*>1</);
      expect(html).toMatch(/Alumnos con plan vigente<\/p><p[^>]*>1</);
    });

    it("F1b vista por defecto (vigentes) y Todos: sus 4 planes; nunca los ajenos", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      const vig = await page();
      expect(vig).toContain("Martínez, Lucía");
      expect(vig).not.toContain("Díaz, Bruno");
      const all = await page({ estado: "todos" });
      for (const n of ["Martínez, Lucía", "Díaz, Bruno", "Ruiz, Carla"]) expect(all).toContain(n);
      expect(all).toContain("Desactivado");
      expect(all).toContain("Finalizado");
      expect(all).toContain("Próximo");
      expect(all).toContain("4 plan(es)");
      for (const n of ["OtraSede", "Otro", "Asignada", "SedeDos", "TenantDos"]) expect(all).not.toContain(n);
    });

    it("F1c colas: autorreporte por revisar y pendiente sin registro, con acceso al detalle de 5A", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      const html = await page();
      expect(html).toContain("Por revisar");
      expect(html).toContain("Sin registro");
      expect(html).toContain(`/dashboard/weekly-plans/client-plans/${lucia.planId}`);
      expect(html).toContain("Ver seguimiento");
      // Una sesión futura (lunes 16) nunca es pendiente vencida.
      expect(html).not.toMatch(/16 mar/);
    });

    it("F1d coincide con GYM-5A (loadPlanTracking) y GYM-5B (historial de Mi progreso) para el mismo plan y fecha", async () => {
      const a5 = await loadPlanTracking(db, { tenantId: T1, planId: lucia.planId, today: TODAY, audience: "STAFF", includeSessions: false });
      expect(a5?.summary).toMatchObject({ scheduled: 4, completed: 2, partial: 1, skipped: 0, pending: 1, compliancePct: 63 });
      const b5 = await loadPortalProgress({ db, tenantId: T1, gymId: T1, clientId: lucia.clientId, today: TODAY, timezone: TZ, range: "semanas", includeClasses: false });
      const view = b5.training?.plans.find((p) => p.planId === lucia.planId);
      expect(view?.counts).toMatchObject({ scheduled: 4, completed: 2, partial: 1, pending: 1, compliancePct: 63 });
      jwt(W.U_TR1, "trainer", W.B1);
      expect(await page()).toContain(">63%<");
    });

    it("F1e cada plan listado lo autoriza también authorizePlan (mismo predicado que las escrituras de 5A)", async () => {
      const ctx = { effectiveUser: { id: W.U_TR1, role: "trainer", location_id: W.B1 }, tenantId: T1, locationId: W.B1, client: db, runtimeMode: "RUNTIME_CLIENT" as const };
      for (const p of [lucia, luciaNext, bruno, carla]) expect((await authorizePlan(ctx, p.planId)).ok).toBe(true);
      for (const p of [wrongBranch, diego, sedeDos, tenantDos]) expect((await authorizePlan(ctx, p.planId)).ok).toBe(false);
    });

    it("F1f asistencia confirmada: attended + late del período (absent no cuenta), sin duplicar la vinculada", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      const html = await page();
      expect(html).toContain("Asistencias");
      expect(html).toMatch(/en el período de tus planes vigentes:\s*<span[^>]*>2</);
    });
  });

  describe("F2 aislamiento", () => {
    it("F2a otro entrenador del mismo gimnasio y sede ve solo los suyos", async () => {
      jwt(W.U_TR2, "trainer", W.B1);
      const html = await page({ estado: "todos" });
      expect(html).toContain("Otro, Diego");
      expect(html).toContain("Asignada, Elena");
      for (const n of ["Martínez", "Díaz", "Ruiz", "SedeDos", "TenantDos"]) expect(html).not.toContain(n);
    });

    it("F2b entrenador de otra sede: solo sus planes; ni los de Ana ni el plan de Ana en su sede", async () => {
      jwt(U_TRB2, "trainer", W.B2);
      const html = await page({ estado: "todos" });
      expect(html).toContain("SedeDos, Sara");
      for (const n of ["Martínez", "OtraSede", "Otro", "TenantDos"]) expect(html).not.toContain(n);
    });

    it("F2c entrenador de otro tenant (Shared): solo su tenant", async () => {
      await setPolicy(db, T2, { timezone: "America/New_York" });
      jwt(U_TRT2, "trainer", W.BT2, T2);
      const html = await page({ estado: "todos" });
      expect(html).toContain("TenantDos, Tomás");
      for (const n of ["Martínez", "Otro", "SedeDos", "Asignada"]) expect(html).not.toContain(n);
    });

    it("F2d asignación en la ficha y asistencia a su clase NO dan acceso (Elena no aparece para Ana)", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      expect(await page({ estado: "todos" })).not.toContain("Elena");
    });
  });

  describe("F3 identidad LIVE", () => {
    const expectNoData = (html: string) => {
      for (const n of NO_DATA) expect(html).not.toContain(n);
      expect(html).not.toContain("Indicadores de mis planes");
    };

    it("F3a JWT trainer, rol LIVE client → falla cerrado sin datos", async () => {
      await db.user.update({ where: { id: W.U_TR1 }, data: { role: "client" } });
      try {
        jwt(W.U_TR1, "trainer", W.B1);
        const html = await page();
        expect(html).toContain("Vuelve a iniciar sesión");
        expectNoData(html);
      } finally {
        await db.user.update({ where: { id: W.U_TR1 }, data: { role: "trainer" } });
      }
    });

    it("F3b JWT trainer, rol LIVE reception → panel exclusivo, sin datos", async () => {
      await db.user.update({ where: { id: W.U_TR1 }, data: { role: "reception" } });
      try {
        jwt(W.U_TR1, "trainer", W.B1);
        const html = await page();
        expect(html).toContain("exclusivo para entrenadores");
        expectNoData(html);
      } finally {
        await db.user.update({ where: { id: W.U_TR1 }, data: { role: "trainer" } });
      }
    });

    it("F3c perfil Trainer inactivo → aviso y cero datos", async () => {
      await db.trainer.update({ where: { id: W.TR1 }, data: { status: "inactive" } });
      try {
        jwt(W.U_TR1, "trainer", W.B1);
        const html = await page();
        expect(html).toContain("no tiene un perfil de entrenador activo");
        expectNoData(html);
      } finally {
        await db.trainer.update({ where: { id: W.TR1 }, data: { status: "active" } });
      }
    });

    it("F3d perfil desvinculado del usuario → aviso y cero datos", async () => {
      await db.trainer.update({ where: { id: W.TR1 }, data: { user_id: null } });
      try {
        jwt(W.U_TR1, "trainer", W.B1);
        const html = await page();
        expect(html).toContain("no tiene un perfil de entrenador activo");
        expectNoData(html);
      } finally {
        await db.trainer.update({ where: { id: W.TR1 }, data: { user_id: W.U_TR1 } });
      }
    });

    it("F3e recepción y administración no obtienen el panel", async () => {
      for (const [u, r, loc] of [[W.U_RC1, "reception", W.B1], [W.U_BA1, "branch_admin", W.B1], ["it-user-sa1", "super_admin", null]] as const) {
        jwt(u, r, loc);
        const html = await page();
        expect(html).toContain("exclusivo para entrenadores");
        expectNoData(html);
      }
    });

    it("F3f cliente: requireClassViewer redirige antes de cualquier lectura", async () => {
      jwt(lucia.clientUserId!, "client", W.B1);
      await expect(page()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    });
  });

  describe("F4 módulos", () => {
    it("F4a gym.weekly_plans deshabilitado bloquea", async () => {
      h.disabled.current.add("gym.weekly_plans");
      jwt(W.U_TR1, "trainer", W.B1);
      await expect(page()).rejects.toThrow("module_not_enabled");
    });

    it("F4b gym.classes deshabilitado: no consulta class_attendance y oculta la asistencia", async () => {
      h.disabled.current.add("gym.classes");
      h.db.current = new Proxy(db, {
        get(t, p) {
          if (p === "classAttendance") throw new Error("class_attendance consultada con gym.classes apagado");
          const v = Reflect.get(t, p);
          return typeof v === "function" ? v.bind(t) : v;
        },
      });
      jwt(W.U_TR1, "trainer", W.B1);
      const html = await page();
      expect(html).toContain("Martínez, Lucía");
      expect(html).toMatch(/Cumplimiento<\/p><p[^>]*>63%</);
      expect(html).not.toContain("Asistencias");
    });
  });

  describe("F5 acceso directo", () => {
    it("F5a el detalle de 5A rechaza el plan de otro entrenador y de otro tenant", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      for (const p of [diego, tenantDos, sedeDos]) {
        await expect(ClientPlanDetailPage({ params: Promise.resolve({ id: p.planId }) })).rejects.toThrow("NEXT_NOT_FOUND");
      }
    });

    it("F5b parámetros del navegador con ids ajenos se ignoran", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      const html = await page({ trainer_id: W.TR2, tenant_id: T2, client_id: diego.clientId, branch_id: W.B2, estado: "todos" });
      expect(html).toContain("Martínez, Lucía");
      expect(html).not.toContain("Otro");
      expect(html).not.toContain("SedeDos");
    });
  });

  describe("F6 Support Session y runtime sin 5A", () => {
    it("F6a Support Session (solo lectura, rol super_admin del JWT): no obtiene el panel", async () => {
      h.support.current = { tenantId: T1, organizationId: "it-org", openedAt: NOW };
      jwt("it-user-sa1", "super_admin", null, T1, "PLATFORM");
      const html = await page();
      expect(html).toContain("exclusivo para entrenadores");
      expect(html).not.toContain("Martínez");
    });

    it("F6b el panel es solo lectura: ningún formulario POST ni acción de servidor", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      const html = await page({ estado: "todos" });
      expect(html).not.toMatch(/method="post"/i);
      expect(html).toMatch(/<form[^>]*method="GET"/);
      expect((html.match(/<form/g) ?? []).length).toBe(1);
    });

    it("F6c runtime REAL sin las tablas de 5A: aviso, sin cifras, sin error", async () => {
      await db.$executeRawUnsafe(`ALTER TABLE "client_plan_day_execution_events" RENAME TO "f6c_events_hidden"`);
      await db.$executeRawUnsafe(`ALTER TABLE "client_plan_day_executions" RENAME TO "f6c_executions_hidden"`);
      try {
        jwt(W.U_TR1, "trainer", W.B1);
        const html = await page();
        expect(html).toContain("El seguimiento por fecha aún no está disponible");
        expect(html).toContain("Martínez, Lucía");
        expect(html).not.toContain("63%");
        expect(html).not.toContain("Autorreportes por revisar");
      } finally {
        await db.$executeRawUnsafe(`ALTER TABLE "f6c_executions_hidden" RENAME TO "client_plan_day_executions"`);
        await db.$executeRawUnsafe(`ALTER TABLE "f6c_events_hidden" RENAME TO "client_plan_day_execution_events"`);
      }
    });
  });

  describe("F7 privacidad", () => {
    it("F7a nunca notas privadas, comentarios, retroalimentación, motivos, notas del plan ni ids de usuarios", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      const html = (await page({ estado: "todos" })) + (await page({ estado: "todos", revisar: "1" }));
      for (const s of Object.values(SECRET)) expect(html).not.toContain(s);
      expect(html).not.toContain(W.U_TR1);
      expect(html).not.toContain(lucia.clientUserId!);
      expect(html).not.toContain("Remo");
    });
  });

  describe("F8 base efectiva y límites", () => {
    it("F8a Dedicated: con los mismos ids, cada base física muestra solo sus datos", async () => {
      const ded = await createItDatabase();
      try {
        await seedPlanWorld(ded.db);
        const p = await seedPlan(ded.db, { start: "2026-03-02", end: "2026-03-29", trainerId: W.TR1 });
        await named(ded.db, p.clientId, "Dana", "Dedicada");
        h.db.current = ded.db;
        jwt(W.U_TR1, "trainer", W.B1);
        const html = await page();
        expect(html).toContain("Dedicada, Dana");
        expect(html).not.toContain("Martínez");
      } finally {
        await ded.drop();
      }
    }, 240_000);

    it("F8b más planes que el máximo legible: Datos incompletos, sin cifras", async () => {
      const prev = { ...FOLLOW_UP_QUERY_LIMITS };
      FOLLOW_UP_QUERY_LIMITS.maxPlans = 3;
      FOLLOW_UP_QUERY_LIMITS.pageSize = 2;
      try {
        jwt(W.U_TR1, "trainer", W.B1);
        const html = await page({ estado: "todos" });
        expect(html).toContain("Datos incompletos");
        expect(html).not.toContain("63%");
        expect(html).not.toContain("Autorreportes por revisar");
      } finally {
        Object.assign(FOLLOW_UP_QUERY_LIMITS, prev);
      }
    });

    it("F8c justo en el máximo (4 planes, páginas de 1) no es incompleto y da la misma página", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      const expected = await page({ estado: "todos" });
      const prev = { ...FOLLOW_UP_QUERY_LIMITS };
      Object.assign(FOLLOW_UP_QUERY_LIMITS, { maxPlans: 4, pageSize: 1, maxExecutions: 3 });
      try {
        const html = await page({ estado: "todos" });
        expect(html).not.toContain("Datos incompletos");
        expect(html).toBe(expected);
      } finally {
        Object.assign(FOLLOW_UP_QUERY_LIMITS, prev);
      }
    });

    it("F8d más ejecuciones que el máximo: Datos incompletos", async () => {
      const prev = { ...FOLLOW_UP_QUERY_LIMITS };
      FOLLOW_UP_QUERY_LIMITS.maxExecutions = 2;
      try {
        jwt(W.U_TR1, "trainer", W.B1);
        const html = await page();
        expect(html).toContain("Datos incompletos");
        expect(html).not.toContain("63%");
      } finally {
        Object.assign(FOLLOW_UP_QUERY_LIMITS, prev);
      }
    });
  });

  describe("F9 casos especiales", () => {
    it("F9a gimnasio sin zona horaria: aviso, sin cálculos ni datos", async () => {
      await setPolicy(db, T1, { timezone: null });
      try {
        jwt(W.U_TR1, "trainer", W.B1);
        const html = await page();
        expect(html).toContain("zona horaria");
        expect(html).not.toContain("Martínez");
      } finally {
        await setPolicy(db, T1, { timezone: TZ });
      }
    });

    it("F9b filtros combinables: búsqueda sin tildes + autorreportes por revisar", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      const hit = await page({ estado: "todos", q: "lucia martinez", revisar: "1" });
      expect(hit).toContain("Martínez, Lucía");
      expect(hit).toContain("1 plan(es)");
      const miss = await page({ estado: "todos", q: "bruno", revisar: "1" });
      expect(miss).toContain("No hay planes que coincidan");
      const fin = await page({ estado: "finalizados", pendientes: "1" });
      expect(fin).toContain("Díaz, Bruno");
      expect(fin).toContain("1 plan(es)"); // Lucía sigue en las colas de indicadores, no en el listado filtrado
    });

    it("F9c alumno sin registros: Sin datos suficientes, nunca 0 %", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      const html = await page({ estado: "finalizados" });
      expect(html).toContain("Sin datos suficientes");
      expect(html).not.toMatch(/>0%</);
    });

    it("F9d entrenador activo sin planes asignados: aviso, sin indicadores", async () => {
      const own = (await db.clientWeeklyPlan.findMany({ where: { trainer_id: W.TR2 }, select: { id: true } })).map((p) => p.id);
      await db.clientWeeklyPlan.updateMany({ where: { id: { in: own } }, data: { trainer_id: null } });
      try {
        jwt(W.U_TR2, "trainer", W.B1);
        const html = await page();
        expect(html).toContain("Aún no tienes planes de entrenamiento asignados.");
        expect(html).not.toContain("Indicadores de mis planes");
      } finally {
        await db.clientWeeklyPlan.updateMany({ where: { id: { in: own } }, data: { trainer_id: W.TR2 } });
      }
    });
  });
});
