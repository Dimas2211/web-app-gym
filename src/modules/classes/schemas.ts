import { z } from "zod";
import { HHMM_REGEX, isIsoDate } from "./scheduling/scheduling-rules";

// GYM-BOOKINGS 3A — mismos valores que el enum GymSessionKind de Prisma.
export const GYM_SESSION_KINDS = ["OPEN", "PERSONALIZED", "GROUP"] as const;

// ──────────────────────────────────────────────
// Tipo de clase
// ──────────────────────────────────────────────
const baseClassTypeSchema = z.object({
  code: z.string().max(20).optional().nullable(),
  name: z.string().min(1, "El nombre es requerido").max(100),
  description: z.string().max(500).optional().nullable(),
  default_duration_minutes: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .nullable(),
  capacity_default: z.coerce.number().int().min(1).optional().nullable(),
});

export const createClassTypeSchema = baseClassTypeSchema;
export const updateClassTypeSchema = baseClassTypeSchema;

export type CreateClassTypeInput = z.infer<typeof createClassTypeSchema>;

// ──────────────────────────────────────────────
// Clase programada
// ──────────────────────────────────────────────
export const createScheduledClassSchema = z
  .object({
    branch_id: z.string().uuid("Sucursal requerida"),
    class_type_id: z.string().uuid("Tipo de clase requerido"),
    trainer_id: z.string().uuid("Entrenador requerido"),
    title: z.string().min(1, "El título es requerido").max(200),
    class_date: z.string().min(1, "La fecha es requerida"),
    start_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Formato HH:mm requerido"),
    end_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Formato HH:mm requerido"),
    // GYM-BOOKINGS 3A — opcional: sin valor se resuelve el cupo efectivo
    // (R19, resolveSessionSetup); OPEN sin tipo con cupo por defecto falla.
    capacity: z.coerce.number().int().min(1, "Capacidad mínima: 1").optional().nullable(),
    room_name: z.string().max(100).optional().nullable(),
    // Campo heredado (solo visual). Nunca define session_kind.
    is_personalized: z.boolean().default(false),
    session_kind: z.enum(GYM_SESSION_KINDS).default("OPEN"),
    notes: z.string().max(1000).optional().nullable(),
  })
  .refine((d) => d.start_time < d.end_time, {
    message: "La hora de inicio debe ser menor a la hora de fin",
    path: ["end_time"],
  })
  .refine((d) => isIsoDate(d.class_date), {
    message: "Fecha inválida",
    path: ["class_date"],
  });

export const updateScheduledClassSchema = createScheduledClassSchema;

export type CreateScheduledClassInput = z.infer<
  typeof createScheduledClassSchema
>;

// ──────────────────────────────────────────────
// Reserva
// ──────────────────────────────────────────────
export const createBookingSchema = z.object({
  scheduled_class_id: z.string().uuid("Clase requerida"),
  client_id: z.string().uuid("Cliente requerido"),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

// ──────────────────────────────────────────────
// Asistencia
// ──────────────────────────────────────────────
export const recordAttendanceSchema = z.object({
  scheduled_class_id: z.string().uuid(),
  client_id: z.string().uuid(),
  attendance_status: z.enum(["attended", "absent", "late", "cancelled"]),
  notes: z.string().max(500).optional().nullable(),
});

export type RecordAttendanceInput = z.infer<typeof recordAttendanceSchema>;

// ──────────────────────────────────────────────
// GYM-BOOKINGS 3A — Serie recurrente (ClassSeries)
// ──────────────────────────────────────────────
const hhmm = z.string().regex(HHMM_REGEX, "Formato HH:mm requerido");
const isoDate = (msg: string) => z.string().min(1, msg).refine(isIsoDate, "Fecha inválida");

export const createClassSeriesSchema = z
  .object({
    location_id: z.string().uuid("Sucursal requerida"),
    class_type_id: z.string().uuid("Tipo de clase requerido"),
    trainer_id: z.string().uuid("Entrenador requerido"),
    session_kind: z.enum(GYM_SESSION_KINDS, { required_error: "Tipo de sesión requerido" }),
    title: z.string().min(1, "El título es requerido").max(200),
    weekday: z.coerce.number().int().min(0, "Día inválido").max(6, "Día inválido"),
    start_time: hhmm,
    end_time: hhmm,
    capacity: z.coerce.number().int().min(1, "Capacidad mínima: 1").optional().nullable(),
    room_name: z.string().max(100).optional().nullable(),
    valid_from: isoDate("Fecha de inicio requerida"),
    valid_until: z.string().refine(isIsoDate, "Fecha inválida").optional().nullable(),
  })
  .refine((d) => d.start_time < d.end_time, {
    message: "La hora de inicio debe ser menor a la hora de fin",
    path: ["end_time"],
  })
  .refine((d) => !d.valid_until || d.valid_until >= d.valid_from, {
    message: "La vigencia final no puede ser anterior al inicio",
    path: ["valid_until"],
  });

// Edición: solo campos no estructurales. Cambiar entrenador, día, horario,
// sede o tipo de sesión exige una serie nueva (las sesiones ya generadas
// conservan sus valores; ver docs/modules/gym-bookings-stage3a.md).
export const updateClassSeriesSchema = z.object({
  title: z.string().min(1, "El título es requerido").max(200),
  capacity: z.coerce.number().int().min(1, "Capacidad mínima: 1").optional().nullable(),
  room_name: z.string().max(100).optional().nullable(),
  valid_until: z.string().refine(isIsoDate, "Fecha inválida").optional().nullable(),
});

// ──────────────────────────────────────────────
// GYM-BOOKINGS 3A — Catálogo de actividades (GymActivity)
// ──────────────────────────────────────────────
export const gymActivitySchema = z.object({
  code: z
    .string()
    .max(30, "Máximo 30 caracteres")
    .regex(/^[A-Za-z0-9_-]+$/, "Solo letras, números, guion y guion bajo")
    .optional()
    .nullable(),
  name: z.string().min(1, "El nombre es requerido").max(100),
  description: z.string().max(500).optional().nullable(),
  // null = todas las sedes del tenant.
  location_id: z.string().uuid("Sucursal inválida").optional().nullable(),
  sort_order: z.coerce.number().int().min(0, "Mínimo 0").max(9999, "Máximo 9999").default(0),
});
