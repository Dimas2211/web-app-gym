import { z } from "zod";

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
