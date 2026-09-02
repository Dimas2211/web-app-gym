// ─────────────────────────────────────────────────────────────────
// platform — create-database-profile.schema.ts
//
// Validación Zod para crear un PlatformDatabaseProfile.
// El password es obligatorio en creación y se cifra en la action.
// Nunca se devuelve el password ni el encrypted_password al cliente.
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

export const createDatabaseProfileSchema = z.object({
  organization_id: z
    .string({ required_error: "La organización es requerida." })
    .uuid("ID de organización inválido."),

  label: z
    .string({ required_error: "El nombre del perfil es requerido." })
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(100, "El nombre no puede superar 100 caracteres.")
    .trim(),

  environment: z.enum(DATABASE_PROFILE_ENVIRONMENTS, {
    required_error: "El entorno es requerido.",
  }),

  provider: z
    .enum(DATABASE_PROVIDERS)
    .default("POSTGRESQL"),

  db_host: z
    .string({ required_error: "El host es requerido." })
    .min(1, "El host no puede estar vacío.")
    .max(253, "El host no puede superar 253 caracteres.")
    .trim(),

  db_port: z.coerce
    .number()
    .int("El puerto debe ser un número entero.")
    .min(1, "El puerto mínimo es 1.")
    .max(65535, "El puerto máximo es 65535.")
    .nullable()
    .optional(),

  db_name: z
    .string({ required_error: "El nombre de la base de datos es requerido." })
    .min(1, "El nombre de la base no puede estar vacío.")
    .max(63, "El nombre de la base no puede superar 63 caracteres.")
    .trim(),

  db_user: z
    .string({ required_error: "El usuario es requerido." })
    .min(1, "El usuario no puede estar vacío.")
    .max(63, "El usuario no puede superar 63 caracteres.")
    .trim(),

  // Obligatorio en creación — se cifra en la action, nunca se persiste en plano
  password: z
    .string({ required_error: "El password es requerido." })
    .min(1, "El password no puede estar vacío.")
    .max(500, "El password no puede superar 500 caracteres."),

  ssl_mode: z
    .enum(DATABASE_SSL_MODES)
    .default("PREFER"),

  connection_options: z.record(z.unknown()).nullable().optional(),

  // ── Conexión directa opcional para migraciones (RUN_MIGRATIONS) ──
  // Todo-o-nada: si se configura, host + db + usuario + password deben
  // venir juntos (validado en el .superRefine de abajo). Dejar los
  // cuatro vacíos = sin conexión directa (comportamiento normal).
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

  direct_ssl_mode: z
    .enum(DATABASE_SSL_MODES)
    .optional(),
}).superRefine((data, ctx) => {
  const hostSet = !!data.direct_db_host?.trim();
  const nameSet = !!data.direct_db_name?.trim();
  const userSet = !!data.direct_db_user?.trim();
  const passSet = !!data.direct_password?.trim();
  const anySet = hostSet || nameSet || userSet || passSet;
  const allSet = hostSet && nameSet && userSet && passSet;

  if (anySet && !allSet) {
    ctx.addIssue({
      code:    z.ZodIssueCode.custom,
      path:    ["direct_db_host"],
      message: "Para configurar la conexión directa de migraciones, completa host, base, usuario y " +
               "password directos — o deja los cuatro campos vacíos para no configurarla.",
    });
  }
});

export type CreateDatabaseProfileInput = z.infer<typeof createDatabaseProfileSchema>;
