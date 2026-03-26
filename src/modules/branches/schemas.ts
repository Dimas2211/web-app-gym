import { z } from "zod";

export const branchSchema = z.object({
  name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "Máximo 100 caracteres"),
  address: z
    .string()
    .max(255, "Máximo 255 caracteres")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .max(30, "Máximo 30 caracteres")
    .optional()
    .or(z.literal("")),
});

export type BranchFormData = z.infer<typeof branchSchema>;
