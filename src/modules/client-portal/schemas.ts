import { z } from "zod";
import { isIsoCalendarDate } from "@/modules/weekly-plans/schemas";

export const bookClassSchema = z.object({
  class_id: z.string().uuid("ID de clase inválido"),
});

export const cancelBookingSchema = z.object({
  booking_id: z.string().uuid("ID de reserva inválido"),
});

export const planDayFeedbackSchema = z.object({
  plan_day_id: z.string().uuid("Día de plan inválido"),
  local_date: z.string().refine(isIsoCalendarDate, "Fecha inválida"),
  execution_status: z.enum(["completed", "skipped", "partial"], {
    required_error: "Estado requerido",
  }),
  client_feedback: z.string().max(1000, "Máximo 1000 caracteres").optional(),
});
