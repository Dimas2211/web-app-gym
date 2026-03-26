import { z } from "zod";
import { UserRole } from "@prisma/client";

const baseUserSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  first_name: z
    .string()
    .min(2, "Mínimo 2 caracteres")
    .max(50, "Máximo 50 caracteres"),
  last_name: z
    .string()
    .min(2, "Mínimo 2 caracteres")
    .max(50, "Máximo 50 caracteres"),
  role: z.nativeEnum(UserRole, { errorMap: () => ({ message: "Rol inválido" }) }),
  branch_id: z.string().uuid("Sucursal inválida").nullable().optional(),
});

export const createUserSchema = baseUserSchema
  .extend({
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  })
  .superRefine((data, ctx) => {
    if (data.role !== "super_admin" && !data.branch_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La sucursal es requerida para este rol.",
        path: ["branch_id"],
      });
    }
  });

export const updateUserSchema = baseUserSchema
  .extend({
    // En edición la contraseña es opcional
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres")
      .optional()
      .or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.role !== "super_admin" && !data.branch_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La sucursal es requerida para este rol.",
        path: ["branch_id"],
      });
    }
  });

export type CreateUserFormData = z.infer<typeof createUserSchema>;
export type UpdateUserFormData = z.infer<typeof updateUserSchema>;
