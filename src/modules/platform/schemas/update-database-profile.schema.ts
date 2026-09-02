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

  // ── Conexión directa opcional para migraciones (RUN_MIGRATIONS) ──
  // Todo-o-nada entre host/db/usuario (validado abajo). El password
  // directo es opcional aquí igual que el password principal: vacío =
  // conservar el direct_encrypted_password existente (resuelto en la
  // action, que sí conoce el estado previo). Si host/db/usuario quedan
  // los tres vacíos, la action interpreta "limpiar conexión directa".
  direct_db_host: z
    .string()
    .max(253, "El host directo no puede superar 253 caracteres.")
    .trim()
    .optional(),

  direct_db_port: z.coerce
    .number()
    .int("El puerto directo debe ser un número entero.")
    .min(1, "El puerto mínimo es 1.")
    .max(65535, "El puerto máximo es 65535.")
    .nullable()
    .optional(),

  direct_db_name: z
    .string()
    .max(63, "El nombre de la base directa no puede superar 63 caracteres.")
    .trim()
    .optional(),

  direct_db_user: z
    .string()
    .max(63, "El usuario directo no puede superar 63 caracteres.")
    .trim()
    .optional(),

  direct_password: z
    .string()
    .max(500, "El password directo no puede superar 500 caracteres.")
    .optional(),

  direct_ssl_mode: z.enum(DATABASE_SSL_MODES).optional(),
}).superRefine((data, ctx) => {
  const hostSet = !!data.direct_db_host?.trim();
  const nameSet = !!data.direct_db_name?.trim();
  const userSet = !!data.direct_db_user?.trim();

  // A diferencia de creación, el password NO entra en el todo-o-nada
  // aquí — vacío puede significar "conservar el existente" y solo la
  // action lo sabe. Pero host/db/usuario sí deben ir juntos o los tres
  // vacíos (limpiar).
  const anySet = hostSet || nameSet || userSet;
  const allSet = hostSet && nameSet && userSet;

  if (anySet && !allSet) {
    ctx.addIssue({
      code:    z.ZodIssueCode.custom,
      path:    ["direct_db_host"],
      message: "Para configurar la conexión directa de migraciones, completa host, base y usuario " +
               "directos — o deja los tres campos vacíos para limpiarla.",
    });
  }
});

export type UpdateDatabaseProfileInput = z.infer<typeof updateDatabaseProfileSchema>;
