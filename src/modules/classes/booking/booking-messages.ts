// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2B — mensajes de usuario por GymBookingErrorCode.
//
// Las acciones (staff y portal) nunca muestran el código ni errores de BD:
// traducen con esta tabla. Donde existía un mensaje heredado equivalente se
// conserva el mismo texto.
// ─────────────────────────────────────────────────────────────────

import type { GymBookingErrorCode } from "./booking-contracts";

const MESSAGES: Record<GymBookingErrorCode, string> = {
  NOT_FOUND: "Registro no encontrado.",
  FORBIDDEN: "Sin permiso para gestionar esta clase.",
  CLIENT_INACTIVE: "El cliente está inactivo.",
  CROSS_LOCATION: "El cliente y la clase deben pertenecer a la misma sucursal.",
  MODALITY_DISABLED: "Las reservas de esta modalidad no están habilitadas en el gimnasio.",
  TIMEZONE_NOT_CONFIGURED: "El gimnasio no tiene zona horaria configurada para esta modalidad.",
  SCHEDULE_INCOMPLETE: "La clase no tiene horario completo.",
  NO_ELIGIBLE_MEMBERSHIP: "El cliente no tiene membresía activa válida para reservar.",
  MODALITY_MISMATCH: "La modalidad del cliente o de su membresía no corresponde a esta clase.",
  TRAINER_NOT_AUTHORIZED: "La membresía no autoriza sesiones con este entrenador.",
  MEMBERSHIP_EXHAUSTED: "La membresía no tiene sesiones disponibles.",
  SESSION_NOT_BOOKABLE: "Clase no disponible para reservas.",
  SESSION_FULL: "No hay cupo disponible en esta clase.",
  SESSION_STARTED: "La clase ya comenzó o ya pasó.",
  OUTSIDE_BOOKING_HORIZON: "La clase está fuera del periodo de reservas permitido.",
  BELOW_MIN_LEAD: "La reserva requiere más anticipación.",
  CLIENT_SCHEDULE_CONFLICT: "El cliente ya tiene otra reserva en ese horario.",
  CANCEL_WINDOW_CLOSED: "Ya no es posible cancelar esta reserva.",
  ATTENDANCE_NOT_STARTED: "La asistencia se registra a partir del inicio de la clase.",
  ATTENDANCE_WINDOW_CLOSED: "Cerró el plazo para registrar o editar la asistencia.",
  REASON_REQUIRED: "Indica el motivo de la cancelación.",
  INVALID_COMMAND: "Datos inválidos.",
  SESSION_CLOSED: "La clase ya fue cerrada; no se pueden cancelar reservas.",
  ALREADY_BOOKED: "El cliente ya tiene una reserva confirmada para esta clase.",
  ALREADY_CANCELLED: "Esta reserva ya está cancelada.",
  NOT_CONFIRMED: "La reserva no está confirmada.",
  IDEMPOTENCY_KEY_REUSED: "La solicitud no coincide con una operación anterior. Recarga la página e intenta de nuevo.",
  INVALID_IDEMPOTENCY_KEY: "Solicitud inválida. Recarga la página e intenta de nuevo.",
  IDEMPOTENCY_RACE_RETRY: "Operación concurrente. Intenta de nuevo.",
  SESSION_CHANGED_RETRY: "La clase cambió mientras se procesaba. Intenta de nuevo.",
  LOCK_SET_CHANGED_RETRY: "La clase cambió mientras se procesaba. Intenta de nuevo.",
  CONCURRENT_UPDATE_RETRY: "Operación concurrente. Intenta de nuevo.",
  ISOLATION_UNSUPPORTED: "No se pudo completar la operación.",
  TENANT_MISMATCH: "Registro no encontrado.",
  DEPENDENT_RECORDS_CONFLICT: "La operación entra en conflicto con registros vigentes.",
  COUNTER_READONLY: "No se pudo completar la operación.",
  APPEND_ONLY: "No se pudo completar la operación.",
};

/** Mensajes heredados del portal del alumno (segunda persona). */
const PORTAL_OVERRIDES: Partial<Record<GymBookingErrorCode, string>> = {
  NO_ELIGIBLE_MEMBERSHIP: "No tienes una membresía activa vigente para reservar clases.",
  CROSS_LOCATION: "Clase no disponible o no pertenece a tu sucursal.",
  NOT_FOUND: "Clase o reserva no encontrada.",
  SESSION_NOT_BOOKABLE: "Clase no disponible o no pertenece a tu sucursal.",
  SESSION_FULL: "Esta clase ya no tiene cupo disponible.",
  ALREADY_BOOKED: "Ya tienes una reserva confirmada para esta clase.",
  CLIENT_INACTIVE: "Tu perfil de cliente está inactivo.",
  MODALITY_MISMATCH: "Tu membresía no corresponde a esta clase.",
  TRAINER_NOT_AUTHORIZED: "Tu membresía no incluye sesiones con este entrenador.",
  MEMBERSHIP_EXHAUSTED: "Ya usaste todas las sesiones de tu membresía.",
  CLIENT_SCHEDULE_CONFLICT: "Ya tienes otra reserva en ese horario.",
};

export function gymBookingErrorMessage(
  code: GymBookingErrorCode,
  audience: "staff" | "portal" = "staff",
  detail?: string
): string {
  if (audience === "portal" && PORTAL_OVERRIDES[code]) return PORTAL_OVERRIDES[code];
  // Mensajes de negocio explícitos del servicio (ej. "No puedes reservar una clase pasada.").
  if (detail && detail !== code) return detail;
  return MESSAGES[code];
}
