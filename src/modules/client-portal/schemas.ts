import { z } from "zod";

export const bookClassSchema = z.object({
  class_id: z.string().uuid("ID de clase inválido"),
});

export const cancelBookingSchema = z.object({
  booking_id: z.string().uuid("ID de reserva inválido"),
});

export const planDayFeedbackSchema = z.object({
  plan_day_id: z.string().uuid("ID de día inválido"),
  execution_status: z.enum(["completed", "skipped", "partial"], {
    required_error: "Estado requerido",
  }),
  client_feedback: z.string().max(500, "Máximo 500 caracteres").optional(),
});
