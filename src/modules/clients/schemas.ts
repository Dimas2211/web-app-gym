import { z } from "zod";
import { passwordSchema } from "@/core/modules/users/schemas";
import { GYM_CLIENT_MODALITIES } from "@/modules/memberships/modality-rules";

const baseClientSchema = z.object({
  first_name: z.string().min(1, "El nombre es requerido").max(100),
  last_name: z.string().min(1, "El apellido es requerido").max(100),
  document_id: z.string().max(50).optional().nullable(),
  birth_date: z.string().optional().nullable(), // ISO date string
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional().nullable(),
  email: z.string().email("Correo inválido").optional().nullable().or(z.literal("")),
  phone: z.string().max(30).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  emergency_contact_name: z.string().max(100).optional().nullable(),
  emergency_contact_phone: z.string().max(30).optional().nullable(),
  sport_id: z.string().uuid().optional().nullable(),
  goal_id: z.string().uuid().optional().nullable(),
  assigned_trainer_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  branch_id: z.string().uuid("Sucursal requerida"),
});

// GYM-BOOKINGS 3A — la modalidad se elige al crear (default NORMAL). En la
// edición NO viaja por el formulario general: cambiarla exige motivo e
// historial (changeClientModalitySchema / changeClientModalityAction).
export const createClientSchema = baseClientSchema.extend({
  modality: z.enum(GYM_CLIENT_MODALITIES).default("NORMAL"),
});

export const updateClientSchema = baseClientSchema;

export const changeClientModalitySchema = z.object({
  client_id: z.string().uuid("Cliente requerido"),
  to_modality: z.enum(GYM_CLIENT_MODALITIES, { required_error: "Modalidad requerida" }),
  reason: z
    .string({ required_error: "El motivo es requerido" })
    .trim()
    .min(3, "Indica el motivo del cambio (mínimo 3 caracteres)")
    .max(500, "Máximo 500 caracteres"),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

// ──────────────────────────────────────────────
// Portal del cliente: credenciales de acceso (User role=client)
// ──────────────────────────────────────────────
// User.email = credencial de acceso al portal; Client.email = dato de
// contacto del expediente. Estos schemas solo gobiernan la credencial.

export const updatePortalEmailSchema = z.object({
  portal_email: z
    .string({ required_error: "El correo es requerido" })
    .trim()
    .min(1, "El correo es requerido")
    .email("Correo electrónico inválido"),
});

// Reglas de password: passwordSchema core (8–72) — no se duplican aquí.
export const resetPortalPasswordSchema = z
  .object({
    new_password: passwordSchema,
    confirm_password: z.string({ required_error: "Confirma la nueva contraseña" }),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Las contraseñas no coinciden",
    path: ["confirm_password"],
  });
