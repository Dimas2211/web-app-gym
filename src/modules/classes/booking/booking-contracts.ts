// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2A — contrato del futuro servicio único de reservas.
//
// SOLO tipos y constantes: la implementación llega en 2B. Staff, portal
// alumno y portal entrenador deberán pasar por esta interfaz; ninguna
// ruta nueva escribe class_bookings / class_attendance por fuera.
//
// Reglas de ejecución que toda implementación DEBE cumplir
// (detalle y justificación: docs/modules/gym-bookings-summary.md):
//
//  1. Una operación = una transacción de context.client (DB runtime
//     efectiva). Nunca el Prisma global.
//  2. tenant_id / location_id SIEMPRE desde OperationalContext; el cliente
//     del portal SIEMPRE desde sessionUser.id. Nunca desde el formulario.
//  3. Bloqueos `SELECT … FOR UPDATE` en GYM_BOOKING_LOCK_ORDER, cada tabla
//     ORDER BY id. Una operación puede saltarse tablas, nunca invertirlas.
//  4. Los contadores (booked_count, sessions_used) NO se escriben: los
//     mantiene el trigger. El servicio valida cupo/saldo bajo bloqueo y
//     el CHECK de BD es el respaldo final.
//  5. Idempotencia por COMANDO (booking-idempotency.ts): la orden se
//     identifica por idempotencyKey; la ejecución por GymBookingOperation.id;
//     cada efecto por reserva es un ClassBookingEvent con operation_id, en la
//     MISMA transacción. Reintento idéntico → replay del resultado guardado;
//     misma key con otro contenido → IDEMPOTENCY_KEY_REUSED.
//  6. Transacciones en READ COMMITTED (default de Prisma). Las guardas de
//     padre de la BD rechazan cambios estructurales bajo otro aislamiento
//     (ISOLATION_UNSUPPORTED). CONCURRENT_UPDATE_RETRY (40P01 / 40001) se
//     reintenta de forma acotada (GYM_BOOKING_MAX_CONCURRENCY_RETRIES).
// ─────────────────────────────────────────────────────────────────

import type {
  AttendanceStatus,
  BookingStatus,
  GymBookingCancellationType,
  GymBookingChannel,
  GymSessionConsumption,
} from "@prisma/client";

/**
 * Orden global único de bloqueos (corrección A). El primer elemento es el
 * advisory lock de transacción sobre (tenant, idempotencyKey). Resuelve la contradicción
 * del documento de Etapa 1 (texto cliente → membresía → sesión vs
 * pseudocódigo que bloqueaba la sesión antes de tocar la membresía):
 * las membresías candidatas se bloquean ANTES que la sesión.
 *
 * Los triggers de BD escriben client_memberships → scheduled_classes
 * después de la fila de class_bookings; dentro del servicio esas filas ya
 * están bloqueadas, así que el trigger no adquiere locks nuevos.
 *
 * Extensión H01 (sección 2.0 de la migración): los triggers de integridad
 * bloquean a cada padre que validan (FOR SHARE / FOR KEY SHARE) en este
 * mismo orden. Las tablas nuevas cuelgan de su padre: series y ausencias
 * tras trainers; actividades y filas hoja al final. Quien re-apunta un hijo
 * a otro padre (mover asistencia, cambiar entrenador de serie) bloquea antes
 * el padre destino.
 */
export const GYM_BOOKING_LOCK_ORDER = [
  "idempotency_advisory_lock",
  "trainers",
  "class_series",
  "trainer_time_off",
  "clients",
  "client_memberships",
  "scheduled_classes",
  "class_bookings",
  "class_attendance",
  "gym_activities",
  "scheduled_class_activities",
  "class_attendance_activities",
] as const;

/** Reintentos máximos ante CONCURRENT_UPDATE_RETRY (interbloqueo / serialización). */
export const GYM_BOOKING_MAX_CONCURRENCY_RETRIES = 3;

export type GymBookingLockTable = (typeof GYM_BOOKING_LOCK_ORDER)[number];

export type GymBookingErrorCode =
  // contexto / permisos
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CLIENT_INACTIVE"
  | "CROSS_LOCATION"
  // política / configuración
  | "MODALITY_DISABLED"
  | "TIMEZONE_NOT_CONFIGURED"
  | "SCHEDULE_INCOMPLETE"
  // elegibilidad
  | "NO_ELIGIBLE_MEMBERSHIP"
  | "MODALITY_MISMATCH"
  | "TRAINER_NOT_AUTHORIZED"
  | "MEMBERSHIP_EXHAUSTED"
  // sesión / ventana
  | "SESSION_NOT_BOOKABLE"
  | "SESSION_FULL"
  | "SESSION_STARTED"
  | "OUTSIDE_BOOKING_HORIZON"
  | "BELOW_MIN_LEAD"
  | "CLIENT_SCHEDULE_CONFLICT"
  | "CANCEL_WINDOW_CLOSED"
  // estado / concurrencia
  | "ALREADY_BOOKED"
  | "ALREADY_CANCELLED"
  | "NOT_CONFIRMED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "INVALID_IDEMPOTENCY_KEY"
  /** unique (tenant_id, idempotency_key) violado: releer la operación y aplicar replay/conflict. */
  | "IDEMPOTENCY_RACE_RETRY"
  | "SESSION_CHANGED_RETRY"
  | "LOCK_SET_CHANGED_RETRY"
  /** 40P01 (interbloqueo detectado) o 40001 (serialización): sin efectos, reintentar. */
  | "CONCURRENT_UPDATE_RETRY"
  /** Cambio estructural de un padre fuera de READ COMMITTED: no reintentar. */
  | "ISOLATION_UNSUPPORTED"
  | "TENANT_MISMATCH"
  /** Cambio de un padre (entrenador, serie, actividad…) que invalidaría hijos vigentes. */
  | "DEPENDENT_RECORDS_CONFLICT"
  | "COUNTER_READONLY"
  | "APPEND_ONLY";

export interface GymBookingActor {
  userId: string;
  /** Rol LIVE (context.effectiveUser.role), nunca el del JWT. */
  role: "super_admin" | "branch_admin" | "reception" | "trainer" | "client";
}

export interface GymBookingScope {
  tenantId: string;
  /** location efectiva del contexto (null solo para super_admin global). */
  locationId: string | null;
}

/**
 * Clave de la ORDEN, generada por el cliente una vez por intento lógico
 * (UUID v4) y reenviada sin cambios en cada reintento. 8–200 caracteres.
 */
export type IdempotencyKey = string;

export interface BookSessionCommand {
  scope: GymBookingScope;
  actor: GymBookingActor;
  channel: GymBookingChannel;
  sessionId: string;
  clientId: string;
  idempotencyKey: IdempotencyKey;
  now?: Date;
}

export interface CancelBookingCommand {
  scope: GymBookingScope;
  actor: GymBookingActor;
  channel: GymBookingChannel;
  bookingId: string;
  /** Obligatorio para STAFF (R29). */
  reason?: string;
  idempotencyKey: IdempotencyKey;
  now?: Date;
}

export interface CancelSessionCommand {
  scope: GymBookingScope;
  actor: GymBookingActor;
  sessionId: string;
  reason: string;
  idempotencyKey: IdempotencyKey;
  now?: Date;
}

export interface RecordAttendanceCommand {
  scope: GymBookingScope;
  actor: GymBookingActor;
  channel: GymBookingChannel;
  bookingId: string;
  status: Exclude<AttendanceStatus, "cancelled">;
  /** Nota operativa heredada (check-in). */
  notes?: string | null;
  /** Solo entrenador de la sesión, SA o BA (R36). Recepción no puede. */
  trainingNotes?: string | null;
  idempotencyKey: IdempotencyKey;
  now?: Date;
}

export interface BookingSnapshot {
  bookingId: string;
  sessionId: string;
  clientId: string;
  membershipId: string | null;
  status: BookingStatus;
  consumption: GymSessionConsumption;
  cancellationType: GymBookingCancellationType | null;
}

export type GymBookingResult<T> =
  | {
      ok: true;
      value: T;
      /** GymBookingOperation.id (identificador de la operación, no de la orden). */
      operationId: string;
      /** true si la orden ya estaba aplicada y se devolvió el resultado guardado. */
      replayed: boolean;
    }
  | { ok: false; code: GymBookingErrorCode; message?: string };

export interface GymBookingService {
  bookSession(cmd: BookSessionCommand): Promise<GymBookingResult<BookingSnapshot>>;
  cancelBooking(cmd: CancelBookingCommand): Promise<GymBookingResult<BookingSnapshot>>;
  cancelSession(cmd: CancelSessionCommand): Promise<GymBookingResult<{ released: BookingSnapshot[] }>>;
  recordAttendance(cmd: RecordAttendanceCommand): Promise<GymBookingResult<{ attendanceId: string }>>;
}
