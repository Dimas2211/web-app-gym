// ─────────────────────────────────────────────────────────────────
// platform — update-database-profile.schema.ts
//
// Validación Zod para actualizar un PlatformDatabaseProfile.
// El password es opcional en actualización:
//   - Si se envía, reemplaza el encrypted_password existente.
//   - Si se omite o es vacío, se conserva el valor cifrado anterior.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

const DATABASE_PROFILE_ENVIRONMENTS = [
  "LOCAL",
  "SANDBOX",
  "TEST",
  "STAGING",
  "PRODUCTION",
] as const;

const DATABASE_PROVIDERS = [
  "POSTGRESQL",
  "SUPABASE",
  "NEON",
  "RENDER",
  "LOCAL_POSTGRES",
  "OTHER",
] as const;

const DATABASE_SSL_MODES = ["DISABLE", "PREFER", "REQUIRE"] as const;

export const updateDatabaseProfileSchema = z.object({
  label: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(100, "El nombre no puede superar 100 caracteres.")
    .trim()
    .optional(),

  environment: z.enum(DATABASE_PROFILE_ENVIRONMENTS).optional(),

  provider: z.enum(DATABASE_PROVIDERS).optional(),

  db_host: z
    .string()
    .min(1, "El host no puede estar vacío.")
    .max(253, "El host no puede superar 253 caracteres.")
    .trim()
    .optional(),

  db_port: z.coerce
    .number()
    .int("El puerto debe ser un número entero.")
    .min(1, "El puerto mínimo es 1.")
    .max(65535, "El puerto máximo es 65535.")
    .nullable()
    .optional(),

  db_name: z
    .string()
    .min(1, "El nombre de la base no puede estar vacío.")
    .max(63, "El nombre de la base no puede superar 63 caracteres.")
    .trim()
    .optional(),

  db_user: z
    .string()
    .min(1, "El usuario no puede estar vacío.")
    .max(63, "El usuario no puede superar 63 caracteres.")
    .trim()
    .optional(),

  // Opcional en update — vacío o ausente = conservar el cifrado anterior
  password: z
    .string()
    .max(500, "El password no puede superar 500 caracteres.")
    .optional(),

  ssl_mode: z.enum(DATABASE_SSL_MODES).optional(),

  connection_options: z.record(z.unknown()).nullable().optional(),
});

export type UpdateDatabaseProfileInput = z.infer<typeof updateDatabaseProfileSchema>;
