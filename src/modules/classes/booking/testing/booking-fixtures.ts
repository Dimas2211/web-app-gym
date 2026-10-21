// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2B — datos sintéticos para la integración del servicio.
// Solo identificadores técnicos; sin datos de personas reales.
// ─────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import type {
  GymClientModality,
  GymSessionKind,
  MembershipStatus,
  PaymentStatus,
  PrismaClient,
  Status,
  ClassStatus,
} from "@prisma/client";
import type { BookSessionCommand, GymBookingActor, GymBookingScope } from "../booking-contracts";
import { localDate } from "../booking-eligibility";

export const TZ = "America/El_Salvador"; // UTC−6 fijo, sin DST
export const T1 = "it-tenant-1";
export const T2 = "it-tenant-2";
export const B1 = "it-branch-1a";
export const B1B = "it-branch-1b";
export const B2 = "it-branch-2";
export const TRAINER_A = "it-trainer-a"; // T1 / B1, con usuario
export const TRAINER_C = "it-trainer-c"; // T1 / B1
export const TRAINER_Z = "it-trainer-z"; // T2 / B2
export const CLASS_TYPE_1 = "it-ct-1";
export const CLASS_TYPE_2 = "it-ct-2";
export const PLAN_1 = "it-plan-1";
export const PLAN_2 = "it-plan-2";

export const USERS = {
  sa1: "it-user-sa1",
  ba1: "it-user-ba1", // BA de B1
  ba1b: "it-user-ba1b", // BA de B1B
  rc1: "it-user-rc1", // recepción de B1
  trainerA: "it-user-trainer-a",
  trainerC: "it-user-trainer-c",
  sa2: "it-user-sa2",
} as const;

export const id = (prefix: string) => `${prefix}-${randomUUID()}`;
export const key = () => randomUUID();

export async function seedBase(db: PrismaClient) {
  await db.runtimeTenant.createMany({
    data: [
      { id: T1, name: "IT One", slug: "it-one" },
      { id: T2, name: "IT Two", slug: "it-two" },
    ],
  });
  await db.gym.createMany({
    data: [
      { id: T1, tenant_id: T1, name: "IT One", slug: "it-one" },
      { id: T2, tenant_id: T2, name: "IT Two", slug: "it-two" },
    ],
  });
  await db.branch.createMany({
    data: [
      { id: B1, gym_id: T1, tenant_id: T1, name: "Sede 1A" },
      { id: B1B, gym_id: T1, tenant_id: T1, name: "Sede 1B" },
      { id: B2, gym_id: T2, tenant_id: T2, name: "Sede 2" },
    ],
  });
  const staff = (uid: string, tenant: string, role: GymBookingActor["role"], branch: string | null) => ({
    id: uid,
    tenant_id: tenant,
    gym_id: tenant,
    branch_id: branch,
    email: `${uid}@it.invalid`,
    password_hash: "x",
    first_name: "It",
    last_name: uid,
    role,
  });
  await db.user.createMany({
    data: [
      staff(USERS.sa1, T1, "super_admin", null),
      staff(USERS.ba1, T1, "branch_admin", B1),
      staff(USERS.ba1b, T1, "branch_admin", B1B),
      staff(USERS.rc1, T1, "reception", B1),
      staff(USERS.trainerA, T1, "trainer", B1),
      staff(USERS.trainerC, T1, "trainer", B1),
      staff(USERS.sa2, T2, "super_admin", null),
    ],
  });
  await db.trainer.createMany({
    data: [
      { id: TRAINER_A, gym_id: T1, tenant_id: T1, branch_id: B1, user_id: USERS.trainerA, first_name: "T", last_name: "A" },
      { id: TRAINER_C, gym_id: T1, tenant_id: T1, branch_id: B1, user_id: USERS.trainerC, first_name: "T", last_name: "C" },
      { id: "it-trainer-b", gym_id: T1, tenant_id: T1, branch_id: B1B, first_name: "T", last_name: "B" },
      { id: TRAINER_Z, gym_id: T2, tenant_id: T2, branch_id: B2, first_name: "T", last_name: "Z" },
    ],
  });
  await db.classType.createMany({
    data: [
      { id: CLASS_TYPE_1, gym_id: T1, tenant_id: T1, name: "Funcional" },
      { id: CLASS_TYPE_2, gym_id: T2, tenant_id: T2, name: "Funcional 2" },
    ],
  });
  await db.membershipPlan.createMany({
    data: [
      { id: PLAN_1, gym_id: T1, tenant_id: T1, name: "Plan 1", duration_days: 30, price: 30 },
      { id: PLAN_2, gym_id: T2, tenant_id: T2, name: "Plan 2", duration_days: 30, price: 30 },
    ],
  });
}

export const T1_STAFF_SCOPE: GymBookingScope = { tenantId: T1, locationId: null };
export const actor = (userId: string, role: GymBookingActor["role"]): GymBookingActor => ({ userId, role });
export const SA1 = actor(USERS.sa1, "super_admin");
export const BA1 = actor(USERS.ba1, "branch_admin");
export const BA1B = actor(USERS.ba1b, "branch_admin");
export const RC1 = actor(USERS.rc1, "reception");
export const SA2 = actor(USERS.sa2, "super_admin");

export interface PolicyOverrides {
  timezone?: string | null;
  personalized_booking_enabled?: boolean;
  group_booking_enabled?: boolean;
  booking_horizon_days?: number;
  booking_min_lead_minutes?: number;
  cancel_min_lead_minutes?: number;
  late_cancel_consumes_session?: boolean;
  apply_policy_to_open?: boolean;
  attendance_edit_window_hours?: number;
}

/** Fila gym_settings del tenant (upsert). Sin llamar → defaults de columna. */
export async function setPolicy(db: PrismaClient, tenant: string, overrides: PolicyOverrides) {
  await db.gymSettings.upsert({
    where: { gym_id: tenant },
    create: { gym_id: tenant, tenant_id: tenant, ...overrides },
    update: overrides,
  });
}

/** Política "operativa" de PERSONALIZED/GROUP con zona horaria. */
export const MODALITIES_ON: PolicyOverrides = {
  timezone: TZ,
  personalized_booking_enabled: true,
  group_booking_enabled: true,
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha/hora local (TZ) de un instante: { date: "YYYY-MM-DD", hhmm: "HH:mm" }. */
export function localParts(at: Date): { date: string; hhmm: string } {
  const local = new Date(at.getTime() - 6 * 3_600_000); // TZ fija UTC−6
  return { date: localDate(at, TZ), hhmm: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}` };
}

/** "YYYY-MM-DD" local de hoy + `days`. */
export function dayOffset(days: number, now = new Date()): string {
  return localDate(new Date(now.getTime() + days * 86_400_000), TZ);
}

export interface SessionInput {
  id?: string;
  tenant?: string;
  branch?: string;
  trainer?: string;
  classType?: string;
  kind?: GymSessionKind;
  capacity?: number;
  status?: ClassStatus;
  /** Fecha local "YYYY-MM-DD" + HH:mm (sin starts_at; el servicio deriva con la TZ). */
  date?: string;
  start?: string;
  end?: string;
  /** Instante exacto: fija class_date/start_time/end_time y starts_at/ends_at. */
  startsAt?: Date;
  durationMinutes?: number;
}

export async function createSession(db: PrismaClient, input: SessionInput = {}): Promise<string> {
  const sid = input.id ?? id("ses");
  const tenant = input.tenant ?? T1;
  let date = input.date ?? dayOffset(3);
  let start = input.start ?? "07:00";
  let end = input.end ?? "08:00";
  let starts_at: Date | null = null;
  let ends_at: Date | null = null;
  if (input.startsAt) {
    const s = localParts(input.startsAt);
    const e = localParts(new Date(input.startsAt.getTime() + (input.durationMinutes ?? 60) * 60_000));
    date = s.date;
    start = s.hhmm;
    end = e.date === s.date ? e.hhmm : "23:59";
    starts_at = input.startsAt;
    ends_at = new Date(input.startsAt.getTime() + (input.durationMinutes ?? 60) * 60_000);
  }
  await db.scheduledClass.create({
    data: {
      id: sid,
      gym_id: tenant,
      tenant_id: tenant,
      branch_id: input.branch ?? (tenant === T1 ? B1 : B2),
      class_type_id: input.classType ?? (tenant === T1 ? CLASS_TYPE_1 : CLASS_TYPE_2),
      trainer_id: input.trainer ?? (tenant === T1 ? TRAINER_A : TRAINER_Z),
      title: "Sesión IT",
      class_date: new Date(`${date}T00:00:00.000Z`),
      start_time: start,
      end_time: end,
      capacity: input.capacity ?? 10,
      status: input.status ?? "scheduled",
      session_kind: input.kind ?? "OPEN",
      starts_at,
      ends_at,
    },
  });
  return sid;
}

export interface ClientInput {
  id?: string;
  tenant?: string;
  branch?: string;
  modality?: GymClientModality;
  status?: Status;
  /** Crea un usuario de rol client vinculado (portal). */
  withUser?: boolean;
}

export async function createClient(db: PrismaClient, input: ClientInput = {}): Promise<{ clientId: string; userId: string | null }> {
  const cid = input.id ?? id("cli");
  const tenant = input.tenant ?? T1;
  let userId: string | null = null;
  if (input.withUser) {
    userId = `${cid}-user`;
    await db.user.create({
      data: {
        id: userId,
        tenant_id: tenant,
        gym_id: tenant,
        email: `${userId}@it.invalid`,
        password_hash: "x",
        first_name: "C",
        last_name: cid,
        role: "client",
      },
    });
  }
  await db.client.create({
    data: {
      id: cid,
      gym_id: tenant,
      tenant_id: tenant,
      branch_id: input.branch ?? (tenant === T1 ? B1 : B2),
      first_name: "C",
      last_name: cid,
      modality: input.modality ?? "NORMAL",
      status: input.status ?? "active",
      user_id: userId,
    },
  });
  return { clientId: cid, userId };
}

export interface MembershipInput {
  id?: string;
  clientId: string;
  tenant?: string;
  branch?: string;
  modality?: GymClientModality;
  sessionsTotal?: number | null;
  trainerId?: string | null;
  status?: MembershipStatus;
  payment?: PaymentStatus;
  startOffsetDays?: number;
  endOffsetDays?: number;
}

export async function createMembership(db: PrismaClient, input: MembershipInput): Promise<string> {
  const mid = input.id ?? id("mem");
  const tenant = input.tenant ?? T1;
  await db.clientMembership.create({
    data: {
      id: mid,
      gym_id: tenant,
      tenant_id: tenant,
      branch_id: input.branch ?? (tenant === T1 ? B1 : B2),
      client_id: input.clientId,
      membership_plan_id: tenant === T1 ? PLAN_1 : PLAN_2,
      start_date: new Date(`${dayOffset(input.startOffsetDays ?? -5)}T00:00:00.000Z`),
      end_date: new Date(`${dayOffset(input.endOffsetDays ?? 30)}T00:00:00.000Z`),
      price_at_sale: 30,
      final_amount: 30,
      payment_status: input.payment ?? "paid",
      status: input.status ?? "active",
      modality: input.modality ?? "NORMAL",
      sessions_total: input.sessionsTotal ?? null,
      assigned_trainer_id: input.trainerId ?? null,
    },
  });
  return mid;
}

/** Cliente + membresía en un paso. */
export async function createMember(
  db: PrismaClient,
  input: ClientInput & Omit<Partial<MembershipInput>, "clientId" | "status"> = {}
): Promise<{ clientId: string; userId: string | null; membershipId: string }> {
  const c = await createClient(db, input);
  const membershipId = await createMembership(db, {
    clientId: c.clientId,
    tenant: input.tenant,
    branch: input.branch,
    modality: input.modality,
    sessionsTotal: input.sessionsTotal,
    trainerId: input.trainerId,
    payment: input.payment,
    startOffsetDays: input.startOffsetDays,
    endOffsetDays: input.endOffsetDays,
  });
  return { ...c, membershipId };
}

export function staffBook(
  sessionId: string,
  clientId: string,
  extra: Partial<BookSessionCommand> = {}
): BookSessionCommand {
  return {
    scope: T1_STAFF_SCOPE,
    actor: SA1,
    channel: "STAFF",
    sessionId,
    clientId,
    idempotencyKey: key(),
    ...extra,
  };
}

export function portalBook(
  sessionId: string,
  member: { clientId: string; userId: string | null },
  extra: Partial<BookSessionCommand> = {}
): BookSessionCommand {
  return {
    scope: { tenantId: T1, locationId: null },
    actor: actor(member.userId ?? "missing-user", "client"),
    channel: "PORTAL",
    sessionId,
    clientId: member.clientId,
    idempotencyKey: key(),
    ...extra,
  };
}

/** Invariantes globales independientes de los triggers (I1, I2, I3, I5 y bitácora). */
export async function invariantViolations(db: PrismaClient): Promise<Record<string, number>> {
  const q = async (sql: string) => Number((await db.$queryRawUnsafe<{ n: number }[]>(sql))[0].n);
  return {
    I1_booked_count_drift: await q(`SELECT COUNT(*)::int AS n FROM scheduled_classes s
      WHERE s.booked_count <> (SELECT COUNT(*) FROM class_bookings b WHERE b.scheduled_class_id = s.id AND b.booking_status = 'confirmed')`),
    I2_sessions_used_drift: await q(`SELECT COUNT(*)::int AS n FROM client_memberships m
      WHERE m.sessions_used <> (SELECT COUNT(*) FROM class_bookings b WHERE b.client_membership_id = m.id AND b.consumption = 'CONSUMED')`),
    I3_sessions_over_total: await q(`SELECT COUNT(*)::int AS n FROM client_memberships WHERE sessions_total IS NOT NULL AND sessions_used > sessions_total`),
    I5_over_capacity: await q(`SELECT COUNT(*)::int AS n FROM scheduled_classes WHERE booked_count > capacity`),
    cancelled_session_with_confirmed: await q(`SELECT COUNT(*)::int AS n FROM class_bookings b JOIN scheduled_classes s ON s.id = b.scheduled_class_id
      WHERE s.status = 'cancelled' AND s.cancel_reason IS NOT NULL AND b.booking_status = 'confirmed'`),
    service_booking_without_event: await q(`SELECT COUNT(*)::int AS n FROM class_bookings b
      WHERE b.channel IS NOT NULL AND NOT EXISTS (SELECT 1 FROM class_booking_events e WHERE e.booking_id = b.id)`),
    operation_without_result: await q(`SELECT COUNT(*)::int AS n FROM gym_booking_operations WHERE result IS NULL`),
  };
}

export const NO_VIOLATIONS = {
  I1_booked_count_drift: 0,
  I2_sessions_used_drift: 0,
  I3_sessions_over_total: 0,
  I5_over_capacity: 0,
  cancelled_session_with_confirmed: 0,
  service_booking_without_event: 0,
  operation_without_result: 0,
};
