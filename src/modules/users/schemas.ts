import { z } from "zod";

/**
 * Roles de staff válidos en el CRUD de Usuarios.
 * El rol `client` queda excluido: se gestiona desde el módulo de Clientes.
 */
const STAFF_ROLES = ["super_admin", "branch_admin", "reception", "trainer"] as const;

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
  role: z.enum(STAFF_ROLES, { errorMap: () => ({ message: "Rol inválido" }) }),
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
