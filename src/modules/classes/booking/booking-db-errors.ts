// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2A — traducción de rechazos de BD a GymBookingErrorCode.
//
// Los triggers y CHECKs de la migración 20261019000000 son la última
// línea de defensa. Cuando rechazan una escritura, Prisma lanza un error
// cuyo mensaje contiene el token GYM_* o el nombre del constraint; aquí
// se normaliza para que el servicio responda un código de negocio en vez
// de un 500.
// ─────────────────────────────────────────────────────────────────

import type { GymBookingErrorCode } from "./booking-contracts";

const MESSAGE_RULES: ReadonlyArray<[RegExp, GymBookingErrorCode]> = [
  [/GYM_TENANT_MISMATCH|GYM_MEMBERSHIP_CLIENT_MISMATCH|GYM_ATTENDANCE_BOOKING_MISMATCH|GYM_EVENT_BOOKING_MISMATCH/, "TENANT_MISMATCH"],
  // FKs compuestas por tenant (…_tenant_id_fkey, …_tenant_id_<cols>_fkey) y membresía↔cliente.
  [/_tenant_id(?:_\w+)?_fkey|client_membership_id_client_id_fkey/, "TENANT_MISMATCH"],
  [/GYM_LOCATION_MISMATCH|GYM_SERIES_KIND_MISMATCH/, "CROSS_LOCATION"],
  // Mutación de un padre con hijos vigentes (sección 2.8 de la migración).
  [/GYM_DEPENDENT_(LOCATION|SESSIONS|TENANT|ATTENDANCE)_CONFLICT/, "DEPENDENT_RECORDS_CONFLICT"],
  [/gym_booking_operations_tenant_id_idempotency_key_key/, "IDEMPOTENCY_RACE_RETRY"],
  // Concurrencia: SQLSTATE 40P01 (interbloqueo) / 40001 (serialización, incluido
  // GYM_CONCURRENT_PARENT_CHANGE) y P2034 de Prisma. La transacción ya se
  // abortó completa: no dejó efectos y se puede reintentar.
  [/GYM_CONCURRENT_PARENT_CHANGE|\b40P01\b|\b40001\b|deadlock detected|could not serialize access|\bP2034\b/, "CONCURRENT_UPDATE_RETRY"],
  [/GYM_ISOLATION_UNSUPPORTED/, "ISOLATION_UNSUPPORTED"],
  [/GYM_COUNTER_READONLY/, "COUNTER_READONLY"],
  [/GYM_APPEND_ONLY/, "APPEND_ONLY"],
  [/client_memberships_sessions_chk/, "MEMBERSHIP_EXHAUSTED"],
  [/class_bookings_scheduled_class_id_client_id_key|scheduled_class_id_client_id/, "ALREADY_BOOKED"],
];

function collectText(err: unknown): string {
  if (!err || typeof err !== "object") return String(err ?? "");
  const e = err as { message?: unknown; meta?: unknown; code?: unknown };
  // `code`: SQLSTATE del driver pg (p. ej. 40P01) o código Prisma (P2034).
  const parts = [typeof e.message === "string" ? e.message : "", typeof e.code === "string" ? e.code : ""];
  if (e.meta) {
    try {
      parts.push(JSON.stringify(e.meta));
    } catch {
      /* meta no serializable */
    }
  }
  return parts.join(" ");
}

/** Devuelve el código de negocio o null si el error no es un rechazo conocido. */
export function mapGymBookingDbError(err: unknown): GymBookingErrorCode | null {
  const text = collectText(err);
  for (const [pattern, code] of MESSAGE_RULES) {
    if (pattern.test(text)) return code;
  }
  return null;
}

/** true si la transacción falló por concurrencia y puede reintentarse completa. */
export function isRetryableGymBookingDbError(err: unknown): boolean {
  return mapGymBookingDbError(err) === "CONCURRENT_UPDATE_RETRY";
}
