// ─────────────────────────────────────────────────────────────────
// GYM-5C H1 (revisión externa) — alcance de LECTURA del rol trainer igual al
// de authorizePlan: tenant efectivo + Trainer activo vinculado + plan.trainer_id
// = Trainer + plan.branch_id = Trainer.branch_id. Páginas REALES contra
// PostgreSQL desechable (se omite sin GYM_BOOKING_IT_*).
//
//  H1a-e  plan inconsistente: asignado al entrenador pero de OTRA sede
//         (detalle, edición, listado 5A, panel 5C, escritura)
//  H1f-k  controles: plan correcto, otro entrenador, otro tenant, perfil
//         inactivo, rol LIVE degradado, administración, Support Session
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import type { PrismaClient } from "@prisma/client";

const h = vi.hoisted(() => ({
  db: { current: null as unknown },
  jwt: { current: null as null | Record<string, unknown> },
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
  requireOrganizationModule: vi.fn(async () => {}),
  resolveCommercialEnforcementContext: vi.fn(async () => ({
    mode: "MANAGED",
    effectiveModules: new Map(["gym.weekly_plans", "gym.classes"].map((c) => [c, { enabled: true }])),
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
import { T1, T2 } from "@/modules/classes/booking/testing/booking-fixtures";
import { seedPlan, seedPlanWorld, W, type SeededPlan } from "./testing/plan-it-harness";
import { authorizePlanDay, PLAN_FORBIDDEN, PLAN_TRAINING_ROLES } from "./plan-access";
import ClientPlanDetailPage from "@/app/(dashboard)/dashboard/weekly-plans/client-plans/[id]/page";
import ClientPlanEditPage from "@/app/(dashboard)/dashboard/weekly-plans/client-plans/[id]/edit/page";
import ClientPlansListPage from "@/app/(dashboard)/dashboard/weekly-plans/client-plans/page";
import FollowUpPage from "@/app/(dashboard)/dashboard/weekly-plans/seguimiento/page";

const NOW = "2026-03-11T15:00:00.000Z";

type Role = "super_admin" | "branch_admin" | "reception" | "trainer";

function jwt(userId: string, role: Role, location: string | null, tenant: string = T1, scope = "RUNTIME_CLIENT") {
  h.jwt.current = { id: userId, name: "IT", email: `${userId}@it.invalid`, role, tenant_id: tenant, location_id: location, auth_scope: scope, organization_id: "it-org" };
}

const html = async (el: Promise<unknown>) => renderToStaticMarkup((await el) as ReactElement);
const detail = (id: string) => html(ClientPlanDetailPage({ params: Promise.resolve({ id }) }));

describe.skipIf(!IT_ENABLED)("GYM-5C H1 — lectura del entrenador acotada a la sede de su perfil (PostgreSQL real)", () => {
  let it5: ItDatabase;
  let db: PrismaClient;
  let own: SeededPlan; // TR1, sede B1 (correcto)
  let foreign: SeededPlan; // TR1 asignado, pero sede B2 (inconsistente)
  let other: SeededPlan; // TR2, sede B1
  let tenant2: SeededPlan; // T2

  beforeAll(async () => {
    it5 = await createItDatabase();
    db = it5.db;
    h.db.current = db;
    await seedPlanWorld(db);
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
    own = await seedPlan(db, { start: "2026-03-02", end: "2026-03-29", trainerId: W.TR1 });
    await db.client.update({ where: { id: own.clientId }, data: { first_name: "Propia", last_name: "SedeUno" } });
    // Dato inconsistente (heredado o importado): trainer_id = Ana (sede B1), plan de la sede B2.
    foreign = await seedPlan(db, { branch: W.B2, start: "2026-03-02", end: "2026-03-29", trainerId: W.TR1 });
    await db.client.update({ where: { id: foreign.clientId }, data: { first_name: "Ajena", last_name: "SedeDos", email: "ajena-sede-dos@it.invalid" } });
    other = await seedPlan(db, { start: "2026-03-02", end: "2026-03-29", trainerId: W.TR2 });
    tenant2 = await seedPlan(db, { tenant: T2, start: "2026-03-02", end: "2026-03-29" });
  }, 240_000);

  afterAll(async () => {
    vi.useRealTimers();
    await it5?.drop();
    await disconnectAdmin();
  }, 180_000);

  beforeEach(() => {
    vi.setSystemTime(new Date(NOW));
    h.jwt.current = null;
    h.support.current = null;
  });

  describe("plan asignado al entrenador en otra sede", () => {
    it("H1a el detalle por URL directa rechaza la lectura (404) sin datos del alumno", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      await expect(detail(foreign.planId)).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("H1b la edición por URL directa también lo rechaza", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      await expect(html(ClientPlanEditPage({ params: Promise.resolve({ id: foreign.planId }) }))).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("H1c el listado de 5A no lo incluye (vista operativa y con filtro de estado)", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      for (const sp of [{}, { status: "active" }]) {
        const out = await html(ClientPlansListPage({ searchParams: Promise.resolve(sp) }));
        expect(out).toContain("SedeUno, Propia");
        expect(out).not.toContain("SedeDos");
        expect(out).not.toContain("ajena-sede-dos@it.invalid");
        expect(out).not.toContain(foreign.planId);
      }
    });

    it("H1d el panel 5C no lo incluye", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      const out = await html(FollowUpPage({ searchParams: Promise.resolve({ estado: "todos" }) }));
      expect(out).toContain("SedeUno, Propia");
      expect(out).not.toContain("SedeDos");
    });

    it("H1e la escritura sigue rechazada (mismo authorizePlanDay que recordPlanExecutionAction)", async () => {
      const ctx = { effectiveUser: { id: W.U_TR1, role: "trainer", location_id: W.B1 }, tenantId: T1, locationId: W.B1, client: db, runtimeMode: "RUNTIME_CLIENT" as const };
      const r = await authorizePlanDay(ctx, foreign.planId, foreign.days[1], { roles: PLAN_TRAINING_ROLES, statuses: ["active", "inactive", "suspended"] });
      expect(r).toEqual({ ok: false, error: PLAN_FORBIDDEN });
    });
  });

  describe("controles", () => {
    it("H1f plan correcto de la sede del entrenador: lectura permitida", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      const out = await detail(own.planId);
      expect(out).toContain("Propia SedeUno");
      expect(out).toContain("Seguimiento por fecha");
    });

    it("H1g otro entrenador y otro tenant: rechazo", async () => {
      jwt(W.U_TR1, "trainer", W.B1);
      await expect(detail(other.planId)).rejects.toThrow("NEXT_NOT_FOUND");
      await expect(detail(tenant2.planId)).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("H1h perfil Trainer inactivo: rechazo también de su plan correcto", async () => {
      await db.trainer.update({ where: { id: W.TR1 }, data: { status: "inactive" } });
      try {
        jwt(W.U_TR1, "trainer", W.B1);
        await expect(detail(own.planId)).rejects.toThrow("NEXT_NOT_FOUND");
        const list = await html(ClientPlansListPage({ searchParams: Promise.resolve({}) }));
        expect(list).not.toContain("SedeUno");
      } finally {
        await db.trainer.update({ where: { id: W.TR1 }, data: { status: "active" } });
      }
    });

    it("H1i rol LIVE degradado: falla cerrado sin datos", async () => {
      await db.user.update({ where: { id: W.U_TR1 }, data: { role: "client" } });
      try {
        jwt(W.U_TR1, "trainer", W.B1);
        const out = await detail(own.planId);
        expect(out).toContain("Vuelve a iniciar sesión");
        expect(out).not.toContain("SedeUno");
      } finally {
        await db.user.update({ where: { id: W.U_TR1 }, data: { role: "trainer" } });
      }
    });

    it("H1j administración conserva su alcance (super_admin global; branch_admin por su sede)", async () => {
      jwt("it-user-sa1", "super_admin", null);
      expect(await detail(foreign.planId)).toContain("Ajena SedeDos");
      jwt(W.U_BA2, "branch_admin", W.B2);
      expect(await detail(foreign.planId)).toContain("Ajena SedeDos");
      jwt(W.U_BA1, "branch_admin", W.B1);
      await expect(detail(foreign.planId)).rejects.toThrow("NEXT_NOT_FOUND");
      expect(await detail(own.planId)).toContain("Propia SedeUno");
    });

    it("H1k Support Session sigue en solo lectura", async () => {
      h.support.current = { tenantId: T1, organizationId: "it-org", openedAt: NOW };
      jwt("it-user-sa1", "super_admin", null, T1, "PLATFORM");
      const out = await detail(own.planId);
      expect(out).toContain("Propia SedeUno");
      expect(out).not.toContain("Editar plan");
      expect(out).not.toContain("Registrar entrenamiento");
    });
  });
});
