import { z } from "zod";

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
    capacity: z.coerce.number().int().min(1, "Capacidad mínima: 1"),
    room_name: z.string().max(100).optional().nullable(),
    is_personalized: z.boolean().default(false),
    notes: z.string().max(1000).optional().nullable(),
  })
  .refine((d) => d.start_time < d.end_time, {
    message: "La hora de inicio debe ser menor a la hora de fin",
    path: ["end_time"],
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
