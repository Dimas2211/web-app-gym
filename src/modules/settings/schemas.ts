import { z } from "zod";
import { isValidIanaTimeZone } from "@/modules/classes/booking/booking-policy";

export const gymSchema = z.object({
  name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "Máximo 100 caracteres"),
  slug: z
    .string()
    .min(2, "El slug debe tener al menos 2 caracteres")
    .max(100, "Máximo 100 caracteres")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Solo letras minúsculas, números y guiones (ej: mi-gimnasio)"
    ),
  address: z.string().max(255, "Máximo 255 caracteres").optional().or(z.literal("")),
  phone: z.string().max(30, "Máximo 30 caracteres").optional().or(z.literal("")),
  email: z.string().email("Correo electrónico inválido").optional().or(z.literal("")),
  website: z.string().max(255, "Máximo 255 caracteres").optional().or(z.literal("")),
});

export type GymFormData = z.infer<typeof gymSchema>;

export const sportSchema = z.object({
  name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "Máximo 100 caracteres"),
  description: z
    .string()
    .max(500, "Máximo 500 caracteres")
    .optional()
    .or(z.literal("")),
});

export const goalSchema = z.object({
  name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "Máximo 100 caracteres"),
  description: z
    .string()
    .max(500, "Máximo 500 caracteres")
    .optional()
    .or(z.literal("")),
});

export type SportFormData = z.infer<typeof sportSchema>;
export type GoalFormData = z.infer<typeof goalSchema>;

// ──────────────────────────────────────────────
// GymSettings — Configuración de códigos operativos
// ──────────────────────────────────────────────

export const gymSettingsSchema = z.object({
  staff_code_prefix: z
    .string()
    .min(1, "El prefijo debe tener al menos 1 carácter")
    .max(5, "Máximo 5 caracteres")
    .regex(/^[A-Z0-9]+$/, "Solo letras mayúsculas y números (ej: A, STAFF, S1)"),
  staff_code_digits: z.coerce
    .number()
    .int()
    .min(1, "Mínimo 1 dígito")
    .max(8, "Máximo 8 dígitos"),
  staff_code_start: z.coerce
    .number()
    .int()
    .min(1, "El número inicial debe ser mayor a 0"),
  client_code_prefix: z
    .string()
    .min(1, "El prefijo debe tener al menos 1 carácter")
    .max(5, "Máximo 5 caracteres")
    .regex(/^[A-Z0-9]+$/, "Solo letras mayúsculas y números (ej: C, CLI, C1)"),
  client_code_digits: z.coerce
    .number()
    .int()
    .min(1, "Mínimo 1 dígito")
    .max(8, "Máximo 8 dígitos"),
  client_code_start: z.coerce
    .number()
    .int()
    .min(1, "El número inicial debe ser mayor a 0"),
}).refine(
  (data) => data.staff_code_prefix !== data.client_code_prefix,
  {
    message: "El prefijo de personal y el de clientes deben ser distintos.",
    path: ["client_code_prefix"],
  }
);

export type GymSettingsFormData = z.infer<typeof gymSettingsSchema>;

// ──────────────────────────────────────────────
// GYM-BOOKINGS 3A — Política de reservas (columnas 2A de GymSettings)
// ──────────────────────────────────────────────
// Los DEFAULTS no se repiten aquí: viven en GYM_BOOKING_POLICY_DEFAULTS
// (= @default de la columna, verificado por test) y el formulario se
// precarga con resolveGymBookingPolicy(fila). Este schema solo fija rangos.
const intInRange = (min: number, max: number) =>
  z.coerce
    .number({ invalid_type_error: "Debe ser un número" })
    .int("Debe ser un número entero")
    .min(min, `Mínimo ${min}`)
    .max(max, `Máximo ${max}`);

export const GYM_BOOKING_POLICY_LIMITS = {
  personalized_default_capacity: { min: 1, max: 50 },
  booking_horizon_days: { min: 1, max: 365 },
  booking_min_lead_minutes: { min: 0, max: 10_080 },
  cancel_min_lead_minutes: { min: 0, max: 10_080 },
  attendance_edit_window_hours: { min: 0, max: 720 },
  series_generation_weeks: { min: 1, max: 26 },
} as const;

const L = GYM_BOOKING_POLICY_LIMITS;

export const gymBookingPolicySchema = z
  .object({
    timezone: z
      .string()
      .trim()
      .max(64)
      .nullable()
      .refine((v) => v === null || isValidIanaTimeZone(v), "Zona horaria IANA inválida (ej. America/El_Salvador)"),
    personalized_booking_enabled: z.boolean(),
    group_booking_enabled: z.boolean(),
    personalized_default_capacity: intInRange(L.personalized_default_capacity.min, L.personalized_default_capacity.max),
    booking_horizon_days: intInRange(L.booking_horizon_days.min, L.booking_horizon_days.max),
    booking_min_lead_minutes: intInRange(L.booking_min_lead_minutes.min, L.booking_min_lead_minutes.max),
    cancel_min_lead_minutes: intInRange(L.cancel_min_lead_minutes.min, L.cancel_min_lead_minutes.max),
    late_cancel_consumes_session: z.boolean(),
    apply_policy_to_open: z.boolean(),
    attendance_edit_window_hours: intInRange(L.attendance_edit_window_hours.min, L.attendance_edit_window_hours.max),
    series_generation_weeks: intInRange(L.series_generation_weeks.min, L.series_generation_weeks.max),
  })
  // R18 explícito en la configuración: habilitar PERSONALIZED/GROUP exige timezone.
  .refine((d) => !(d.personalized_booking_enabled || d.group_booking_enabled) || d.timezone !== null, {
    message: "Para habilitar reservas personalizadas o grupales configura la zona horaria del gimnasio.",
    path: ["timezone"],
  });

export type GymBookingPolicyFormData = z.infer<typeof gymBookingPolicySchema>;
