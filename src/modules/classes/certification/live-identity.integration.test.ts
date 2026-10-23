// ─────────────────────────────────────────────────────────────────
// GYM — LIVE-2: identidad vigente en las acciones de agenda
// (create / update / toggle / delete de ScheduledClass).
//
// A diferencia de la certificación funcional, aquí NO se simula el
// contexto operacional: corren requireOperationalContext,
// resolveEffectiveTenantContext y requireRuntimeOrganizationContext
// REALES. La identidad cambia en la base (UPDATE users/branches) con un
// JWT antiguo vigente. Solo se sustituye infraestructura:
//  - auth(): devuelve el JWT emitido al iniciar sesión;
//  - Prisma de la instancia y del Control Plane → base desechable;
//  - router runtime (perfil + PrismaClient) → base runtime desechable;
//  - cookie de Support Session y entitlement comercial (LEGACY_UNMANAGED);
//  - puerta de licencia runtime (fuera del alcance de esta prueba).
//
// PostgreSQL REAL desechable (127.0.0.1, puerto ≠ 5432, data_directory
// verificado). Se omite sin GYM_BOOKING_IT_*.
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "../booking/testing/pg-it-harness";
import { dayOffset } from "../booking/testing/booking-fixtures";

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`REDIRECT ${url}`);
  }
}

const h = vi.hoisted(() => ({
  jwt: null as null | Record<string, unknown>,
  native: null as unknown,
  runtime: null as unknown,
  support: null as null | Record<string, unknown>,
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
  getRuntimeSession: vi.fn(async () => h.support),
  clearRuntimeSession: vi.fn(async () => {}),
}));
vi.mock("@/modules/platform/runtime/resolve-runtime-session-profile", () => ({
  resolveRuntimeProfileForSession: vi.fn(async (s: { tenantId: string }) => ({ tenantId: s.tenantId })),
}));
vi.mock("@/modules/platform/runtime/runtime-database-router", async (orig) => ({
  ...(await orig<typeof import("@/modules/platform/runtime/runtime-database-router")>()),
  resolveRuntimeDatabaseProfileForOrganization: vi.fn(async () => ({})),
  // Support Session lee la base de la instancia; RUNTIME_CLIENT, la base runtime.
  createRuntimePrismaClient: vi.fn(() => ({ client: h.support ? h.native : h.runtime, disconnect: async () => {} })),
}));
vi.mock("@/modules/platform/runtime/commercial-enforcement", async (orig) => ({
  ...(await orig<typeof import("@/modules/platform/runtime/commercial-enforcement")>()),
  resolveCommercialEnforcementContext: vi.fn(async () => ({ mode: "LEGACY_UNMANAGED", organizationId: null, effectiveModules: new Map() })),
}));

import {
  createScheduledClassAction,
  deleteScheduledClassAction,
  toggleScheduledClassStatusAction,
  updateScheduledClassAction,
} from "../actions";

type Mode = "PLATFORM_NATIVE" | "RUNTIME_CLIENT";
type Role = "super_admin" | "branch_admin" | "reception";

const ORG = randomUUID();
const TENANT: Record<Mode, string> = { PLATFORM_NATIVE: "live2-native", RUNTIME_CLIENT: "live2-runtime" };
const OTHER_TENANT: Record<Mode, string> = { PLATFORM_NATIVE: "live2-native-other", RUNTIME_CLIENT: "live2-runtime-other" };
const ids = (mode: Mode) => ({
  A: `${mode}-A`,
  B: `${mode}-B`,
  OTHER: `${mode}-other`,
});
const uuid = new Map<string, string>();
const u = (key: string) => {
  if (!uuid.has(key)) uuid.set(key, randomUUID());
  return uuid.get(key)!;
};

function fd(entries: Record<string, string | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) if (v !== undefined) f.set(k, v);
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

describe.skipIf(!IT_ENABLED)("GYM LIVE-2 · identidad vigente en la agenda (contexto real)", () => {
  let nativeIt: ItDatabase;
  let runtimeIt: ItDatabase;
  const dbOf = (mode: Mode) => (mode === "PLATFORM_NATIVE" ? nativeIt.db : runtimeIt.db) as PrismaClient;
  const matrix: Record<string, Record<string, { result: unknown; wrote: boolean }>> = {};
  let slot = 0;

  async function seed(db: PrismaClient, mode: Mode) {
    const t = TENANT[mode];
    const t2 = OTHER_TENANT[mode];
    const b = ids(mode);
    await db.runtimeTenant.createMany({ data: [{ id: t, name: t, slug: t }, { id: t2, name: t2, slug: t2 }] });
    await db.gym.createMany({ data: [{ id: t, tenant_id: t, name: t, slug: t }, { id: t2, tenant_id: t2, name: t2, slug: t2 }] });
    await db.branch.createMany({
      data: [
        { id: u(b.A), gym_id: t, tenant_id: t, name: "Sede A" },
        { id: u(b.B), gym_id: t, tenant_id: t, name: "Sede B" },
        { id: u(b.OTHER), gym_id: t2, tenant_id: t2, name: "Sede otro tenant" },
      ],
    });
    const staff = (key: string, role: Role, branch: string | null) => ({
      id: u(`${mode}-${key}`),
      tenant_id: t,
      gym_id: t,
      branch_id: branch,
      email: `${key}-${mode}@live2.invalid`,
      password_hash: "x",
      first_name: "Live",
      last_name: key,
      role,
    });
    await db.user.createMany({ data: [staff("ba", "branch_admin", u(b.A)), staff("sa", "super_admin", null)] });
    await db.trainer.create({ data: { id: u(`${mode}-trainer`), gym_id: t, tenant_id: t, branch_id: u(b.A), first_name: "T", last_name: "A" } });
    await db.trainerAvailability.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ gym_id: t, tenant_id: t, branch_id: u(b.A), trainer_id: u(`${mode}-trainer`), day_of_week: d, start_time: "05:00", end_time: "23:00" })),
    });
    await db.classType.create({ data: { id: u(`${mode}-ct`), gym_id: t, tenant_id: t, name: "Funcional", capacity_default: 10 } });
  }

  /** JWT emitido al iniciar sesión (no cambia aunque cambie la base). */
  function login(mode: Mode, key: "ba" | "sa") {
    h.jwt = {
      id: u(`${mode}-${key}`),
      role: key === "ba" ? "branch_admin" : "super_admin",
      tenant_id: TENANT[mode],
      location_id: key === "ba" ? u(ids(mode).A) : null,
      auth_scope: mode === "RUNTIME_CLIENT" ? "RUNTIME_CLIENT" : "PLATFORM",
      organization_id: mode === "RUNTIME_CLIENT" ? ORG : undefined,
    };
  }

  /** Sesión OPEN sin reservas en la sede A: objetivo de update/toggle/delete. */
  async function target(mode: Mode, date: string) {
    const id = randomUUID();
    await dbOf(mode).scheduledClass.create({
      data: {
        id,
        gym_id: TENANT[mode],
        tenant_id: TENANT[mode],
        branch_id: u(ids(mode).A),
        class_type_id: u(`${mode}-ct`),
        trainer_id: u(`${mode}-trainer`),
        title: "Objetivo",
        class_date: new Date(`${date}T00:00:00.000Z`),
        start_time: "07:00",
        end_time: "08:00",
        capacity: 10,
      },
    });
    return id;
  }

  async function state(mode: Mode, id: string) {
    const db = dbOf(mode);
    return JSON.stringify({
      sessions: await db.scheduledClass.count(),
      target: await db.scheduledClass.findUnique({ where: { id }, select: { title: true, status: true } }),
    });
  }

  /** Intenta las cuatro operaciones con el JWT vigente; registra resultado y si escribió. */
  async function attemptAll(mode: Mode, label: string) {
    const n = slot++;
    const targetDate = dayOffset(60 + n);
    const id = await target(mode, targetDate);
    const form = (extra: Record<string, string>) =>
      fd({ branch_id: u(ids(mode).A), class_type_id: u(`${mode}-ct`), trainer_id: u(`${mode}-trainer`), capacity: "10", start_time: "07:00", end_time: "08:00", ...extra });
    const ops: Record<string, () => Promise<unknown>> = {
      create: () => run(() => createScheduledClassAction(undefined, form({ title: `Nueva ${label}`, class_date: dayOffset(30 + n) }))),
      update: () => run(() => updateScheduledClassAction(undefined, form({ id, title: `Renombrada ${label}`, class_date: targetDate }))),
      toggle: () => run(() => toggleScheduledClassStatusAction(fd({ id }))),
      delete: () => run(() => deleteScheduledClassAction(fd({ id }))),
    };
    const out: Record<string, { result: unknown; wrote: boolean }> = {};
    for (const [op, call] of Object.entries(ops)) {
      const before = await state(mode, id);
      const result = await call();
      out[op] = { result, wrote: (await state(mode, id)) !== before };
      // Cada operación parte del objetivo intacto.
      await dbOf(mode).scheduledClass.updateMany({ where: { id }, data: { title: "Objetivo", status: "scheduled", cancelled_at: null, cancelled_by_user_id: null } });
    }
    matrix[`${mode}:${label}`] = out;
    return out;
  }

  const wrote = (out: Record<string, { wrote: boolean }>) => Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.wrote]));
  const NONE = { create: false, update: false, toggle: false, delete: false };
  const ALL = { create: true, update: true, toggle: true, delete: true };

  beforeAll(async () => {
    nativeIt = await createItDatabase();
    runtimeIt = await createItDatabase();
    h.native = nativeIt.db;
    h.runtime = runtimeIt.db;
    await seed(nativeIt.db, "PLATFORM_NATIVE");
    await seed(runtimeIt.db, "RUNTIME_CLIENT");
    // Organización runtime en el Control Plane (la base de la instancia hace de Control Plane).
    await nativeIt.db.platformOrganization.create({
      data: { id: ORG, code: "live2-org", name: "Live2 Org", tenant_id: TENANT.RUNTIME_CLIENT, status: "ACTIVE", license_status: "ACTIVE" },
    });
  }, 240_000);

  afterAll(async () => {
    console.info("LIVE2_MATRIX " + JSON.stringify(Object.fromEntries(Object.entries(matrix).map(([k, v]) => [k, wrote(v)]))));
    await nativeIt?.drop();
    await runtimeIt?.drop();
    await disconnectAdmin();
  }, 240_000);

  beforeEach(() => {
    h.support = null;
  });

  for (const mode of ["PLATFORM_NATIVE", "RUNTIME_CLIENT"] as const) {
    describe(mode, () => {
      const userRow = (key: "ba" | "sa") => ({ where: { id: u(`${mode}-${key}`) } });
      const restore = async () => {
        const db = dbOf(mode);
        await db.user.update({ ...userRow("ba"), data: { role: "branch_admin", branch_id: u(ids(mode).A), status: "active", tenant_id: TENANT[mode], gym_id: TENANT[mode] } });
        await db.user.update({ ...userRow("sa"), data: { role: "super_admin", status: "active" } });
        await db.branch.update({ where: { id: u(ids(mode).A) }, data: { status: "active" } });
      };

      it("control: BA y SA vigentes operan las cuatro acciones (sin regresión)", async () => {
        await restore();
        login(mode, "ba");
        expect(wrote(await attemptAll(mode, "BA vigente"))).toEqual(ALL);
        login(mode, "sa");
        expect(wrote(await attemptAll(mode, "SA vigente"))).toEqual(ALL);
      });

      it("A: users.role branch_admin → reception con el JWT antiguo → cuatro rechazos, cero escrituras", async () => {
        await restore();
        await dbOf(mode).user.update({ ...userRow("ba"), data: { role: "reception" } });
        login(mode, "ba");
        expect(wrote(await attemptAll(mode, "A rol degradado"))).toEqual(NONE);
      });

      it("B: users.branch_id A → B con la sesión antigua en A → sin operar sesiones de A", async () => {
        await restore();
        await dbOf(mode).user.update({ ...userRow("ba"), data: { branch_id: u(ids(mode).B) } });
        login(mode, "ba");
        expect(wrote(await attemptAll(mode, "B sede reasignada"))).toEqual(NONE);
      });

      it("C: super_admin pierde el rol con el JWT antiguo → sin autorización administrativa", async () => {
        await restore();
        await dbOf(mode).user.update({ ...userRow("sa"), data: { role: "reception" } });
        login(mode, "sa");
        expect(wrote(await attemptAll(mode, "C SA degradado"))).toEqual(NONE);
      });

      it("usuario desactivado → cero escrituras", async () => {
        await restore();
        await dbOf(mode).user.update({ ...userRow("ba"), data: { status: "inactive" } });
        login(mode, "ba");
        expect(wrote(await attemptAll(mode, "usuario inactivo"))).toEqual(NONE);
      });

      it("usuario movido a otro tenant → cero escrituras", async () => {
        await restore();
        await dbOf(mode).user.update({ ...userRow("ba"), data: { tenant_id: OTHER_TENANT[mode], gym_id: OTHER_TENANT[mode], branch_id: u(ids(mode).OTHER) } });
        login(mode, "ba");
        expect(wrote(await attemptAll(mode, "otro tenant"))).toEqual(NONE);
      });

      it("sucursal de la sesión desactivada → cero escrituras", async () => {
        await restore();
        await dbOf(mode).branch.update({ where: { id: u(ids(mode).A) }, data: { status: "inactive" } });
        login(mode, "ba");
        expect(wrote(await attemptAll(mode, "sede inactiva"))).toEqual(NONE);
        await restore();
      });

      it("tras restaurar la identidad, el BA vuelve a operar (fail closed reversible)", async () => {
        await restore();
        login(mode, "ba");
        expect(wrote(await attemptAll(mode, "BA restaurado"))).toEqual(ALL);
      });
    });
  }

  it("Support Session (solo lectura) sobre la base de la instancia → cero escrituras", async () => {
    login("PLATFORM_NATIVE", "sa");
    h.support = { tenantId: TENANT.PLATFORM_NATIVE, organizationId: "support-org", expiresAt: Date.now() + 3_600_000 };
    expect(wrote(await attemptAll("PLATFORM_NATIVE", "Support Session"))).toEqual(NONE);
  });
});
