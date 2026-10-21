import { z } from "zod";
import { HHMM_REGEX, isIsoDate } from "@/modules/classes/scheduling/scheduling-rules";

// ──────────────────────────────────────────────
// Schema base del entrenador
// ──────────────────────────────────────────────
const baseTrainerSchema = z.object({
  first_name: z.string().min(1, "El nombre es requerido").max(100),
  last_name: z.string().min(1, "El apellido es requerido").max(100),
  email: z
    .string()
    .email("Correo inválido")
    .max(200)
    .optional()
    .nullable()
    .or(z.literal("")),
  phone: z.string().max(30).optional().nullable(),
  specialty: z.string().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  branch_id: z.string().uuid("Sucursal requerida"),
  user_id: z.string().uuid().optional().nullable(),
  // GYM-BOOKINGS 3A — cupo PERSONALIZED del entrenador; null = usar
  // GymSettings.personalized_default_capacity (R19).
  personalized_capacity: z.coerce
    .number({ invalid_type_error: "Debe ser un número" })
    .int()
    .min(1, "Mínimo 1")
    .max(50, "Máximo 50")
    .optional()
    .nullable(),
});

export const createTrainerSchema = baseTrainerSchema;
export const updateTrainerSchema = baseTrainerSchema;

export type CreateTrainerInput = z.infer<typeof createTrainerSchema>;
export type UpdateTrainerInput = z.infer<typeof updateTrainerSchema>;

// ──────────────────────────────────────────────
// Schema para bloque de disponibilidad
// ──────────────────────────────────────────────
export const availabilitySlotSchema = z
  .object({
    trainer_id: z.string().uuid("Entrenador requerido"),
    day_of_week: z.coerce
      .number()
      .int()
      .min(0, "Día inválido")
      .max(6, "Día inválido"),
    start_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Formato HH:mm requerido"),
    end_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Formato HH:mm requerido"),
  })
  .refine((data) => data.start_time < data.end_time, {
    message: "La hora de inicio debe ser menor a la hora de fin",
    path: ["end_time"],
  });

export type AvailabilitySlotInput = z.infer<typeof availabilitySlotSchema>;

// ──────────────────────────────────────────────
// GYM-BOOKINGS 3A — Ausencia del entrenador (TrainerTimeOff)
// ──────────────────────────────────────────────
// Fechas locales del gimnasio. Sin horas = día completo; con horas, el
// mismo intervalo aplica a cada día del rango.
export const trainerTimeOffSchema = z
  .object({
    trainer_id: z.string().uuid("Entrenador requerido"),
    starts_on: z.string().min(1, "Fecha de inicio requerida").refine(isIsoDate, "Fecha inválida"),
    ends_on: z.string().min(1, "Fecha de fin requerida").refine(isIsoDate, "Fecha inválida"),
    start_time: z.string().regex(HHMM_REGEX, "Formato HH:mm requerido").optional().nullable(),
    end_time: z.string().regex(HHMM_REGEX, "Formato HH:mm requerido").optional().nullable(),
    reason: z.string().max(500, "Máximo 500 caracteres").optional().nullable(),
  })
  .refine((d) => d.ends_on >= d.starts_on, {
    message: "La fecha de fin no puede ser anterior a la de inicio",
    path: ["ends_on"],
  })
  .refine((d) => !d.start_time === !d.end_time, {
    message: "Indica hora de inicio y de fin, o ninguna (día completo)",
    path: ["end_time"],
  })
  .refine((d) => !d.start_time || !d.end_time || d.start_time < d.end_time, {
    message: "La hora de inicio debe ser menor a la hora de fin",
    path: ["end_time"],
  });

export type TrainerTimeOffInput = z.infer<typeof trainerTimeOffSchema>;
