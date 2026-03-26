import { z } from "zod";

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
