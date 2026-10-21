// ─────────────────────────────────────────────────────────────────
// GYM-4 — auditoría H01: páginas REALES de clases con JWT obsoleto contra
// PostgreSQL real desechable (se omite sin GYM_BOOKING_IT_*).
//
// Se renderizan /dashboard/classes y /dashboard/classes/[id] tal cual. Solo
// se sustituyen las fronteras externas: la sesión Auth.js (el JWT) y el
// resolvedor de organización runtime, que aquí lee el rol LIVE de la base
// igual que requireRuntimeOrganizationContext (usuario activo, mismo tenant,
// sede del JWT existente) y entrega la base desechable como runtimeDb.
// resolveEffectiveTenantContext, guards, queries y componentes son reales.
//
// Contrato: el rol y la sede LIVE mandan. Un JWT super_admin cuyo rol vigente
// es branch_admin de otra sede nunca ve alumnos ni notas privadas fuera de
// su alcance; un cambio de sede falla cerrado; el control con identidad
// vigente sigue viendo lo suyo.
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import type { PrismaClient } from "@prisma/client";

const h = vi.hoisted(() => ({
  db: { current: null as unknown },
  jwt: { current: null as null | Record<string, unknown> },
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
// Ninguna lectura de estas páginas puede caer en el Prisma global.
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
}));
vi.mock("@/modules/platform/runtime/require-runtime-organization-context", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // Réplica de la revalidación LIVE de la plataforma sobre la base desechable.
  requireRuntimeOrganizationContext: async (user: { id: string; tenant_id: string; location_id: string | null }) => {
    const db = h.db.current as PrismaClient;
    const live = await db.user.findUnique({ where: { id: user.id }, select: { status: true, tenant_id: true, role: true } });
    if (!live || live.status !== "active" || live.tenant_id !== user.tenant_id) throw new Error("RUNTIME_IDENTITY");
    if (user.location_id) {
      const branch = await db.branch.findFirst({ where: { id: user.location_id, tenant_id: user.tenant_id, status: "active" } });
      if (!branch) throw new Error("RUNTIME_LOCATION_INVALID");
    }
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
vi.mock("@/components/forms/booking-form", () => ({ BookingForm: () => <div>BOOKING_FORM</div> }));

import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "../booking/testing/pg-it-harness";
import { B1, B1B, createMember, createSession, MODALITIES_ON, seedBase, setPolicy, staffBook, T1 } from "../booking/testing/booking-fixtures";
import { createGymBookingService } from "../booking/booking-service";
import ClassDetailPage from "@/app/(dashboard)/dashboard/classes/[id]/page";
import ClassesAgendaPage from "@/app/(dashboard)/dashboard/classes/page";

const HOUR = 3_600_000;
const SECRET = "NOTA-PRIVADA-H01";
const STALE = "it-user-h01"; // usuario cuyo JWT queda obsoleto

type Role = "super_admin" | "branch_admin" | "reception" | "trainer";

/** JWT RUNTIME_CLIENT (rol/sede congelados al iniciar sesión). */
function jwt(userId: string, role: Role, location: string | null) {
  h.jwt.current = {
    id: userId,
    name: "IT",
    email: `${userId}@it.invalid`,
    role,
    tenant_id: T1,
    location_id: location,
    auth_scope: "RUNTIME_CLIENT",
    organization_id: "it-org",
  };
}

async function render(el: Promise<ReactElement>): Promise<string> {
  return renderToStaticMarkup(await el);
}
const detail = (id: string) => render(ClassDetailPage({ params: Promise.resolve({ id }) }));
const agenda = (sp: Record<string, string> = {}) => render(ClassesAgendaPage({ searchParams: Promise.resolve(sp) } as never));

describe.skipIf(!IT_ENABLED)("GYM-4 H01 — páginas reales con JWT obsoleto y rol/sede LIVE (PostgreSQL real)", () => {
  let it4: ItDatabase;
  let db: PrismaClient;
  let sesB1: string;
  let sesB1B: string;
  let memberName: string;

  /** Rol y sede LIVE del usuario obsoleto (lo que cambió el administrador). */
  const live = (role: Role, branch: string | null) => db.user.update({ where: { id: STALE }, data: { role, branch_id: branch } });

  beforeAll(async () => {
    it4 = await createItDatabase();
    db = it4.db;
    h.db.current = db;
    await seedBase(db);
    await setPolicy(db, T1, { ...MODALITIES_ON, timezone: "America/El_Salvador" });
    await db.user.create({
      data: { id: STALE, tenant_id: T1, gym_id: T1, branch_id: null, email: `${STALE}@it.invalid`, password_hash: "x", first_name: "It", last_name: "H01", role: "super_admin" },
    });
    const svc = createGymBookingService(db);
    const startsAt = new Date(Date.now() - HOUR / 2);
    sesB1 = await createSession(db, { kind: "GROUP", branch: B1, startsAt, capacity: 4 });
    sesB1B = await createSession(db, { kind: "OPEN", branch: B1B, trainer: "it-trainer-b", startsAt, capacity: 4 });
    const m = await createMember(db, { modality: "GROUP", branch: B1, sessionsTotal: 8 });
    const b = await svc.bookSession({ ...staffBook(sesB1, m.clientId), now: new Date(startsAt.getTime() - 3 * HOUR) });
    if (!b.ok) throw new Error(`booking ${b.code}`);
    await db.classAttendance.create({
      data: { tenant_id: T1, scheduled_class_id: sesB1, client_id: m.clientId, booking_id: b.value.bookingId, attendance_status: "attended", training_notes: SECRET },
    });
    const c = await db.client.findUniqueOrThrow({ where: { id: m.clientId }, select: { last_name: true } });
    memberName = c.last_name;
  }, 180_000);

  afterAll(async () => {
    await it4?.drop();
    await disconnectAdmin();
  }, 180_000);

  beforeEach(() => {
    h.jwt.current = null;
  });

  describe("detalle /dashboard/classes/[id]", () => {
    it("control: SA vigente ve alumnos y notas privadas de su tenant", async () => {
      await live("super_admin", null);
      jwt(STALE, "super_admin", null);
      const html = await detail(sesB1);
      expect(html).toContain(SECRET);
      expect(html).toContain(memberName);
    });

    it("control: BA vigente de B1 ve las notas de B1", async () => {
      await live("branch_admin", B1);
      jwt(STALE, "branch_admin", B1);
      expect(await detail(sesB1)).toContain(SECRET);
    });

    it("JWT super_admin, LIVE branch_admin de B1B → falla cerrado, sin alumnos ni notas de B1", async () => {
      await live("branch_admin", B1B);
      jwt(STALE, "super_admin", null);
      const html = await detail(sesB1);
      expect(html).not.toContain(SECRET);
      expect(html).not.toContain(memberName);
      expect(html).toContain("Vuelve a iniciar sesión");
    });

    it("JWT super_admin con sede B1, LIVE branch_admin de B1B → falla cerrado", async () => {
      await live("branch_admin", B1B);
      jwt(STALE, "super_admin", B1);
      const html = await detail(sesB1);
      expect(html).not.toContain(SECRET);
      expect(html).not.toContain(memberName);
    });

    it("JWT branch_admin de B1, LIVE trasladado a B1B → falla cerrado (sede del JWT obsoleta)", async () => {
      await live("branch_admin", B1B);
      jwt(STALE, "branch_admin", B1);
      const html = await detail(sesB1);
      expect(html).not.toContain(SECRET);
      expect(html).not.toContain(memberName);
    });

    it("JWT super_admin, LIVE recepción de B1 → ve la clase sin registro de entrenamiento ni notas privadas", async () => {
      await live("reception", B1);
      jwt(STALE, "super_admin", B1);
      const html = await detail(sesB1);
      expect(html).not.toContain(SECRET);
      expect(html).not.toContain("Editar clase");
    });

    it("JWT super_admin, LIVE recepción sin la sede del JWT → falla cerrado", async () => {
      await live("reception", B1);
      jwt(STALE, "super_admin", null);
      expect(await detail(sesB1)).not.toContain(memberName);
    });

    it("JWT super_admin, LIVE entrenador no asignado → 404, sin leer notas", async () => {
      await live("trainer", B1);
      await db.trainer.create({ data: { id: "it-trainer-h01", gym_id: T1, tenant_id: T1, branch_id: B1, user_id: STALE, first_name: "T", last_name: "H01" } });
      try {
        jwt(STALE, "super_admin", null);
        await expect(detail(sesB1)).rejects.toThrow("NEXT_NOT_FOUND");
      } finally {
        await db.trainer.delete({ where: { id: "it-trainer-h01" } });
      }
    });

    it("JWT super_admin, LIVE alumno (sin operaciones) → falla cerrado", async () => {
      await live("client" as Role, null);
      jwt(STALE, "super_admin", null);
      const html = await detail(sesB1);
      expect(html).not.toContain(memberName);
      expect(html).not.toContain(SECRET);
    });
  });

  describe("agenda /dashboard/classes", () => {
    const day = async (ses: string) =>
      (await db.scheduledClass.findUniqueOrThrow({ where: { id: ses }, select: { class_date: true } })).class_date.toISOString().slice(0, 10);

    it("control: SA vigente ve las sesiones de ambas sedes", async () => {
      await live("super_admin", null);
      jwt(STALE, "super_admin", null);
      const html = await agenda({ date: await day(sesB1) });
      expect(html).toContain(`/dashboard/classes/${sesB1}`);
      expect(html).toContain(`/dashboard/classes/${sesB1B}`);
    });

    it("JWT super_admin, LIVE branch_admin de B1B → falla cerrado, sin sesiones de otras sedes", async () => {
      await live("branch_admin", B1B);
      jwt(STALE, "super_admin", null);
      const html = await agenda({ date: await day(sesB1), branch_id: B1 });
      expect(html).not.toContain(`/dashboard/classes/${sesB1}`);
      expect(html).toContain("Vuelve a iniciar sesión");
    });

    it("BA vigente de B1B solo lista su sede aunque pida otra por URL", async () => {
      await live("branch_admin", B1B);
      jwt(STALE, "branch_admin", B1B);
      const html = await agenda({ date: await day(sesB1), branch_id: B1 });
      expect(html).toContain(`/dashboard/classes/${sesB1B}`);
      expect(html).not.toContain(`/dashboard/classes/${sesB1}`);
    });
  });
});
