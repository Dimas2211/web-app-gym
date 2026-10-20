// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2A — política de reservas por gimnasio.
//
// Fuente: columnas nuevas de GymSettings. Si el gimnasio no tiene fila
// gym_settings, se aplican los MISMOS defaults que la columna en BD, así
// el comportamiento no depende de si la fila existe. Ningún valor de
// negocio se hardcodea fuera de GYM_BOOKING_POLICY_DEFAULTS.
//
// Reglas de fallo cerrado (R18): PERSONALIZED y GROUP exigen su flag
// activo y una zona horaria IANA válida. OPEN (NORMAL) nunca depende de
// esta política mientras apply_policy_to_open = false.
// ─────────────────────────────────────────────────────────────────

import type { GymSessionKind, GymSettings } from "@prisma/client";

// Deben coincidir con los @default de GymSettings en schema.prisma
// (verificado por booking-policy.test.ts contra el DMMF).
export const GYM_BOOKING_POLICY_DEFAULTS = {
  timezone: null,
  personalized_booking_enabled: false,
  group_booking_enabled: false,
  personalized_default_capacity: 1,
  booking_horizon_days: 14,
  booking_min_lead_minutes: 0,
  cancel_min_lead_minutes: 120,
  late_cancel_consumes_session: true,
  apply_policy_to_open: false,
  attendance_edit_window_hours: 48,
  series_generation_weeks: 4,
} as const;

export type GymBookingPolicyField = keyof typeof GYM_BOOKING_POLICY_DEFAULTS;

export type GymBookingSettingsRow = Pick<GymSettings, GymBookingPolicyField>;

export interface GymBookingPolicy {
  /** IANA válida o null (null ⇒ PERSONALIZED/GROUP fallan cerrados). */
  timezone: string | null;
  personalizedBookingEnabled: boolean;
  groupBookingEnabled: boolean;
  personalizedDefaultCapacity: number;
  bookingHorizonDays: number;
  bookingMinLeadMinutes: number;
  cancelMinLeadMinutes: number;
  lateCancelConsumesSession: boolean;
  applyPolicyToOpen: boolean;
  attendanceEditWindowHours: number;
  seriesGenerationWeeks: number;
  /** true si no existía fila gym_settings y se usaron defaults. */
  fromDefaults: boolean;
}

export function isValidIanaTimeZone(value: string | null | undefined): value is string {
  if (!value || typeof value !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function resolveGymBookingPolicy(row: GymBookingSettingsRow | null | undefined): GymBookingPolicy {
  const src = row ?? GYM_BOOKING_POLICY_DEFAULTS;
  return {
    timezone: isValidIanaTimeZone(src.timezone) ? src.timezone : null,
    personalizedBookingEnabled: src.personalized_booking_enabled,
    groupBookingEnabled: src.group_booking_enabled,
    personalizedDefaultCapacity: src.personalized_default_capacity,
    bookingHorizonDays: src.booking_horizon_days,
    bookingMinLeadMinutes: src.booking_min_lead_minutes,
    cancelMinLeadMinutes: src.cancel_min_lead_minutes,
    lateCancelConsumesSession: src.late_cancel_consumes_session,
    applyPolicyToOpen: src.apply_policy_to_open,
    attendanceEditWindowHours: src.attendance_edit_window_hours,
    seriesGenerationWeeks: src.series_generation_weeks,
    fromDefaults: !row,
  };
}

export type SessionKindReadiness =
  | { ok: true }
  | { ok: false; code: "MODALITY_DISABLED" | "TIMEZONE_NOT_CONFIGURED" };

/** ¿Puede operar este tipo de sesión con la política actual? (R18) */
export function sessionKindReadiness(policy: GymBookingPolicy, kind: GymSessionKind): SessionKindReadiness {
  if (kind === "OPEN") return { ok: true };
  const enabled = kind === "PERSONALIZED" ? policy.personalizedBookingEnabled : policy.groupBookingEnabled;
  if (!enabled) return { ok: false, code: "MODALITY_DISABLED" };
  if (!policy.timezone) return { ok: false, code: "TIMEZONE_NOT_CONFIGURED" };
  return { ok: true };
}

/**
 * ¿Se aplican horizonte, anticipación mínima y ventana de cancelación?
 * OPEN conserva las reglas heredadas salvo activación explícita (corrección B).
 */
export function policyAppliesTo(policy: GymBookingPolicy, kind: GymSessionKind): boolean {
  return kind !== "OPEN" || policy.applyPolicyToOpen;
}
