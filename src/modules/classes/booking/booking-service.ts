// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2B — GymBookingService: motor operativo unificado.
//
// Punto ÚNICO de escritura de class_bookings / class_attendance y de la
// cancelación de sesiones. Implementa booking-contracts.ts al pie de la
// letra (reglas 1–6 del encabezado del contrato):
//
//  - Una operación = UNA transacción interactiva READ COMMITTED sobre el
//    PrismaClient recibido (siempre context.client, nunca el global).
//  - Primer lock: advisory por (tenant, idempotencyKey); luego
//    GYM_BOOKING_LOCK_ORDER con `SELECT … FOR UPDATE … ORDER BY id`.
//    Cada operación toma un subconjunto en ese orden, nunca lo invierte:
//      bookSession    clients → client_memberships → scheduled_classes → class_bookings
//      cancelBooking  clients → client_memberships → scheduled_classes → class_bookings
//      cancelSession  clients → client_memberships → scheduled_classes → class_bookings
//      recordAttendance clients (KEY SHARE) →          scheduled_classes → class_bookings → class_attendance
//      updateTrainingNotes (GYM-4) igual que recordAttendance (solo training_notes)
//  - R29: cancelBooking / cancelSession no operan sobre sesiones completed
//    (SESSION_CLOSED), salvo la excepción OPEN heredada sin consumo.
//  - R32: asistencia del entrenador/recepción solo en ventana y sesión
//    abierta; después, solo SA/BA (administrative_correction en el evento).
//  - booked_count / sessions_used NO se escriben: los mueve el trigger
//    gym_class_bookings_counters; aquí solo se valida cupo/saldo bajo lock.
//  - Idempotencia por comando: REPLAY del `result` guardado o
//    IDEMPOTENCY_KEY_REUSED. La operación (append-only) se inserta ya con su
//    resultado, seguida de un ClassBookingEvent por reserva afectada.
//  - Rechazo de negocio = rollback completo, sin operación ni eventos.
//  - *_RETRY (interbloqueo, serialización, carrera de idempotencia, cambio
//    del conjunto bloqueado) → reintento completo acotado a
//    GYM_BOOKING_MAX_CONCURRENCY_RETRIES.
//
// Reglas funcionales y decisiones: docs/modules/gym-bookings-summary.md §11.
// ─────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import {
  Prisma,
  type ClassStatus,
  type GymBookingChannel,
  type GymBookingCommand,
  type GymBookingEventType,
  type GymClientModality,
  type GymSessionConsumption,
  type PrismaClient,
} from "@prisma/client";
import {
  GYM_BOOKING_MAX_CONCURRENCY_RETRIES,
  type BookSessionCommand,
  type BookingSnapshot,
  type CancelBookingCommand,
  type CancelSessionCommand,
  type GymBookingActor,
  type GymBookingErrorCode,
  type GymBookingResult,
  type GymBookingScope,
  type GymBookingService,
  type RecordAttendanceCommand,
  type UpdateTrainingNotesCommand,
} from "./booking-contracts";
import { mapGymBookingDbError } from "./booking-db-errors";
import {
  commandFingerprint,
  decideIdempotency,
  idempotencyLockText,
  isValidIdempotencyKey,
} from "./booking-idempotency";
import {
  GYM_BOOKING_POLICY_DEFAULTS,
  policyAppliesTo,
  resolveGymBookingPolicy,
  sessionKindReadiness,
  type GymBookingPolicy,
} from "./booking-policy";
import { checkBookingWindow, consumptionAfterCancel, consumptionOnBook, decideCancellation } from "./booking-rules";
import {
  checkAttendanceAccess,
  dateOnly,
  hhmmRangesOverlap,
  legacyOpenDateAllowed,
  localDate,
  normalizeReason,
  resolveSessionInstants,
  selectMembership,
  staffCancelReasonRequired,
  trainerOwnsSession,
  type MembershipCandidate,
} from "./booking-eligibility";

type Tx = Prisma.TransactionClient;

const RETRYABLE: ReadonlySet<GymBookingErrorCode> = new Set<GymBookingErrorCode>([
  "CONCURRENT_UPDATE_RETRY",
  "IDEMPOTENCY_RACE_RETRY",
  "SESSION_CHANGED_RETRY",
  "LOCK_SET_CHANGED_RETRY",
]);

const STAFF_ROLES: ReadonlySet<GymBookingActor["role"]> = new Set(["super_admin", "branch_admin", "reception"]);
const SESSION_ADMIN_ROLES: ReadonlySet<GymBookingActor["role"]> = new Set(["super_admin", "branch_admin"]);
/** R36: notas de entrenamiento — entrenador de la sesión, SA o BA. Recepción no. */
const TRAINING_NOTES_ROLES: ReadonlySet<GymBookingActor["role"]> = new Set(["super_admin", "branch_admin", "trainer"]);

/** Rechazo de negocio: aborta la transacción (rollback) y se devuelve como { ok: false }. */
export class GymBookingRejection extends Error {
  constructor(
    readonly code: GymBookingErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = "GymBookingRejection";
  }
}

function reject(code: GymBookingErrorCode, message?: string): never {
  throw new GymBookingRejection(code, message);
}

export interface GymBookingServiceOptions {
  /** Default GYM_BOOKING_MAX_CONCURRENCY_RETRIES (3) reintentos tras el primer intento. */
  maxRetries?: number;
  /** Tiempo máximo de la transacción interactiva (ms). */
  transactionTimeoutMs?: number;
  /** Espera máxima por una conexión del pool para abrir la transacción (ms). */
  maxWaitMs?: number;
  /** Observabilidad: se invoca antes de cada reintento con el código que lo causó. */
  onRetry?: (code: GymBookingErrorCode, attempt: number) => void;
}

// ── Lecturas tipadas ──────────────────────────────────────────────

const SESSION_SELECT = {
  id: true,
  tenant_id: true,
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
  trainer: { select: { user_id: true, status: true } },
} satisfies Prisma.ScheduledClassSelect;

type SessionRow = Prisma.ScheduledClassGetPayload<{ select: typeof SESSION_SELECT }>;

const BOOKING_SELECT = {
  id: true,
  tenant_id: true,
  scheduled_class_id: true,
  client_id: true,
  client_membership_id: true,
  booking_status: true,
  consumption: true,
  cancellation_type: true,
} satisfies Prisma.ClassBookingSelect;

type BookingRow = Prisma.ClassBookingGetPayload<{ select: typeof BOOKING_SELECT }>;

const MEMBERSHIP_SELECT = {
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

function snapshot(b: BookingRow): BookingSnapshot {
  return {
    bookingId: b.id,
    sessionId: b.scheduled_class_id,
    clientId: b.client_id,
    membershipId: b.client_membership_id,
    status: b.booking_status,
    consumption: b.consumption,
    cancellationType: b.cancellation_type,
  };
}

/** Campos estructurales de la sesión: si cambian entre la lectura previa y el lock → SESSION_CHANGED_RETRY. */
function sessionShape(s: SessionRow): string {
  return JSON.stringify([
    s.branch_id,
    s.trainer_id,
    s.session_kind,
    dateOnly(s.class_date),
    s.start_time,
    s.end_time,
    s.starts_at?.toISOString() ?? null,
    s.ends_at?.toISOString() ?? null,
  ]);
}

/**
 * Política del gimnasio del tenant. Sin fila gym_settings → defaults de
 * columna (resolveGymBookingPolicy). Exportada para las acciones que
 * necesitan decidir la ruta heredada OPEN (cancelación de sesión).
 */
export async function loadGymBookingPolicy(db: PrismaClient | Tx, tenantId: string): Promise<GymBookingPolicy> {
  const row = await db.gymSettings.findFirst({
    where: { gym: { tenant_id: tenantId } },
    select: {
      timezone: true,
      personalized_booking_enabled: true,
      group_booking_enabled: true,
      personalized_default_capacity: true,
      booking_horizon_days: true,
      booking_min_lead_minutes: true,
      cancel_min_lead_minutes: true,
      late_cancel_consumes_session: true,
      apply_policy_to_open: true,
      attendance_edit_window_hours: true,
      series_generation_weeks: true,
    } satisfies Record<keyof typeof GYM_BOOKING_POLICY_DEFAULTS, true>,
  });
  return resolveGymBookingPolicy(row);
}

// ── Locks (GYM_BOOKING_LOCK_ORDER) ────────────────────────────────

async function lockIdempotency(tx: Tx, tenantId: string, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyLockText(tenantId, key)}, 0))`;
}

async function lockClients(tx: Tx, ids: string[], tenantId: string | null): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = tenantId
    ? await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "clients" WHERE "id" = ANY(${ids}) AND "tenant_id" = ${tenantId} ORDER BY "id" FOR UPDATE`
    : await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "clients" WHERE "id" = ANY(${ids}) ORDER BY "id" FOR UPDATE`;
  return new Set(rows.map((r) => r.id));
}

async function lockMembershipsById(tx: Tx, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "client_memberships" WHERE "id" = ANY(${ids}) ORDER BY "id" FOR UPDATE`;
  return new Set(rows.map((r) => r.id));
}

async function lockSession(tx: Tx, sessionId: string, tenantId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "scheduled_classes" WHERE "id" = ${sessionId} AND "tenant_id" = ${tenantId} FOR UPDATE`;
  return rows.length === 1;
}

async function lockBookingBySessionClient(
  tx: Tx,
  sessionId: string,
  clientId: string
): Promise<{ id: string; client_membership_id: string | null } | null> {
  const rows = await tx.$queryRaw<{ id: string; client_membership_id: string | null }[]>`
    SELECT "id", "client_membership_id" FROM "class_bookings"
     WHERE "scheduled_class_id" = ${sessionId} AND "client_id" = ${clientId} FOR UPDATE`;
  return rows[0] ?? null;
}

async function lockBookingById(tx: Tx, bookingId: string, tenantId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "class_bookings" WHERE "id" = ${bookingId} AND "tenant_id" = ${tenantId} FOR UPDATE`;
  return rows.length === 1;
}

// ── Autorización ──────────────────────────────────────────────────

function isGlobal(actor: GymBookingActor) {
  return actor.role === "super_admin";
}

/** Staff con alcance de sede: la sesión debe ser de su location (canManageClass). */
function assertStaffSessionScope(scope: GymBookingScope, actor: GymBookingActor, session: SessionRow) {
  if (isGlobal(actor)) return;
  if (!scope.locationId) reject("FORBIDDEN", "El usuario no tiene sede asignada.");
  if (session.branch_id !== scope.locationId) reject("FORBIDDEN");
}

function assertChannelActor(channel: GymBookingChannel, actor: GymBookingActor) {
  if (channel === "STAFF" && STAFF_ROLES.has(actor.role)) return;
  if (channel === "PORTAL" && actor.role === "client") return;
  reject("FORBIDDEN");
}

// ── Servicio ──────────────────────────────────────────────────────

interface EventDraft {
  bookingId: string;
  sessionId: string;
  clientId: string;
  membershipId: string | null;
  eventType: GymBookingEventType;
  fromStatus: BookingRow["booking_status"] | null;
  toStatus: BookingRow["booking_status"] | null;
  consumptionBefore: GymSessionConsumption | null;
  consumptionAfter: GymSessionConsumption | null;
  cancellationType: BookingRow["cancellation_type"];
  reason: string | null;
  metadata?: Prisma.InputJsonValue;
}

interface Effects<T> {
  value: T;
  targetId: string;
  events: EventDraft[];
}

interface OperationSpec<T> {
  command: GymBookingCommand;
  scope: GymBookingScope;
  actor: GymBookingActor;
  channel: GymBookingChannel | null;
  idempotencyKey: unknown;
  payload: object;
  body: (tx: Tx, now: Date) => Promise<Effects<T>>;
  now?: Date;
}

export function createGymBookingService(db: PrismaClient, options: GymBookingServiceOptions = {}): GymBookingService {
  const maxRetries = options.maxRetries ?? GYM_BOOKING_MAX_CONCURRENCY_RETRIES;
  const txOptions = {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    timeout: options.transactionTimeoutMs ?? 20_000,
    maxWait: options.maxWaitMs ?? 15_000,
  };

  async function execute<T>(spec: OperationSpec<T>): Promise<GymBookingResult<T>> {
    if (!isValidIdempotencyKey(spec.idempotencyKey)) return { ok: false, code: "INVALID_IDEMPOTENCY_KEY" };
    const key = spec.idempotencyKey;
    const tenantId = spec.scope.tenantId;
    const fingerprint = commandFingerprint(spec.command, spec.payload);

    let lastCode: GymBookingErrorCode = "CONCURRENT_UPDATE_RETRY";
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await db.$transaction(async (tx) => {
          await lockIdempotency(tx, tenantId, key);
          const existing = await tx.gymBookingOperation.findUnique({
            where: { tenant_id_idempotency_key: { tenant_id: tenantId, idempotency_key: key } },
            select: { id: true, command: true, request_fingerprint: true, result: true },
          });
          const decision = decideIdempotency(existing, spec.command, fingerprint);
          if (decision.kind === "REPLAY") {
            return { ok: true as const, value: decision.result as T, operationId: decision.operationId, replayed: true };
          }
          if (decision.kind === "CONFLICT") reject(decision.code);

          const now = spec.now ?? new Date();
          const effects = await spec.body(tx, now);
          const operation = await tx.gymBookingOperation.create({
            data: {
              tenant_id: tenantId,
              location_id: spec.scope.locationId,
              command: spec.command,
              idempotency_key: key,
              request_fingerprint: fingerprint,
              target_id: effects.targetId,
              actor_user_id: spec.actor.userId,
              channel: spec.channel,
              result: effects.value as unknown as Prisma.InputJsonValue,
            },
            select: { id: true },
          });
          if (effects.events.length > 0) {
            await tx.classBookingEvent.createMany({
              data: effects.events.map((e) => ({
                tenant_id: tenantId,
                operation_id: operation.id,
                booking_id: e.bookingId,
                scheduled_class_id: e.sessionId,
                client_id: e.clientId,
                client_membership_id: e.membershipId,
                event_type: e.eventType,
                from_status: e.fromStatus,
                to_status: e.toStatus,
                consumption_before: e.consumptionBefore,
                consumption_after: e.consumptionAfter,
                cancellation_type: e.cancellationType,
                channel: spec.channel,
                actor_user_id: spec.actor.userId,
                reason: e.reason,
                metadata: e.metadata,
                occurred_at: now,
              })),
            });
          }
          return { ok: true as const, value: effects.value, operationId: operation.id, replayed: false };
        }, txOptions);
      } catch (err) {
        const code = err instanceof GymBookingRejection ? err.code : mapServiceError(err);
        if (!code) throw err;
        if (RETRYABLE.has(code)) {
          lastCode = code;
          if (attempt < maxRetries) options.onRetry?.(code, attempt + 1);
          continue;
        }
        return { ok: false, code, message: err instanceof GymBookingRejection ? err.message : undefined };
      }
    }
    return { ok: false, code: lastCode };
  }

  // ── bookSession ─────────────────────────────────────────────────
  async function bookSession(cmd: BookSessionCommand): Promise<GymBookingResult<BookingSnapshot>> {
    return execute({
      command: "BOOK_SESSION",
      scope: cmd.scope,
      actor: cmd.actor,
      channel: cmd.channel,
      idempotencyKey: cmd.idempotencyKey,
      payload: cmd,
      now: cmd.now,
      body: async (tx, now) => {
        const { tenantId, locationId } = cmd.scope;
        assertChannelActor(cmd.channel, cmd.actor);
        if (!isGlobal(cmd.actor) && cmd.channel === "STAFF" && !locationId) reject("FORBIDDEN");

        // 1) Lectura SIN lock de la sesión (tipo, fecha, entrenador).
        const before = await tx.scheduledClass.findFirst({
          where: { id: cmd.sessionId, tenant_id: tenantId },
          select: SESSION_SELECT,
        });
        if (!before) reject("NOT_FOUND", "Clase no encontrada.");

        // 2) clients FOR UPDATE (serializa toda operación del alumno).
        const lockedClients = await lockClients(tx, [cmd.clientId], tenantId);
        if (!lockedClients.has(cmd.clientId)) reject("NOT_FOUND", "Cliente no encontrado.");
        const client = await tx.client.findUniqueOrThrow({
          where: { id: cmd.clientId },
          select: { id: true, branch_id: true, user_id: true, status: true, modality: true },
        });
        if (cmd.channel === "PORTAL" && client.user_id !== cmd.actor.userId) reject("NOT_FOUND", "Cliente no encontrado.");
        if (client.status !== "active") reject("CLIENT_INACTIVE");

        // 3) client_memberships FOR UPDATE ORDER BY id: activas del alumno en
        //    el tenant + la de una reserva previa (reactivación).
        const prior = await tx.classBooking.findUnique({
          where: { scheduled_class_id_client_id: { scheduled_class_id: cmd.sessionId, client_id: cmd.clientId } },
          select: { client_membership_id: true },
        });
        const priorMembershipId = prior?.client_membership_id ?? null;
        const membershipRows = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "client_memberships"
           WHERE "client_id" = ${cmd.clientId} AND "tenant_id" = ${tenantId}
             AND ("status" = 'active' OR "id" = ${priorMembershipId})
           ORDER BY "id" FOR UPDATE`;
        const lockedMemberships = new Set(membershipRows.map((r) => r.id));

        // 4) scheduled_classes FOR UPDATE + revalidación estructural.
        if (!(await lockSession(tx, cmd.sessionId, tenantId))) reject("SESSION_CHANGED_RETRY");
        const session = await tx.scheduledClass.findUniqueOrThrow({ where: { id: cmd.sessionId }, select: SESSION_SELECT });
        if (sessionShape(session) !== sessionShape(before)) reject("SESSION_CHANGED_RETRY");

        // 5) class_bookings FOR UPDATE (reserva previa, si existe).
        const lockedBooking = await lockBookingBySessionClient(tx, cmd.sessionId, cmd.clientId);
        if (lockedBooking?.client_membership_id && !lockedMemberships.has(lockedBooking.client_membership_id)) {
          reject("LOCK_SET_CHANGED_RETRY");
        }
        const existing = lockedBooking
          ? await tx.classBooking.findUniqueOrThrow({ where: { id: lockedBooking.id }, select: BOOKING_SELECT })
          : null;
        if (existing?.booking_status === "confirmed") reject("ALREADY_BOOKED");

        // ── Alcance y sede (v1 sin reservas entre sedes) ──
        if (cmd.channel === "STAFF") {
          assertStaffSessionScope(cmd.scope, cmd.actor, session);
          if (!isGlobal(cmd.actor) && client.branch_id !== locationId) reject("CROSS_LOCATION", "El cliente no pertenece a tu sucursal.");
        }
        if (session.branch_id !== client.branch_id) reject("CROSS_LOCATION");

        // ── Política / sesión / ventana ──
        const policy = await loadGymBookingPolicy(tx, tenantId);
        const kind = session.session_kind;
        const readiness = sessionKindReadiness(policy, kind);
        if (!readiness.ok) reject(readiness.code);
        const applies = policyAppliesTo(policy, kind);
        const today = localDate(now, policy.timezone);
        const sessionDate = dateOnly(session.class_date);
        assertSessionBookable(session.status, cmd.channel, applies);
        if (applies) {
          const { startsAt } = resolveSessionInstants(session, policy.timezone);
          const window = checkBookingWindow({
            kind,
            policy,
            now,
            startsAt,
            actor: cmd.channel === "PORTAL" ? "CLIENT" : "STAFF",
          });
          if (!window.ok) reject(window.code);
        } else if (!legacyOpenDateAllowed(cmd.channel === "PORTAL" ? "PORTAL" : "STAFF", sessionDate, today)) {
          reject("SESSION_STARTED", "No puedes reservar una clase pasada.");
        }

        // ── Membresía, saldo y consumo ──
        const plan = consumptionOnBook(kind, existing?.consumption ?? null);
        const candidates: MembershipCandidate[] =
          lockedMemberships.size === 0
            ? []
            : await tx.clientMembership.findMany({
                where: { id: { in: [...lockedMemberships] } },
                select: MEMBERSHIP_SELECT,
                orderBy: { id: "asc" },
              });
        const selection = selectMembership(
          candidates,
          {
            clientModality: client.modality as GymClientModality,
            sessionKind: kind,
            sessionTrainerId: session.trainer_id,
            sessionDate,
            today,
            legacyDates: applies ? null : cmd.channel === "PORTAL" ? "PORTAL" : "STAFF",
          },
          {
            consumesNewSession: plan.consumesNewSession,
            requiredMembershipId:
              existing?.consumption === "CONSUMED" && kind !== "OPEN" ? existing.client_membership_id : null,
          }
        );
        if (!selection.ok) reject(selection.code);
        // OPEN no consume ni liga membresía (forma heredada); la que autoriza queda en el evento.
        const membershipId = kind === "OPEN" ? null : selection.membership.id;

        // ── Solapamiento propio (bajo lock del cliente) ──
        if (applies) await assertNoClientOverlap(tx, tenantId, cmd.clientId, session);

        // ── Cupo (bajo lock de la sesión; el CHECK de BD es el respaldo) ──
        if (session.booked_count >= session.capacity) reject("SESSION_FULL");

        // ── Escritura (el trigger mueve booked_count / sessions_used) ──
        const common = {
          booking_status: "confirmed" as const,
          booked_at: now,
          consumption: plan.consumption,
          client_membership_id: membershipId,
          channel: cmd.channel,
          booked_by_user_id: cmd.actor.userId,
          cancelled_at: null,
          cancelled_by_user_id: null,
          cancellation_type: null,
          cancel_reason: null,
        };
        const after = existing
          ? await tx.classBooking.update({ where: { id: existing.id }, data: common, select: BOOKING_SELECT })
          : await tx.classBooking.create({
              data: { ...common, tenant_id: tenantId, scheduled_class_id: cmd.sessionId, client_id: cmd.clientId },
              select: BOOKING_SELECT,
            });

        return {
          value: snapshot(after),
          targetId: cmd.sessionId,
          events: [
            {
              bookingId: after.id,
              sessionId: after.scheduled_class_id,
              clientId: after.client_id,
              membershipId,
              eventType: existing ? "REACTIVATED" : "BOOKED",
              fromStatus: existing?.booking_status ?? null,
              toStatus: "confirmed",
              consumptionBefore: existing?.consumption ?? null,
              consumptionAfter: after.consumption,
              cancellationType: null,
              reason: null,
              metadata: { session_kind: kind, authorizing_membership_id: selection.membership.id },
            },
          ],
        };
      },
    });
  }

  // ── cancelBooking ───────────────────────────────────────────────
  async function cancelBooking(cmd: CancelBookingCommand): Promise<GymBookingResult<BookingSnapshot>> {
    return execute({
      command: "CANCEL_BOOKING",
      scope: cmd.scope,
      actor: cmd.actor,
      channel: cmd.channel,
      idempotencyKey: cmd.idempotencyKey,
      payload: cmd,
      now: cmd.now,
      body: async (tx, now) => {
        const { tenantId } = cmd.scope;
        assertChannelActor(cmd.channel, cmd.actor);

        const before = await tx.classBooking.findFirst({
          where: { id: cmd.bookingId, tenant_id: tenantId },
          select: BOOKING_SELECT,
        });
        if (!before) reject("NOT_FOUND", "Reserva no encontrada.");

        const lockedClients = await lockClients(tx, [before.client_id], tenantId);
        if (!lockedClients.has(before.client_id)) reject("NOT_FOUND", "Reserva no encontrada.");
        const client = await tx.client.findUniqueOrThrow({
          where: { id: before.client_id },
          select: { user_id: true },
        });
        if (cmd.channel === "PORTAL" && client.user_id !== cmd.actor.userId) reject("NOT_FOUND", "Reserva no encontrada.");

        const lockedMemberships = await lockMembershipsById(
          tx,
          before.client_membership_id ? [before.client_membership_id] : []
        );
        if (!(await lockSession(tx, before.scheduled_class_id, tenantId))) reject("SESSION_CHANGED_RETRY");
        if (!(await lockBookingById(tx, before.id, tenantId))) reject("SESSION_CHANGED_RETRY");
        const booking = await tx.classBooking.findUniqueOrThrow({ where: { id: before.id }, select: BOOKING_SELECT });
        if (booking.client_membership_id && !lockedMemberships.has(booking.client_membership_id)) {
          reject("LOCK_SET_CHANGED_RETRY");
        }
        const session = await tx.scheduledClass.findUniqueOrThrow({
          where: { id: booking.scheduled_class_id },
          select: SESSION_SELECT,
        });

        if (cmd.channel === "STAFF") assertStaffSessionScope(cmd.scope, cmd.actor, session);
        if (booking.booking_status === "cancelled") reject("ALREADY_CANCELLED");
        if (booking.booking_status !== "confirmed") reject("NOT_CONFIRMED");

        const policy = await loadGymBookingPolicy(tx, tenantId);
        const kind = session.session_kind;
        const applies = policyAppliesTo(policy, kind);
        const reason = normalizeReason(cmd.reason);

        // R29: se cancela "hasta que la sesión se cierre". Una sesión completed
        // no libera cupos ni consumos. Excepción heredada (corrección B): OPEN
        // sin política y sin consumo conserva la cancelación sin restricción.
        if (session.status === "completed" && (applies || booking.consumption !== "NOT_APPLICABLE")) {
          reject("SESSION_CLOSED");
        }

        if (cmd.channel === "PORTAL" && !applies) {
          const today = localDate(now, policy.timezone);
          if (!legacyOpenDateAllowed("PORTAL", dateOnly(session.class_date), today)) {
            reject("CANCEL_WINDOW_CLOSED", "No puedes cancelar una reserva de clase pasada.");
          }
        }
        if (cmd.channel === "STAFF" && !reason && staffCancelReasonRequired(kind, policy, booking.consumption)) {
          reject("REASON_REQUIRED");
        }

        const { startsAt } = resolveSessionInstants(session, policy.timezone);
        const decision = decideCancellation({
          kind,
          policy,
          now,
          startsAt,
          actor: cmd.channel === "PORTAL" ? "CLIENT" : "STAFF",
        });
        if (!decision.ok) reject(decision.code);

        const after = await tx.classBooking.update({
          where: { id: booking.id },
          data: {
            booking_status: "cancelled",
            consumption: consumptionAfterCancel(booking.consumption, decision.releasesSession),
            cancellation_type: decision.cancellationType,
            cancelled_at: now,
            cancelled_by_user_id: cmd.actor.userId,
            cancel_reason: reason,
          },
          select: BOOKING_SELECT,
        });

        return {
          value: snapshot(after),
          targetId: booking.id,
          events: [
            {
              bookingId: after.id,
              sessionId: after.scheduled_class_id,
              clientId: after.client_id,
              membershipId: after.client_membership_id,
              eventType: "CANCELLED",
              fromStatus: booking.booking_status,
              toStatus: "cancelled",
              consumptionBefore: booking.consumption,
              consumptionAfter: after.consumption,
              cancellationType: decision.cancellationType,
              reason,
            },
          ],
        };
      },
    });
  }

  // ── cancelSession ───────────────────────────────────────────────
  async function cancelSession(cmd: CancelSessionCommand): Promise<GymBookingResult<{ released: BookingSnapshot[] }>> {
    return execute({
      command: "CANCEL_SESSION",
      scope: cmd.scope,
      actor: cmd.actor,
      channel: "STAFF",
      idempotencyKey: cmd.idempotencyKey,
      payload: cmd,
      now: cmd.now,
      body: async (tx, now) => {
        const { tenantId } = cmd.scope;
        if (!SESSION_ADMIN_ROLES.has(cmd.actor.role)) reject("FORBIDDEN");
        const reason = normalizeReason(cmd.reason);
        if (!reason) reject("REASON_REQUIRED");

        const before = await tx.scheduledClass.findFirst({
          where: { id: cmd.sessionId, tenant_id: tenantId },
          select: SESSION_SELECT,
        });
        if (!before) reject("NOT_FOUND", "Clase no encontrada.");
        assertStaffSessionScope(cmd.scope, cmd.actor, before);
        if (before.status === "cancelled") reject("ALREADY_CANCELLED");
        // R29: una sesión cerrada no se cancela (no hay excepción heredada:
        // cancelSession es una operación nueva de 2B).
        if (before.status === "completed") reject("SESSION_CLOSED");

        // Lectura sin lock del conjunto a bloquear; se revalida bajo el lock de la sesión.
        const preview = await tx.classBooking.findMany({
          where: { scheduled_class_id: cmd.sessionId, booking_status: "confirmed" },
          select: { client_id: true, client_membership_id: true },
        });
        const clientIds = [...new Set(preview.map((b) => b.client_id))].sort();
        const membershipIds = [
          ...new Set(preview.map((b) => b.client_membership_id).filter((v): v is string => !!v)),
        ].sort();
        const lockedClients = await lockClients(tx, clientIds, null);
        const lockedMemberships = await lockMembershipsById(tx, membershipIds);
        if (!(await lockSession(tx, cmd.sessionId, tenantId))) reject("SESSION_CHANGED_RETRY");
        const session = await tx.scheduledClass.findUniqueOrThrow({ where: { id: cmd.sessionId }, select: SESSION_SELECT });
        assertStaffSessionScope(cmd.scope, cmd.actor, session);
        if (session.status === "cancelled") reject("ALREADY_CANCELLED");
        if (session.status === "completed") reject("SESSION_CLOSED");

        const lockedBookings = await tx.$queryRaw<{ id: string; client_id: string; client_membership_id: string | null }[]>`
          SELECT "id", "client_id", "client_membership_id" FROM "class_bookings"
           WHERE "scheduled_class_id" = ${cmd.sessionId} AND "booking_status" = 'confirmed'
           ORDER BY "id" FOR UPDATE`;
        for (const b of lockedBookings) {
          if (!lockedClients.has(b.client_id)) reject("LOCK_SET_CHANGED_RETRY");
          if (b.client_membership_id && !lockedMemberships.has(b.client_membership_id)) reject("LOCK_SET_CHANGED_RETRY");
        }

        await tx.scheduledClass.update({
          where: { id: session.id },
          data: {
            status: "cancelled",
            cancelled_at: now,
            cancelled_by_user_id: cmd.actor.userId,
            cancel_reason: reason,
          },
          select: { id: true },
        });

        const decision = decideCancellation({
          kind: session.session_kind,
          policy: await loadGymBookingPolicy(tx, tenantId),
          now,
          startsAt: null,
          actor: "SESSION_CANCELLED",
        });
        if (!decision.ok) reject(decision.code);

        const released: BookingSnapshot[] = [];
        const events: EventDraft[] = [];
        for (const { id } of lockedBookings) {
          const booking = await tx.classBooking.findUniqueOrThrow({ where: { id }, select: BOOKING_SELECT });
          const after = await tx.classBooking.update({
            where: { id },
            data: {
              booking_status: "cancelled",
              consumption: consumptionAfterCancel(booking.consumption, decision.releasesSession),
              cancellation_type: decision.cancellationType,
              cancelled_at: now,
              cancelled_by_user_id: cmd.actor.userId,
              cancel_reason: reason,
            },
            select: BOOKING_SELECT,
          });
          released.push(snapshot(after));
          events.push({
            bookingId: after.id,
            sessionId: after.scheduled_class_id,
            clientId: after.client_id,
            membershipId: after.client_membership_id,
            eventType: "SESSION_CANCELLED",
            fromStatus: booking.booking_status,
            toStatus: "cancelled",
            consumptionBefore: booking.consumption,
            consumptionAfter: after.consumption,
            cancellationType: decision.cancellationType,
            reason,
          });
        }
        return { value: { released }, targetId: session.id, events };
      },
    });
  }

  // ── recordAttendance ────────────────────────────────────────────
  async function recordAttendance(cmd: RecordAttendanceCommand): Promise<GymBookingResult<{ attendanceId: string }>> {
    return execute({
      command: "RECORD_ATTENDANCE",
      scope: cmd.scope,
      actor: cmd.actor,
      channel: cmd.channel,
      idempotencyKey: cmd.idempotencyKey,
      payload: cmd,
      now: cmd.now,
      body: async (tx, now) => {
        const { tenantId } = cmd.scope;
        if (!["attended", "absent", "late"].includes(cmd.status)) reject("INVALID_COMMAND");
        if (cmd.trainingNotes !== undefined && !TRAINING_NOTES_ROLES.has(cmd.actor.role)) reject("FORBIDDEN");
        const { session, booking, access, previous } = await lockAttendanceTarget(tx, cmd, now);

        const data = {
          attendance_status: cmd.status,
          // Heredado: checked_in_at solo para "attended".
          checked_in_at: cmd.status === "attended" ? now : null,
          booking_id: booking.id,
          recorded_by_user_id: cmd.actor.userId,
          recorded_at: now,
          ...(cmd.notes !== undefined ? { notes: cmd.notes } : {}),
          ...(cmd.trainingNotes !== undefined ? { training_notes: cmd.trainingNotes } : {}),
        };
        const attendance = previous
          ? await tx.classAttendance.update({ where: { id: previous.id }, data, select: { id: true } })
          : await tx.classAttendance.create({
              data: { ...data, tenant_id: tenantId, scheduled_class_id: session.id, client_id: booking.client_id },
              select: { id: true },
            });

        return {
          value: { attendanceId: attendance.id },
          targetId: booking.id,
          events: [
            {
              bookingId: booking.id,
              sessionId: booking.scheduled_class_id,
              clientId: booking.client_id,
              membershipId: booking.client_membership_id,
              eventType: previous ? "ATTENDANCE_UPDATED" : "ATTENDANCE_RECORDED",
              fromStatus: booking.booking_status,
              toStatus: booking.booking_status,
              consumptionBefore: booking.consumption,
              consumptionAfter: booking.consumption,
              cancellationType: null,
              reason: null,
              metadata: {
                attendance_id: attendance.id,
                attendance_from: previous?.attendance_status ?? null,
                attendance_to: cmd.status,
                administrative_correction: access.administrativeCorrection,
              },
            },
          ],
        };
      },
    });
  }

  // ── updateTrainingNotes (GYM-4) ─────────────────────────────────
  // Notas privadas sin fingir un check-in: exige la asistencia ya registrada
  // y solo escribe training_notes (estado, checked_in_at y recorded_* intactos).
  // Comando RECORD_ATTENDANCE (agregado de asistencia, sin migración); la
  // huella incluye `operation`, así que una key de asistencia no se reusa aquí.
  // El evento no lleva el texto de la nota (R36).
  async function updateTrainingNotes(cmd: UpdateTrainingNotesCommand): Promise<GymBookingResult<{ attendanceId: string }>> {
    return execute({
      command: "RECORD_ATTENDANCE",
      scope: cmd.scope,
      actor: cmd.actor,
      channel: cmd.channel,
      idempotencyKey: cmd.idempotencyKey,
      payload: { operation: "UPDATE_TRAINING_NOTES", ...cmd },
      now: cmd.now,
      body: async (tx, now) => {
        if (!TRAINING_NOTES_ROLES.has(cmd.actor.role)) reject("FORBIDDEN");
        const { booking, access, previous } = await lockAttendanceTarget(tx, cmd, now);
        if (!previous) reject("ATTENDANCE_REQUIRED");

        await tx.classAttendance.update({
          where: { id: previous.id },
          data: { training_notes: cmd.trainingNotes },
          select: { id: true },
        });
        return {
          value: { attendanceId: previous.id },
          targetId: booking.id,
          events: [
            {
              bookingId: booking.id,
              sessionId: booking.scheduled_class_id,
              clientId: booking.client_id,
              membershipId: booking.client_membership_id,
              eventType: "ATTENDANCE_UPDATED",
              fromStatus: booking.booking_status,
              toStatus: booking.booking_status,
              consumptionBefore: booking.consumption,
              consumptionAfter: booking.consumption,
              cancellationType: null,
              reason: null,
              metadata: {
                attendance_id: previous.id,
                change: "training_notes",
                attendance_from: previous.attendance_status,
                attendance_to: previous.attendance_status,
                administrative_correction: access.administrativeCorrection,
              },
            },
          ],
        };
      },
    });
  }

  return { bookSession, cancelBooking, cancelSession, recordAttendance, updateTrainingNotes };
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Protocolo común de asistencia (recordAttendance / updateTrainingNotes):
 * canal/rol → clients (KEY SHARE) → scheduled_classes → class_bookings →
 * class_attendance (FOR UPDATE), con alcance, reserva confirmada, sesión no
 * cancelada y ventana R32 (checkAttendanceAccess) validados bajo lock.
 */
async function lockAttendanceTarget(
  tx: Tx,
  cmd: { scope: GymBookingScope; actor: GymBookingActor; channel: GymBookingChannel; bookingId: string },
  now: Date
) {
  const { tenantId } = cmd.scope;
  const staff = cmd.channel === "STAFF" && STAFF_ROLES.has(cmd.actor.role);
  const trainer = cmd.channel === "TRAINER" && cmd.actor.role === "trainer";
  if (!staff && !trainer) reject("FORBIDDEN");

  const before = await tx.classBooking.findFirst({
    where: { id: cmd.bookingId, tenant_id: tenantId },
    select: BOOKING_SELECT,
  });
  if (!before) reject("NOT_FOUND", "Reserva no encontrada.");

  // Orden: clients (KEY SHARE) → scheduled_classes → class_bookings → class_attendance.
  // El trigger gym_class_attendance_integrity lee clients FOR KEY SHARE al
  // escribir la asistencia; tomarlo aquí, ANTES de la sesión, evita invertir
  // el orden global frente a cancelBooking/bookSession (clients FOR UPDATE →
  // sesión), que si no se interbloquea (40P01) con una asistencia concurrente.
  await tx.$queryRaw`SELECT "id" FROM "clients" WHERE "id" = ${before.client_id} FOR KEY SHARE`;
  if (!(await lockSession(tx, before.scheduled_class_id, tenantId))) reject("SESSION_CHANGED_RETRY");
  const session = await tx.scheduledClass.findUniqueOrThrow({
    where: { id: before.scheduled_class_id },
    select: SESSION_SELECT,
  });
  if (staff) assertStaffSessionScope(cmd.scope, cmd.actor, session);
  // GYM-4: el Trainer asignado debe seguir activo y vinculado al usuario (bajo el lock de la sesión).
  if (trainer && !trainerOwnsSession(cmd.actor, session.trainer)) reject("FORBIDDEN");

  if (!(await lockBookingById(tx, before.id, tenantId))) reject("SESSION_CHANGED_RETRY");
  const booking = await tx.classBooking.findUniqueOrThrow({ where: { id: before.id }, select: BOOKING_SELECT });
  if (booking.scheduled_class_id !== session.id || booking.client_id !== before.client_id) {
    reject("SESSION_CHANGED_RETRY");
  }
  if (booking.booking_status !== "confirmed") reject("NOT_CONFIRMED");
  if (session.status === "cancelled") reject("SESSION_NOT_BOOKABLE");

  const policy = await loadGymBookingPolicy(tx, tenantId);
  const { startsAt, endsAt } = resolveSessionInstants(session, policy.timezone);
  // R32: ventana del entrenador/recepción hasta fin + 48 h o cierre; luego solo SA/BA.
  const access = checkAttendanceAccess({
    kind: session.session_kind,
    policy,
    now,
    startsAt,
    endsAt,
    sessionStatus: session.status,
    channel: cmd.channel,
    role: cmd.actor.role,
  });
  if (!access.ok) reject(access.code);

  const lockedAttendance = await tx.$queryRaw<{ id: string; attendance_status: string }[]>`
    SELECT "id", "attendance_status"::text AS "attendance_status" FROM "class_attendance"
     WHERE "scheduled_class_id" = ${session.id} AND "client_id" = ${booking.client_id} FOR UPDATE`;
  const previous = lockedAttendance[0] ?? null;
  return { session, booking, access, previous };
}

/** Estados reservables: portal y política → solo 'scheduled'; staff OPEN heredado → todo salvo 'cancelled'. */
function assertSessionBookable(status: ClassStatus, channel: GymBookingChannel, applies: boolean) {
  if (status === "cancelled") reject("SESSION_NOT_BOOKABLE", "No se pueden registrar reservas en una clase cancelada.");
  if ((channel === "PORTAL" || applies) && status !== "scheduled") reject("SESSION_NOT_BOOKABLE");
}

async function assertNoClientOverlap(tx: Tx, tenantId: string, clientId: string, session: SessionRow) {
  const others = await tx.classBooking.findMany({
    where: {
      tenant_id: tenantId,
      client_id: clientId,
      booking_status: "confirmed",
      scheduled_class_id: { not: session.id },
      scheduled_class: { class_date: session.class_date, status: { not: "cancelled" } },
    },
    select: { scheduled_class: { select: { start_time: true, end_time: true } } },
  });
  for (const o of others) {
    if (hhmmRangesOverlap(session.start_time, session.end_time, o.scheduled_class.start_time, o.scheduled_class.end_time)) {
      reject("CLIENT_SCHEDULE_CONFLICT");
    }
  }
}

/**
 * Errores de BD → código de negocio. Prisma reporta las violaciones de
 * unicidad de consultas de modelo como P2002 con los campos (no con el
 * nombre del índice), así que se resuelven aquí antes del mapeo común.
 */
export function mapServiceError(err: unknown): GymBookingErrorCode | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = JSON.stringify(err.meta?.target ?? "");
      if (/idempotency_key/.test(target)) return "IDEMPOTENCY_RACE_RETRY";
      if (/scheduled_class_id/.test(target) && /client_id/.test(target)) return "ALREADY_BOOKED";
    }
    if (err.code === "P2034") return "CONCURRENT_UPDATE_RETRY";
  }
  return mapGymBookingDbError(err);
}

/** Clave de la orden recibida del formulario; si falta o es inválida, una nueva (sin protección de reintento). */
export function resolveIdempotencyKey(raw: unknown): string {
  return isValidIdempotencyKey(raw) ? raw : randomUUID();
}
