// ─────────────────────────────────────────────────────────────────
// GYM-5A — utilidades de integración para planes semanales (PostgreSQL REAL
// desechable; se omiten sin GYM_BOOKING_IT_*, ver booking/testing/pg-it-harness).
//
// Las Server Actions validan ids con z.string().uuid(): las entidades que
// llegan por formulario (sede, entrenador, alumno, plantilla) usan UUID
// reales. Se construyen SOBRE seedBase (mismos tenants T1/T2) para reutilizar
// el motor de clases GYM-4 en las pruebas de integración.
// ─────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createClient, id, seedBase, T1, T2 } from "@/modules/classes/booking/testing/booking-fixtures";

export interface FakeUser {
  id: string;
  role: string;
  tenantId: string;
  locationId: string | null;
}

/** Entidades con UUID (ids de formulario). */
export const W = {
  B1: randomUUID(), // T1 sede principal
  B2: randomUUID(), // T1 segunda sede
  BT2: randomUUID(), // T2
  TR1: randomUUID(), // T1/B1, con usuario
  TR2: randomUUID(), // T1/B1, con usuario
  TR_OFF: randomUUID(), // T1/B1, inactivo
  TR_B2: randomUUID(), // T1/B2
  TR_T2: randomUUID(), // T2/BT2
  TPL_T1: randomUUID(),
  TPL_T2: randomUUID(),
  TPL_B2: randomUUID(), // plantilla restringida a B2
  TPL_BOOM: randomUUID(),
  U_BA1: "w-user-ba1", // branch_admin B1
  U_BA2: "w-user-ba2", // branch_admin B2
  U_RC1: "w-user-rc1",
  U_TR1: "w-user-tr1",
  U_TR2: "w-user-tr2",
} as const;

export const FAKE_USERS = {
  sa1: { id: "it-user-sa1", role: "super_admin", tenantId: T1, locationId: null },
  ba1: { id: W.U_BA1, role: "branch_admin", tenantId: T1, locationId: W.B1 },
  ba2: { id: W.U_BA2, role: "branch_admin", tenantId: T1, locationId: W.B2 },
  rc1: { id: W.U_RC1, role: "reception", tenantId: T1, locationId: W.B1 },
  tr1: { id: W.U_TR1, role: "trainer", tenantId: T1, locationId: W.B1 },
  tr2: { id: W.U_TR2, role: "trainer", tenantId: T1, locationId: W.B1 },
  sa2: { id: "it-user-sa2", role: "super_admin", tenantId: T2, locationId: null },
} satisfies Record<string, FakeUser>;

export async function seedPlanWorld(db: PrismaClient) {
  await seedBase(db);
  await db.branch.createMany({
    data: [
      { id: W.B1, gym_id: T1, tenant_id: T1, name: "W Sede 1" },
      { id: W.B2, gym_id: T1, tenant_id: T1, name: "W Sede 2" },
      { id: W.BT2, gym_id: T2, tenant_id: T2, name: "W Sede T2" },
    ],
  });
  const staff = (uid: string, role: "branch_admin" | "reception" | "trainer", branch: string) => ({
    id: uid,
    tenant_id: T1,
    gym_id: T1,
    branch_id: branch,
    email: `${uid}@it.invalid`,
    password_hash: "x",
    first_name: "W",
    last_name: uid,
    role,
  });
  await db.user.createMany({
    data: [
      staff(W.U_BA1, "branch_admin", W.B1),
      staff(W.U_BA2, "branch_admin", W.B2),
      staff(W.U_RC1, "reception", W.B1),
      staff(W.U_TR1, "trainer", W.B1),
      staff(W.U_TR2, "trainer", W.B1),
    ],
  });
  const trainer = (tid: string, tenant: string, branch: string, extra: { user?: string; status?: "active" | "inactive" } = {}) => ({
    id: tid,
    gym_id: tenant,
    tenant_id: tenant,
    branch_id: branch,
    user_id: extra.user ?? null,
    first_name: "W",
    last_name: tid.slice(0, 6),
    status: extra.status ?? "active",
  });
  await db.trainer.createMany({
    data: [
      trainer(W.TR1, T1, W.B1, { user: W.U_TR1 }),
      trainer(W.TR2, T1, W.B1, { user: W.U_TR2 }),
      trainer(W.TR_OFF, T1, W.B1, { status: "inactive" }),
      trainer(W.TR_B2, T1, W.B2),
      trainer(W.TR_T2, T2, W.BT2),
    ],
  });
  const tpl = (tid: string, tenant: string, branch: string | null) => ({
    id: tid,
    gym_id: tenant,
    tenant_id: tenant,
    branch_id: branch,
    name: tid.slice(0, 8),
    status: "active" as const,
  });
  await db.weeklyPlanTemplate.createMany({
    data: [tpl(W.TPL_T1, T1, null), tpl(W.TPL_T2, T2, null), tpl(W.TPL_B2, T1, W.B2), tpl(W.TPL_BOOM, T1, null)],
  });
}

/** Alumno T1 de la sede indicada (UUID). */
export async function seedClient(db: PrismaClient, opts: { tenant?: string; branch?: string; withUser?: boolean } = {}) {
  const tenant = opts.tenant ?? T1;
  const branch = opts.branch ?? (tenant === T1 ? W.B1 : W.BT2);
  return createClient(db, { id: randomUUID(), tenant, branch, withUser: opts.withUser });
}

export interface SeededPlan {
  planId: string;
  clientId: string;
  clientUserId: string | null;
  /** weekday → dayId */
  days: Record<number, string>;
}

export interface SeedPlanInput {
  tenant?: string;
  branch?: string;
  trainerId?: string | null;
  clientId?: string;
  withClientUser?: boolean;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  weekdays?: number[];
  status?: "active" | "inactive" | "suspended";
}

/** Plan + días (uno por weekday indicado) con tenant/sede coherentes. */
export async function seedPlan(db: PrismaClient, input: SeedPlanInput): Promise<SeededPlan> {
  const tenant = input.tenant ?? T1;
  const branch = input.branch ?? (tenant === T1 ? W.B1 : W.BT2);
  let clientId = input.clientId;
  let clientUserId: string | null = null;
  if (!clientId) {
    const c = await seedClient(db, { tenant, branch, withUser: input.withClientUser });
    clientId = c.clientId;
    clientUserId = c.userId;
  }
  const trainerId = input.trainerId === undefined ? (tenant === T1 ? W.TR1 : W.TR_T2) : input.trainerId;
  const planId = randomUUID();
  await db.clientWeeklyPlan.create({
    data: {
      id: planId,
      gym_id: tenant,
      tenant_id: tenant,
      branch_id: branch,
      client_id: clientId,
      trainer_id: trainerId,
      start_date: new Date(`${input.start}T00:00:00.000Z`),
      end_date: new Date(`${input.end}T00:00:00.000Z`),
      status: input.status ?? "active",
      assignment_type: "individual",
    },
  });
  const days: Record<number, string> = {};
  for (const w of input.weekdays ?? [1, 3, 5]) {
    const dayId = randomUUID();
    await db.clientWeeklyPlanDay.create({
      data: { id: dayId, client_weekly_plan_id: planId, weekday: w, session_name: `Día ${w}`, duration_minutes: 60, exercise_block: "3x10" },
    });
    days[w] = dayId;
  }
  return { planId, clientId, clientUserId, days };
}

export { id };
