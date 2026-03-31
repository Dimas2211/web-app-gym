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
