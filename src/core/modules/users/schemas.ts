/**
 * Validaciones Zod para el dominio User core.
 *
 * ESTADO: Contrato genérico. Sin conectar a actions ni UI todavía.
 * Cross-industry: sin enum UserRole de Prisma, sin campos GYM.
 *
 * Consistente con los tipos en ./types.ts.
 */

import { z } from "zod";

// ─── Schema de contraseña (reutilizable) ───────────────────────────────────────

/**
 * Schema de contraseña separado del schema de usuario.
 * Se mantiene independiente porque:
 * - En creación es obligatorio.
 * - En actualización es opcional.
 * - En consultas no existe.
 * Separarlo evita repetir la regla y permite componerlo según el contexto.
 */
export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(72, "Máximo 72 caracteres"); // límite práctico de bcrypt

// ─── Schema base ───────────────────────────────────────────────────────────────

const baseCoreUserSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  first_name: z
    .string()
    .min(2, "Mínimo 2 caracteres")
    .max(50, "Máximo 50 caracteres"),
  last_name: z
    .string()
    .min(2, "Mínimo 2 caracteres")
    .max(50, "Máximo 50 caracteres"),
  /**
   * role como string genérico — no acoplado a UserRole de Prisma.
   * La validación de valores permitidos ocurre en la action de cada industria,
   * donde se conoce el conjunto de roles válidos para ese contexto.
   */
  role: z.string().min(1, "El rol es requerido"),
  location_id: z.string().uuid("location_id inválido").nullable().optional(),
});

// ─── Creación ──────────────────────────────────────────────────────────────────

/**
 * Schema para crear un usuario core.
 * tenant_id y password son obligatorios solo en creación.
 */
export const createCoreUserSchema = baseCoreUserSchema.extend({
  tenant_id: z.string().uuid("tenant_id inválido"),
  password: passwordSchema,
});

// ─── Actualización ─────────────────────────────────────────────────────────────

/**
 * Schema para actualizar un usuario core.
 * - tenant_id excluido: un usuario no puede cambiar de tenant.
 * - password opcional: solo se actualiza si se provee explícitamente.
 * - Todos los campos base son opcionales para soportar actualizaciones parciales.
 */
export const updateCoreUserSchema = baseCoreUserSchema.partial().extend({
  password: passwordSchema.optional().or(z.literal("")),
});

// ─── Tipos inferidos ───────────────────────────────────────────────────────────

export type CreateCoreUserSchema = z.infer<typeof createCoreUserSchema>;
export type UpdateCoreUserSchema = z.infer<typeof updateCoreUserSchema>;
