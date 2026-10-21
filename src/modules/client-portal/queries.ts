import { prisma } from "@/lib/db/prisma";
import type {
  AttendanceStatus,
  BookingStatus,
  Gender,
  GymBookingCancellationType,
  GymClientModality,
  GymSessionKind,
  MembershipStatus,
  PaymentStatus,
  Prisma,
  PrismaClient,
  Status,
} from "@prisma/client";
import { loadGymBookingPolicy } from "@/modules/classes/booking/booking-service";
import { gymBookingErrorMessage } from "@/modules/classes/booking/booking-messages";
import { sessionKindReadiness, type GymBookingPolicy } from "@/modules/classes/booking/booking-policy";
import { SESSION_KIND_FOR_MODALITY } from "@/modules/classes/booking/booking-rules";
import { dateOnly, localDate, type MembershipCandidate } from "@/modules/classes/booking/booking-eligibility";
import {
  dateColumn,
  evaluatePortalSession,
  resolvePortalWeek,
  sessionLocalTimes,
  type PortalEvaluation,
  type PortalOwnBooking,
  type PortalOwnSlot,
} from "./portal-schedule";

// FASE VI-D7: `client` opcional, default Prisma global solo para
// compatibilidad de callers no migrados. El Client Portal (`/portal/*`)
// es la superficie más expuesta al aislamiento runtime — un miembro real
// de un tenant hosteado nunca debe leer su perfil/membresía/clases/plan
// desde el Prisma global de la plataforma.

// ============================================================
// PERFIL DEL CLIENTE
// ============================================================

/**
 * Retorna el registro Client vinculado a un usuario, o null si no tiene perfil.
 * GYM-BOOKINGS 3B: con `scope`, además exige el tenant del contexto
 * operacional (aislamiento explícito en bases Shared); una fila heredada con
 * tenant_id NULL solo se acepta si pertenece al gym del contexto.
 */
export async function getClientByUserId(
  userId: string,
  client: PrismaClient = prisma,
  scope?: { tenantId: string; gymId: string | null }
) {
  return client.client.findFirst({
    where: {
      user_id: userId,
      ...(scope
        ? {
            OR: [
              { tenant_id: scope.tenantId },
              ...(scope.gymId ? [{ tenant_id: null, gym_id: scope.gymId }] : []),
            ],
          }
        : {}),
    },
    include: {
      branch: { select: { id: true, name: true } },
      sport: { select: { id: true, name: true } },
      goal: { select: { id: true, name: true } },
      assigned_trainer: {
        select: { id: true, first_name: true, last_name: true },
      },
    },
  });
}

// ============================================================
// MEMBRESÍAS
// ============================================================

/** Retorna la membresía activa y vigente del cliente (la más reciente si hay varias). */
export async function getMyActiveMembership(clientId: string, client: PrismaClient = prisma) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return client.clientMembership.findFirst({
    where: {
      client_id: clientId,
      status: "active",
      payment_status: { in: ["paid", "partial"] },
      start_date: { lte: today },
      end_date: { gte: today },
    },
    include: {
      membership_plan: {
        select: { name: true, access_type: true, description: true },
      },
    },
    orderBy: { end_date: "desc" },
  });
}

/**
 * Retorna la membresía más reciente que ya venció (end_date en el pasado) y fue pagada.
 * Se usa para mostrar el aviso de membresía caducada y calcular días hábiles desde el vencimiento.
 */
export async function getLastExpiredMembership(clientId: string, client: PrismaClient = prisma) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return client.clientMembership.findFirst({
    where: {
      client_id: clientId,
      end_date: { lt: today },
      status: { not: "cancelled" },
      payment_status: { in: ["paid", "partial"] },
    },
    select: { id: true, end_date: true },
    orderBy: { end_date: "desc" },
  });
}

/** Historial completo de membresías del cliente. */
export async function getMyMemberships(clientId: string, client: PrismaClient = prisma) {
  return client.clientMembership.findMany({
    where: { client_id: clientId },
    include: {
      membership_plan: {
        select: { name: true, access_type: true },
      },
    },
    orderBy: { start_date: "desc" },
  });
}

// ============================================================
// CLASES
// ============================================================

// GYM-BOOKINGS 3B: el calendario y "mis reservas" se leen con
// loadPortalSchedule / loadPortalBookings (al final del archivo), que
// filtran por tenant, modalidad, entrenador autorizado y usan booked_count.

/** Reserva activa del cliente para una clase específica. */
export async function getMyBookingForClass(clientId: string, classId: string, client: PrismaClient = prisma) {
  return client.classBooking.findUnique({
    where: {
      scheduled_class_id_client_id: {
        scheduled_class_id: classId,
        client_id: clientId,
      },
    },
  });
}

// ============================================================
// PLAN SEMANAL
// ============================================================

/** Plan semanal activo y vigente del cliente. */
export async function getMyActivePlan(clientId: string, client: PrismaClient = prisma) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return client.clientWeeklyPlan.findFirst({
    where: {
      client_id: clientId,
      status: "active",
      start_date: { lte: today },
      end_date: { gte: today },
    },
    include: {
      template: { select: { name: true, description: true } },
      trainer: { select: { first_name: true, last_name: true } },
      days: { orderBy: { weekday: "asc" } },
    },
    orderBy: { start_date: "desc" },
  });
}

/** Historial de planes semanales del cliente. */
export async function getMyPlans(clientId: string, client: PrismaClient = prisma) {
  return client.clientWeeklyPlan.findMany({
    where: { client_id: clientId },
    include: {
      template: { select: { name: true } },
      trainer: { select: { first_name: true, last_name: true } },
      days: { orderBy: { weekday: "asc" } },
    },
    orderBy: { start_date: "desc" },
  });
}

// ============================================================
// HISTORIAL DE ASISTENCIA
// ============================================================

// ============================================================
// MEMBRESÍA — VALIDACIÓN
// ============================================================

/** Devuelve true si el cliente tiene membresía activa y vigente hoy. */
export async function hasActiveMembership(clientId: string, client: PrismaClient = prisma): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const found = await client.clientMembership.findFirst({
    where: {
      client_id: clientId,
      status: "active",
      payment_status: { in: ["paid", "partial"] },
      start_date: { lte: today },
      end_date: { gte: today },
    },
    select: { id: true },
  });
  return found !== null;
}

// ============================================================
// PROGRAMACIÓN GENERAL
// ============================================================

/**
 * Retorna plantillas activas que coinciden con el perfil del cliente.
 *
 * Lógica AND: cada criterio no nulo de la plantilla debe coincidir con el
 * atributo correspondiente del cliente.
 * - Si el cliente tiene sport_id → solo ve plantillas con target_sport_id null
 *   o igual a su sport_id.
 * - Si el cliente NO tiene sport_id → solo ve plantillas sin target_sport_id.
 * Igual para goal_id y gender.
 *
 * Plantillas con todos los criterios en null se muestran a cualquier cliente
 * del mismo gimnasio/sucursal (programación verdaderamente general).
 */
export async function getMyGeneralTemplates(
  profile: {
    gym_id: string;
    branch_id: string;
    sport_id: string | null;
    goal_id: string | null;
    gender: Gender | null;
  },
  client: PrismaClient = prisma,
) {
  return client.weeklyPlanTemplate.findMany({
    where: {
      gym_id: profile.gym_id,
      status: "active",
      AND: [
        // scope de sucursal: global (null) o la sucursal del cliente
        { OR: [{ branch_id: null }, { branch_id: profile.branch_id }] },
        // deporte: si el cliente tiene uno, acepta null o coincidencia exacta
        profile.sport_id
          ? { OR: [{ target_sport_id: null }, { target_sport_id: profile.sport_id }] }
          : { target_sport_id: null },
        // meta: ídem
        profile.goal_id
          ? { OR: [{ target_goal_id: null }, { target_goal_id: profile.goal_id }] }
          : { target_goal_id: null },
        // género: ídem
        profile.gender
          ? { OR: [{ target_gender: null }, { target_gender: profile.gender }] }
          : { target_gender: null },
      ],
    },
    include: {
      days: { orderBy: { weekday: "asc" } },
      target_sport: { select: { name: true } },
      target_goal: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
}

/**
 * Historial de asistencia registrada del cliente (últimas 60 entradas).
 * GYM-BOOKINGS 3B: solo campos que el alumno puede ver — nunca notes,
 * training_notes ni quién registró. Propias del tenant del contexto (o
 * heredadas con tenant_id NULL, que pertenecen al mismo Client).
 */
export async function getMyAttendance(clientId: string, client: PrismaClient = prisma, tenantId?: string) {
  return client.classAttendance.findMany({
    where: { client_id: clientId, ...(tenantId ? { OR: [{ tenant_id: tenantId }, { tenant_id: null }] } : {}) },
    select: {
      id: true,
      attendance_status: true,
      checked_in_at: true,
      scheduled_class: {
        select: {
          id: true,
          title: true,
          class_date: true,
          start_time: true,
          end_time: true,
          starts_at: true,
          ends_at: true,
          session_kind: true,
          class_type: { select: { name: true } },
          trainer: { select: { first_name: true, last_name: true } },
          branch: { select: { name: true } },
        },
      },
    },
    orderBy: { scheduled_class: { class_date: "desc" } },
    take: 60,
  });
}

// ============================================================
// GYM-BOOKINGS 3B — CALENDARIO, RESERVAS Y MEMBRESÍA DEL ALUMNO
// ============================================================
//
// Toda lectura recibe el PrismaClient del contexto operacional y el
// tenant del contexto; el Client ya viene resuelto desde la sesión
// (portal-context.ts). La elegibilidad que se muestra sale de
// evaluatePortalSession, que reutiliza las reglas del motor 2B.

const PORTAL_SESSION_SELECT = {
  id: true,
  title: true,
  branch_id: true,
  trainer_id: true,
  session_kind: true,
  status: true,
  class_date: true,
  start_time: true,
  end_time: true,
  starts_at: true,
  ends_at: true,
  capacity: true,
  booked_count: true,
  room_name: true,
  class_type: { select: { name: true } },
  trainer: { select: { first_name: true, last_name: true } },
  branch: { select: { name: true } },
} satisfies Prisma.ScheduledClassSelect;

type PortalSessionRow = Prisma.ScheduledClassGetPayload<{ select: typeof PORTAL_SESSION_SELECT }>;

const OWN_BOOKING_SELECT = {
  id: true,
  booking_status: true,
  consumption: true,
  client_membership_id: true,
  cancellation_type: true,
} satisfies Prisma.ClassBookingSelect;

const CANDIDATE_MEMBERSHIP_SELECT = {
  id: true,
  status: true,
  payment_status: true,
  start_date: true,
  end_date: true,
  modality: true,
  sessions_total: true,
  sessions_used: true,
  assigned_trainer_id: true,
} satisfies Prisma.ClientMembershipSelect;

export interface PortalSessionView {
  id: string;
  title: string;
  typeName: string;
  trainerName: string;
  branchName: string;
  roomName: string | null;
  kind: GymSessionKind;
  /** Fecha y horas locales del gimnasio. */
  date: string;
  start: string;
  end: string;
  capacity: number;
  booked: number;
  evaluation: PortalEvaluation;
  ownBookingId: string | null;
  ownCancellation: GymBookingCancellationType | null;
}

interface EvaluationBase {
  policy: GymBookingPolicy;
  today: string;
  /** Membresías del alumno en el tenant (mismo universo que bloquea bookSession). */
  memberships: MembershipCandidate[];
}

async function loadEvaluationBase(db: PrismaClient, tenantId: string, clientId: string, now: Date): Promise<EvaluationBase> {
  const [policy, memberships] = await Promise.all([
    loadGymBookingPolicy(db, tenantId),
    db.clientMembership.findMany({
      where: { client_id: clientId, tenant_id: tenantId },
      select: CANDIDATE_MEMBERSHIP_SELECT,
      orderBy: { id: "asc" },
    }),
  ]);
  return { policy, today: localDate(now, policy.timezone), memberships };
}

/** Candidatas de bookSession: status active + la membresía de la reserva previa. */
function candidatesFor(base: EvaluationBase, own: PortalOwnBooking | null): MembershipCandidate[] {
  return base.memberships.filter((m) => m.status === "active" || m.id === own?.client_membership_id);
}

/**
 * Entrenadores PERSONALIZED autorizados: ClientMembership.assigned_trainer_id
 * (→ Trainer) de membresías PERSONALIZED activas y no vencidas. Nunca el
 * campo heredado Client.assigned_trainer_id (→ User).
 */
export function authorizedPersonalizedTrainerIds(memberships: readonly MembershipCandidate[], today: string): string[] {
  const ids = new Set<string>();
  for (const m of memberships) {
    if (m.modality === "PERSONALIZED" && m.status === "active" && m.assigned_trainer_id && dateOnly(m.end_date) >= today) {
      ids.add(m.assigned_trainer_id);
    }
  }
  return [...ids].sort();
}

function toView(
  row: PortalSessionRow,
  own: PortalOwnBooking | null,
  evaluation: PortalEvaluation,
  timeZone: string | null
): PortalSessionView {
  const local = sessionLocalTimes(row, timeZone);
  return {
    id: row.id,
    title: row.title,
    typeName: row.class_type.name,
    trainerName: `${row.trainer.first_name} ${row.trainer.last_name}`.trim(),
    branchName: row.branch.name,
    roomName: row.room_name,
    kind: row.session_kind,
    date: local.date,
    start: local.start,
    end: local.end,
    capacity: row.capacity,
    booked: row.booked_count,
    evaluation,
    ownBookingId: own?.id ?? null,
    ownCancellation: own?.booking_status === "cancelled" ? own.cancellation_type : null,
  };
}

type PortalClientRef = { id: string; branch_id: string; modality: GymClientModality; status: Status };

export interface PortalSchedule {
  today: string;
  week: { start: string; end: string; days: string[] };
  allowedKind: GymSessionKind;
  /** Avisos de contexto (modalidad deshabilitada, sin entrenador autorizado). */
  notices: string[];
  days: { date: string; sessions: PortalSessionView[] }[];
}

/**
 * Calendario semanal autorizado del alumno.
 *
 * Visibilidad (además de tenant_id = contexto):
 *  - NORMAL → OPEN de su sede; GROUP → GROUP de su sede;
 *  - PERSONALIZED → PERSONALIZED de su sede SOLO con entrenadores autorizados
 *    por su membresía (no se divulgan sesiones privadas ajenas);
 *  - modalidad no habilitada (R18) → ninguna sesión nueva;
 *  - siempre: las sesiones donde el alumno tiene reserva (historial propio),
 *    sin conceder por ello nuevas reservas.
 * Cupo: booked_count / capacity (contadores del trigger). No se cargan
 * reservas de otros alumnos.
 */
export async function loadPortalSchedule(input: {
  db: PrismaClient;
  tenantId: string;
  client: PortalClientRef;
  week?: string | null;
  now?: Date;
}): Promise<PortalSchedule> {
  const { db, tenantId, client } = input;
  const now = input.now ?? new Date();
  const base = await loadEvaluationBase(db, tenantId, client.id, now);
  const week = resolvePortalWeek(input.week, base.today);
  const allowedKind = SESSION_KIND_FOR_MODALITY[client.modality];
  const readiness = sessionKindReadiness(base.policy, allowedKind);

  const notices: string[] = [];
  const visibility: Prisma.ScheduledClassWhereInput[] = [{ bookings: { some: { client_id: client.id } } }];
  if (!readiness.ok) {
    notices.push(gymBookingErrorMessage(readiness.code, "portal"));
  } else if (allowedKind === "PERSONALIZED") {
    const trainerIds = authorizedPersonalizedTrainerIds(base.memberships, base.today);
    if (trainerIds.length === 0) {
      notices.push("No tienes un entrenador personalizado asignado en una membresía vigente. Acércate a recepción.");
    } else {
      visibility.push({ session_kind: "PERSONALIZED", branch_id: client.branch_id, trainer_id: { in: trainerIds } });
    }
  } else {
    visibility.push({ session_kind: allowedKind, branch_id: client.branch_id });
  }

  const rows = await db.scheduledClass.findMany({
    where: {
      tenant_id: tenantId,
      class_date: { gte: dateColumn(week.start), lte: dateColumn(week.end) },
      OR: visibility,
    },
    select: {
      ...PORTAL_SESSION_SELECT,
      bookings: { where: { client_id: client.id }, select: OWN_BOOKING_SELECT },
    },
    orderBy: [{ class_date: "asc" }, { start_time: "asc" }],
    take: 500,
  });

  const ownSlots: PortalOwnSlot[] = rows
    .filter((r) => r.status !== "cancelled" && r.bookings[0]?.booking_status === "confirmed")
    .map((r) => ({ sessionId: r.id, date: dateOnly(r.class_date), start: r.start_time, end: r.end_time }));

  const byDay = new Map<string, PortalSessionView[]>(week.days.map((d) => [d, []]));
  for (const row of rows) {
    const own = row.bookings[0] ?? null;
    const evaluation = evaluatePortalSession({
      session: row,
      client,
      policy: base.policy,
      now,
      memberships: candidatesFor(base, own),
      ownBooking: own,
      ownSlots,
    });
    const view = toView(row, own, evaluation, base.policy.timezone);
    (byDay.get(view.date) ?? byDay.get(dateOnly(row.class_date)))?.push(view);
  }
  const days = week.days.map((date) => ({
    date,
    sessions: (byDay.get(date) ?? []).sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id)),
  }));

  return { today: base.today, week, allowedKind, notices, days };
}

export interface PortalBookingView extends PortalSessionView {
  bookingStatus: BookingStatus;
  attendance: AttendanceStatus | null;
}

export interface PortalBookings {
  today: string;
  upcoming: PortalBookingView[];
  past: PortalBookingView[];
  cancelled: PortalBookingView[];
}

/**
 * Reservas propias (máx. 200 más recientes) clasificadas en próximas,
 * pasadas y canceladas, con la acción de cancelar solo cuando
 * cancelBooking la aceptaría. Sin cancel_reason (comentario interno del
 * staff) ni datos de otros alumnos.
 */
export async function loadPortalBookings(input: {
  db: PrismaClient;
  tenantId: string;
  client: PortalClientRef;
  now?: Date;
}): Promise<PortalBookings> {
  const { db, tenantId, client } = input;
  const now = input.now ?? new Date();
  const base = await loadEvaluationBase(db, tenantId, client.id, now);
  const rows = await db.classBooking.findMany({
    where: { client_id: client.id, OR: [{ tenant_id: tenantId }, { tenant_id: null }] },
    select: {
      ...OWN_BOOKING_SELECT,
      scheduled_class: { select: PORTAL_SESSION_SELECT },
      attendance: { select: { attendance_status: true } },
    },
    orderBy: [{ scheduled_class: { class_date: "desc" } }, { scheduled_class: { start_time: "desc" } }],
    take: 200,
  });

  const result: PortalBookings = { today: base.today, upcoming: [], past: [], cancelled: [] };
  for (const row of rows) {
    const own: PortalOwnBooking = row;
    const evaluation = evaluatePortalSession({
      session: row.scheduled_class,
      client,
      policy: base.policy,
      now,
      memberships: candidatesFor(base, own),
      ownBooking: own,
      ownSlots: [],
    });
    const view: PortalBookingView = {
      ...toView(row.scheduled_class, own, evaluation, base.policy.timezone),
      bookingStatus: row.booking_status,
      attendance: row.attendance?.attendance_status ?? null,
    };
    if (row.booking_status === "cancelled") result.cancelled.push(view);
    else if (row.booking_status === "confirmed" && evaluation.state === "BOOKED") result.upcoming.push(view);
    else result.past.push(view);
  }
  result.upcoming.reverse();
  return result;
}

export interface PortalMembershipView {
  id: string;
  planName: string;
  planDescription: string | null;
  accessType: string;
  modality: GymClientModality;
  status: MembershipStatus;
  paymentStatus: PaymentStatus;
  startDate: string;
  endDate: string;
  finalAmount: string;
  /** null = sin límite por sesiones (NORMAL heredado o plan sin tope). */
  sessionsTotal: number | null;
  sessionsUsed: number;
  sessionsRemaining: number | null;
  trainerName: string | null;
  /** PERSONALIZED sin entrenador asignado: no puede reservar. */
  trainerMissing: boolean;
  /** La modalidad del snapshot no coincide con la del cliente (no autoriza reservas). */
  modalityMismatch: boolean;
}

export interface PortalMembershipSummary {
  today: string;
  clientModality: GymClientModality;
  /** Vigentes hoy (activas, pagadas, dentro de fechas), la que vence antes primero. */
  current: PortalMembershipView[];
  /** La relevante para la modalidad del cliente (o la primera vigente). */
  primary: PortalMembershipView | null;
  /** Activas que empiezan después de hoy (pueden cubrir sesiones futuras). */
  upcoming: PortalMembershipView[];
  history: PortalMembershipView[];
}

/**
 * Resumen de membresías del alumno. Saldo = snapshot sessions_total y
 * contador sessions_used del trigger (nunca recalculado aquí). "Hoy" es la
 * fecha local del gimnasio. La autoridad para una sesión concreta sigue
 * siendo selectMembership dentro de bookSession.
 */
export async function loadPortalMembershipSummary(input: {
  db: PrismaClient;
  tenantId: string;
  client: Pick<PortalClientRef, "id" | "modality">;
  now?: Date;
}): Promise<PortalMembershipSummary> {
  const { db, tenantId, client } = input;
  const now = input.now ?? new Date();
  const [policy, rows] = await Promise.all([
    loadGymBookingPolicy(db, tenantId),
    db.clientMembership.findMany({
      where: { client_id: client.id, OR: [{ tenant_id: tenantId }, { tenant_id: null }] },
      select: {
        id: true,
        status: true,
        payment_status: true,
        start_date: true,
        end_date: true,
        modality: true,
        sessions_total: true,
        sessions_used: true,
        final_amount: true,
        membership_plan: { select: { name: true, description: true, access_type: true } },
        assigned_trainer: { select: { first_name: true, last_name: true } },
      },
      orderBy: [{ start_date: "desc" }, { id: "asc" }],
    }),
  ]);
  const today = localDate(now, policy.timezone);

  const history: PortalMembershipView[] = rows.map((m) => ({
    id: m.id,
    planName: m.membership_plan.name,
    planDescription: m.membership_plan.description,
    accessType: m.membership_plan.access_type,
    modality: m.modality,
    status: m.status,
    paymentStatus: m.payment_status,
    startDate: dateOnly(m.start_date),
    endDate: dateOnly(m.end_date),
    finalAmount: Number(m.final_amount).toFixed(2),
    sessionsTotal: m.sessions_total,
    sessionsUsed: m.sessions_used,
    sessionsRemaining: m.sessions_total == null ? null : Math.max(m.sessions_total - m.sessions_used, 0),
    trainerName: m.assigned_trainer ? `${m.assigned_trainer.first_name} ${m.assigned_trainer.last_name}`.trim() : null,
    trainerMissing: m.modality === "PERSONALIZED" && !m.assigned_trainer,
    modalityMismatch: m.modality !== client.modality,
  }));
  const paid = (m: PortalMembershipView) => m.paymentStatus === "paid" || m.paymentStatus === "partial";
  const current = history
    .filter((m) => m.status === "active" && paid(m) && m.startDate <= today && m.endDate >= today)
    .sort((a, b) => a.endDate.localeCompare(b.endDate) || a.id.localeCompare(b.id));
  const upcoming = history
    .filter((m) => m.status === "active" && m.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
  const primary = current.find((m) => !m.modalityMismatch) ?? current[0] ?? null;

  return { today, clientModality: client.modality, current, primary, upcoming, history };
}
