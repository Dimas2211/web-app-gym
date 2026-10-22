// ─────────────────────────────────────────────────────────────────
// GYM-5A — páginas REALES del seguimiento contra PostgreSQL desechable
// (se omite sin GYM_BOOKING_IT_*). Solo se sustituyen las fronteras externas:
// la sesión Auth.js, la revalidación LIVE del runtime y el contexto comercial.
//
//  P1  portal /portal/plan-semanal: fuentes distinguidas, asistencia confirmada,
//      retroalimentación visible y NINGUNA nota privada
//  P2  portal: módulo deshabilitado y gimnasio sin zona horaria
//  H02 auditoría independiente: el portal resuelve el Client con el tenant y el
//      rol LIVE del contexto (usuario/perfil vinculados entre tenants Shared,
//      rol LIVE degradado, sin perfil, usuario no cliente, módulo deshabilitado)
//  P3  detalle del plan: entrenador asignado, rol LIVE degradado, otro
//      entrenador, recepción y sede obsoleta
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
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
// Los formularios de otros módulos no participan.
vi.mock("@/components/forms/booking-form", () => ({ BookingForm: () => <div>BOOKING_FORM</div> }));

import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "@/modules/classes/booking/testing/pg-it-harness";
import { createClient, createMember, createSession, setPolicy, T1, T2, TZ } from "@/modules/classes/booking/testing/booking-fixtures";
import { seedPlan, seedPlanWorld, W, type SeededPlan } from "./testing/plan-it-harness";
import { recordClientReport, recordTrainerExecution } from "./training-execution-service";
import PlanSemanalPage from "@/app/(portal)/portal/plan-semanal/page";
import ClientPlanDetailPage from "@/app/(dashboard)/dashboard/weekly-plans/client-plans/[id]/page";

const NOW = "2026-03-11T15:00:00.000Z"; // miércoles 09:00 en El Salvador
const SECRET_NOTE = "NOTA-PRIVADA-ENTRENADOR-5A";
const SECRET_ACT = "NOTA-PRIVADA-ACTIVIDAD-5A";

type Role = "super_admin" | "branch_admin" | "reception" | "trainer" | "client";

function jwt(userId: string, role: Role, location: string | null, tenant: string = T1) {
  h.jwt.current = {
    id: userId,
    name: "IT",
    email: `${userId}@it.invalid`,
    role,
    tenant_id: tenant,
    location_id: location,
    auth_scope: "RUNTIME_CLIENT",
    organization_id: "it-org",
  };
}

async function render(el: Promise<ReactElement>): Promise<string> {
  return renderToStaticMarkup(await el);
}

describe.skipIf(!IT_ENABLED)("GYM-5A — páginas reales (PostgreSQL real)", () => {
  let it5: ItDatabase;
  let db: PrismaClient;
  let plan: SeededPlan;
  let memberId: string;
  let memberUserId: string;

  beforeAll(async () => {
    it5 = await createItDatabase();
    db = it5.db;
    h.db.current = db;
    await seedPlanWorld(db);
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });

    const m = await createMember(db, { id: crypto.randomUUID(), branch: W.B1, withUser: true });
    memberId = m.clientId;
    memberUserId = m.userId!;
    plan = await seedPlan(db, { start: "2026-03-02", end: "2026-04-26", clientId: memberId, weekdays: [1, 3], trainerId: W.TR1 });
    await db.clientWeeklyPlanDay.update({ where: { id: plan.days[3] }, data: { execution_status: "completed", executed_at: new Date("2026-02-01T10:00:00Z") } });

    // Lunes 02: entrenador completado + retroalimentación + asistencia vinculada con actividades y notas privadas.
    const sessionId = await createSession(db, { branch: W.B1, trainer: W.TR1, date: "2026-03-02", kind: "OPEN" });
    const att = await db.classAttendance.create({
      data: { scheduled_class_id: sessionId, client_id: memberId, attendance_status: "attended", training_notes: SECRET_NOTE },
    });
    const act = crypto.randomUUID();
    await db.gymActivity.create({ data: { id: act, tenant_id: T1, name: `Remo-${act}` } });
    await db.scheduledClassActivity.create({ data: { tenant_id: T1, scheduled_class_id: sessionId, activity_id: act, activity_name: "Remo común" } });
    await db.classAttendanceActivity.create({ data: { tenant_id: T1, attendance_id: att.id, activity_id: act, activity_name: "Remo común", notes: SECRET_ACT } });
    await recordTrainerExecution(db, {
      tenantId: T1, planId: plan.planId, planDayId: plan.days[1], localDate: "2026-03-02", status: "completed",
      feedback: "Excelente técnica", reason: null, attendanceId: att.id, actor: { userId: "it-user-tr1x", role: "trainer" },
      timezone: TZ, today: "2026-03-11",
    });
    // Lunes 09: solo autorreporte del alumno.
    await recordClientReport(db, {
      tenantId: T1, clientId: memberId, planDayId: plan.days[1], localDate: "2026-03-09", status: "partial",
      comment: "Me dolió el hombro", actorUserId: memberUserId, timezone: TZ, today: "2026-03-11",
    });
  }, 180_000);

  afterAll(async () => {
    vi.useRealTimers();
    await it5?.drop();
    await disconnectAdmin();
  }, 180_000);

  beforeEach(() => {
    vi.setSystemTime(new Date(NOW));
    h.jwt.current = null;
    h.disabled.current = new Set();
  });

  describe("portal /portal/plan-semanal", () => {
    const portal = () => render(PlanSemanalPage());

    it("P1 distingue autorreporte, registro del entrenador y asistencia confirmada; sin notas privadas", async () => {
      jwt(memberUserId, "client", W.B1);
      const html = await portal();
      expect(html).toContain("Mis entrenamientos por fecha");
      expect(html).toContain("Tu entrenador registró");
      expect(html).toContain("Excelente técnica");
      expect(html).toContain("Asistencia confirmada en clase");
      expect(html).toContain("Tú reportaste");
      expect(html).toContain("autorreporte, aún sin confirmar");
      expect(html).toContain("Me dolió el hombro");
      // Pendiente (miércoles 04 sin registro) y dato heredado no reinterpretado
      expect(html).toContain("Pendiente");
      expect(html).toContain("Registro anterior: Completado");
      // Privacidad: ni training_notes ni notas de actividades llegan al alumno.
      expect(html).not.toContain(SECRET_NOTE);
      expect(html).not.toContain(SECRET_ACT);
    });

    it("P1b el entrenador revisó 2026-03-02: no ofrece formulario; lo pendiente reciente sí", async () => {
      jwt(memberUserId, "client", W.B1);
      const html = await portal();
      expect(html).toContain("Tu entrenador ya revisó esta sesión");
      expect(html).toContain('name="local_date"');
    });

    it("P2 módulo gym.weekly_plans deshabilitado → mensaje, sin datos del plan", async () => {
      h.disabled.current.add("gym.weekly_plans");
      jwt(memberUserId, "client", W.B1);
      const html = await portal();
      expect(html).toContain("no está disponible");
      expect(html).not.toContain("Excelente técnica");
    });

    it("P2b gimnasio sin zona horaria: avisa y no ofrece registro por fecha", async () => {
      await setPolicy(db, T1, { timezone: null });
      try {
        jwt(memberUserId, "client", W.B1);
        const html = await portal();
        expect(html).toContain("zona horaria");
        expect(html).not.toContain('name="local_date"');
      } finally {
        await setPolicy(db, T1, { timezone: TZ });
      }
    });
  });

  describe("H02 portal /portal/plan-semanal — alcance de tenant y rol LIVE", () => {
    const portal = () => render(PlanSemanalPage());
    const SECRET_SESSION = "SESION-OTRO-TENANT-H02";
    const NO_PROFILE = "Tu perfil de cliente aún no está configurado.";
    let t1Client: string; // Client de T1 con plan, vinculado a un usuario de T2
    let t2User: string; // usuario client de T2 (JWT T2) enlazado al Client de T1
    let t2Client: string; // Client de T2 con plan, vinculado a un usuario de T1
    let t1User: string;

    async function userRow(id: string, tenant: string, role = "client") {
      await db.user.create({
        data: { id, tenant_id: tenant, gym_id: tenant, email: `${id}@it.invalid`, password_hash: "x", first_name: "U", last_name: id, role: role as never },
      });
    }

    beforeAll(async () => {
      const suffix = crypto.randomUUID().slice(0, 8);
      // Client de T1 (con plan) enlazado por error al usuario de T2.
      t1Client = (await createClient(db, { id: crypto.randomUUID(), tenant: T1, branch: W.B1 })).clientId;
      t2User = `h02-user-t2-${suffix}`;
      await userRow(t2User, T2);
      await db.client.update({ where: { id: t1Client }, data: { user_id: t2User } });
      const p1 = await seedPlan(db, { start: "2026-03-02", end: "2026-04-26", clientId: t1Client, weekdays: [1, 3], trainerId: W.TR1 });
      await db.clientWeeklyPlanDay.updateMany({ where: { client_weekly_plan_id: p1.planId }, data: { session_name: SECRET_SESSION } });

      // Client de T2 (con plan) enlazado por error al usuario de T1.
      t2Client = (await createClient(db, { id: crypto.randomUUID(), tenant: T2, branch: W.BT2 })).clientId;
      t1User = `h02-user-t1-${suffix}`;
      await userRow(t1User, T1);
      await db.client.update({ where: { id: t2Client }, data: { user_id: t1User } });
      const p2 = await seedPlan(db, { tenant: T2, start: "2026-03-02", end: "2026-04-26", clientId: t2Client, weekdays: [1, 3], trainerId: W.TR_T2 });
      await db.clientWeeklyPlanDay.updateMany({ where: { client_weekly_plan_id: p2.planId }, data: { session_name: SECRET_SESSION } });
    });

    it("H02a usuario de T2 enlazado a un Client de T1 → no revela planes ni datos de T1", async () => {
      jwt(t2User, "client", W.BT2, T2);
      const html = await portal();
      expect(html).toContain(NO_PROFILE);
      expect(html).not.toContain(SECRET_SESSION);
      expect(html).not.toContain("Programación personalizada");
    });

    it("H02b usuario de T1 enlazado a un Client de T2 → no revela planes ni datos de T2", async () => {
      jwt(t1User, "client", W.B1, T1);
      const html = await portal();
      expect(html).toContain(NO_PROFILE);
      expect(html).not.toContain(SECRET_SESSION);
      expect(html).not.toContain("Programación personalizada");
    });

    it("H02c rol LIVE degradado (JWT client, LIVE reception) → sin datos personales", async () => {
      await db.user.update({ where: { id: memberUserId }, data: { role: "reception" } });
      try {
        jwt(memberUserId, "client", W.B1);
        const html = await portal();
        expect(html).toContain("no tiene acceso al portal");
        expect(html).not.toContain("Excelente técnica");
        expect(html).not.toContain("Me dolió el hombro");
        expect(html).not.toContain("Programación personalizada");
      } finally {
        await db.user.update({ where: { id: memberUserId }, data: { role: "client" } });
      }
    });

    it("H02d usuario client sin perfil Client → mensaje, sin consultar nada más", async () => {
      const orphan = `h02-orphan-${crypto.randomUUID().slice(0, 8)}`;
      await userRow(orphan, T1);
      jwt(orphan, "client", W.B1);
      const html = await portal();
      expect(html).toContain(NO_PROFILE);
      expect(html).not.toContain("Programación personalizada");
    });

    it("H02e usuario normal (JWT staff) no entra al portal del alumno", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      await expect(portal()).rejects.toThrow(/NEXT_REDIRECT/);
    });

    it("H02f módulo deshabilitado → mensaje, sin datos del plan (Shared)", async () => {
      h.disabled.current.add("gym.weekly_plans");
      jwt(memberUserId, "client", W.B1);
      const html = await portal();
      expect(html).toContain("no está disponible");
      expect(html).not.toContain("Excelente técnica");
      expect(html).not.toContain("Programación personalizada");
    });

    it("H02g Dedicated: Client heredado con tenant_id NULL del mismo gym sigue accediendo (sin regresión)", async () => {
      const legacy = await createClient(db, { id: crypto.randomUUID(), tenant: T1, branch: W.B1, withUser: true });
      await db.client.update({ where: { id: legacy.clientId }, data: { tenant_id: null } });
      const p = await seedPlan(db, { start: "2026-03-02", end: "2026-04-26", clientId: legacy.clientId, weekdays: [1], trainerId: W.TR1 });
      await db.clientWeeklyPlanDay.updateMany({ where: { client_weekly_plan_id: p.planId }, data: { session_name: "SESION-HEREDADA-H02" } });
      jwt(legacy.userId!, "client", W.B1);
      const html = await portal();
      expect(html).toContain("SESION-HEREDADA-H02");
    });

    it("H02h control positivo: alumno propio de su tenant sigue viendo su plan", async () => {
      jwt(memberUserId, "client", W.B1);
      const html = await portal();
      expect(html).toContain("Programación personalizada");
      expect(html).not.toContain(SECRET_SESSION);
    });
  });

  describe("detalle /dashboard/weekly-plans/client-plans/[id]", () => {
    const detail = () => render(ClientPlanDetailPage({ params: Promise.resolve({ id: plan.planId }) }));

    it("P3 entrenador asignado ve el seguimiento, puede registrar y ve actividades; nunca notas privadas", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      const html = await detail();
      expect(html).toContain("Seguimiento por fecha");
      expect(html).toContain("Registrar entrenamiento");
      expect(html).toContain("Alumno (autorreporte)");
      expect(html).toContain("Me dolió el hombro");
      expect(html).toContain("Remo común");
      expect(html).toContain("Asistencia confirmada");
      expect(html).toContain("Cumplimiento");
      expect(html).not.toContain(SECRET_NOTE);
      expect(html).not.toContain(SECRET_ACT);
    });

    it("P3b otro entrenador de la misma sede no ve el plan (404)", async () => {
      jwt(W.U_TR2, "trainer", W.B1);
      await expect(detail()).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("P3c JWT trainer pero rol LIVE client → falla cerrado, sin datos", async () => {
      await db.user.update({ where: { id: W.U_TR1 }, data: { role: "client" } });
      try {
        jwt(W.U_TR1, "trainer", W.B1);
        const html = await detail();
        expect(html).toContain("Vuelve a iniciar sesión");
        expect(html).not.toContain("Seguimiento por fecha");
        expect(html).not.toContain("Me dolió el hombro");
      } finally {
        await db.user.update({ where: { id: W.U_TR1 }, data: { role: "trainer" } });
      }
    });

    it("P3d recepción ve el plan pero no registra ni ve clases/actividades", async () => {
      jwt(W.U_RC1, "reception", W.B1);
      const html = await detail();
      expect(html).toContain("Seguimiento por fecha");
      expect(html).not.toContain("Registrar entrenamiento");
      expect(html).not.toContain("Remo común");
    });

    it("P3e admin de sede trasladada con JWT obsoleto → falla cerrado", async () => {
      await db.user.update({ where: { id: W.U_BA1 }, data: { branch_id: W.B2 } });
      try {
        jwt(W.U_BA1, "branch_admin", W.B1);
        const html = await detail();
        expect(html).toContain("Vuelve a iniciar sesión");
        expect(html).not.toContain("Me dolió el hombro");
      } finally {
        await db.user.update({ where: { id: W.U_BA1 }, data: { branch_id: W.B1 } });
      }
    });

    it("P3f con gym.classes deshabilitado no muestra clases ni actividades, pero el seguimiento sigue", async () => {
      h.disabled.current.add("gym.classes");
      jwt(W.U_TR1, "trainer", W.B1);
      const html = await detail();
      expect(html).toContain("Seguimiento por fecha");
      expect(html).not.toContain("Remo común");
      expect(html).not.toContain("Clases a las que asistió");
    });
  });
});
