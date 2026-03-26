import { z } from "zod";

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

export const createClientSchema = baseClientSchema;

export const updateClientSchema = baseClientSchema;

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
