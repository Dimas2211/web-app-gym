// ─────────────────────────────────────────────────────────────────
// GYM-5A — utilidades de integración para planes semanales (PostgreSQL REAL
// desechable; se omiten sin GYM_BOOKING_IT_*, ver booking/testing/pg-it-harness).
//
// Simula el contexto operacional (requireOperationalContext) con una base
// real: los tests ejecutan las Server Actions verdaderas con un "usuario
// efectivo" LIVE configurable por prueba.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { B1, B1B, B2, T1, T2, TRAINER_A, TRAINER_C, TRAINER_Z, USERS, id, createClient } from "@/modules/classes/booking/testing/booking-fixtures";

export interface FakeUser {
  id: string;
  role: string;
  tenantId: string;
  locationId: string | null;
}

export const FAKE_USERS = {
  sa1: { id: USERS.sa1, role: "super_admin", tenantId: T1, locationId: null },
  ba1: { id: USERS.ba1, role: "branch_admin", tenantId: T1, locationId: B1 },
  ba1b: { id: USERS.ba1b, role: "branch_admin", tenantId: T1, locationId: B1B },
  rc1: { id: USERS.rc1, role: "reception", tenantId: T1, locationId: B1 },
  trainerA: { id: USERS.trainerA, role: "trainer", tenantId: T1, locationId: B1 },
  trainerC: { id: USERS.trainerC, role: "trainer", tenantId: T1, locationId: B1 },
  sa2: { id: USERS.sa2, role: "super_admin", tenantId: T2, locationId: null },
} satisfies Record<string, FakeUser>;

export interface SeededPlan {
  planId: string;
  clientId: string;
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
export async function seedPlan(db: PrismaClient, input: SeedPlanInput): Promise<SeededPlan & { clientUserId: string | null }> {
  const tenant = input.tenant ?? T1;
  const branch = input.branch ?? (tenant === T1 ? B1 : B2);
  let clientId = input.clientId;
  let clientUserId: string | null = null;
  if (!clientId) {
    const c = await createClient(db, { tenant, branch, withUser: input.withClientUser });
    clientId = c.clientId;
    clientUserId = c.userId;
  }
  const trainerId = input.trainerId === undefined ? (tenant === T1 ? TRAINER_A : TRAINER_Z) : input.trainerId;
  const planId = id("plan");
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
    const dayId = id("day");
    await db.clientWeeklyPlanDay.create({
      data: { id: dayId, client_weekly_plan_id: planId, weekday: w, session_name: `Día ${w}`, duration_minutes: 60, exercise_block: "3x10" },
    });
    days[w] = dayId;
  }
  return { planId, clientId, days, clientUserId };
}

export { TRAINER_A, TRAINER_C, TRAINER_Z };
