import { z } from "zod";

const VALID_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

// ── Plantillas ───────────────────────────────────────────────

export const createTemplateSchema = z.object({
  code: z.string().max(20).optional().nullable(),
  name: z.string().min(1, "El nombre es requerido").max(100),
  description: z.string().max(1000).optional().nullable(),
  branch_id: z.string().uuid().optional().nullable(),
  target_gender: z
    .enum(["male", "female", "other", "prefer_not_to_say"])
    .optional()
    .nullable(),
  target_sport_id: z.string().uuid().optional().nullable(),
  target_goal_id: z.string().uuid().optional().nullable(),
  target_level: z.enum(["beginner", "intermediate", "advanced"]).optional().nullable(),
});

export const updateTemplateSchema = createTemplateSchema;

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

// ── Días de plantilla ────────────────────────────────────────

export const upsertTemplateDaySchema = z.object({
  weekday: z.coerce
    .number({ invalid_type_error: "Día inválido" })
    .int()
    .refine((v) => VALID_WEEKDAYS.includes(v as (typeof VALID_WEEKDAYS)[number]), {
      message: "Día de la semana inválido (0–6)",
    }),
  session_name: z.string().max(100).optional().nullable(),
  focus_area: z.string().max(200).optional().nullable(),
  duration_minutes: z.coerce
    .number({ invalid_type_error: "La duración debe ser un número" })
    .int()
    .min(1, "La duración debe ser mayor a 0"),
  exercise_block: z.string().max(3000).optional().nullable(),
  trainer_notes: z.string().max(1000).optional().nullable(),
});

export type UpsertTemplateDayInput = z.infer<typeof upsertTemplateDaySchema>;

// ── Planes de cliente ────────────────────────────────────────

export const createClientPlanSchema = z
  .object({
    client_id: z.string().uuid("Cliente requerido"),
    branch_id: z.string().uuid("Sucursal requerida"),
    trainer_id: z.string().uuid().optional().nullable(),
    template_id: z.string().uuid().optional().nullable(),
    start_date: z.string().min(1, "Fecha de inicio requerida"),
    end_date: z.string().min(1, "Fecha de fin requerida"),
    notes: z.string().max(1000).optional().nullable(),
  })
  .refine((d) => new Date(d.end_date) > new Date(d.start_date), {
    message: "La fecha de fin debe ser posterior a la de inicio",
    path: ["end_date"],
  });

export const updateClientPlanSchema = z
  .object({
    trainer_id: z.string().uuid().optional().nullable(),
    start_date: z.string().min(1, "Fecha de inicio requerida"),
    end_date: z.string().min(1, "Fecha de fin requerida"),
    status: z.enum(["active", "inactive", "suspended", "deleted"]),
    notes: z.string().max(1000).optional().nullable(),
  })
  .refine((d) => new Date(d.end_date) > new Date(d.start_date), {
    message: "La fecha de fin debe ser posterior a la de inicio",
    path: ["end_date"],
  });

export type CreateClientPlanInput = z.infer<typeof createClientPlanSchema>;
export type UpdateClientPlanInput = z.infer<typeof updateClientPlanSchema>;

// ── Días del plan del cliente ────────────────────────────────

export const updateClientPlanDaySchema = z.object({
  session_name: z.string().max(100).optional().nullable(),
  focus_area: z.string().max(200).optional().nullable(),
  duration_minutes: z.coerce
    .number({ invalid_type_error: "La duración debe ser un número" })
    .int()
    .min(1, "La duración debe ser mayor a 0"),
  exercise_block: z.string().max(3000).optional().nullable(),
  trainer_feedback: z.string().max(1000).optional().nullable(),
  client_feedback: z.string().max(1000).optional().nullable(),
});

export const markDaySchema = z.object({
  execution_status: z.enum(["pending", "completed", "skipped", "partial"], {
    required_error: "Estado requerido",
  }),
  trainer_feedback: z.string().max(1000).optional().nullable(),
  client_feedback: z.string().max(1000).optional().nullable(),
});

export type UpdateClientPlanDayInput = z.infer<typeof updateClientPlanDaySchema>;
export type MarkDayInput = z.infer<typeof markDaySchema>;

// ── Asignación segmentada ─────────────────────────────────────

export const assignSegmentedSchema = z
  .object({
    template_id: z.string().uuid("Plantilla requerida"),
    branch_id: z.string().uuid().optional().nullable(),
    trainer_id: z.string().uuid().optional().nullable(),
    start_date: z.string().min(1, "Fecha de inicio requerida"),
    end_date: z.string().min(1, "Fecha de fin requerida"),
    target_gender: z
      .enum(["male", "female", "other", "prefer_not_to_say"])
      .optional()
      .nullable(),
    target_sport_id: z.string().uuid().optional().nullable(),
    target_goal_id: z.string().uuid().optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
  })
  .refine((d) => new Date(d.end_date) > new Date(d.start_date), {
    message: "La fecha de fin debe ser posterior a la de inicio",
    path: ["end_date"],
  });

export type AssignSegmentedInput = z.infer<typeof assignSegmentedSchema>;
