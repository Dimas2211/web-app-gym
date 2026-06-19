// ─────────────────────────────────────────────────────────────────
// platform/lib — database-profile-url.ts
//
// Helpers SERVER-ONLY para construir una DATABASE_URL en memoria
// desde un PlatformDatabaseProfile y sanitizar errores de conexión.
//
// NUNCA importar desde Client Components ni páginas browser-only.
// NUNCA loguear la URL resultante — contiene password descifrado.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[database-profile-url] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { decryptText } from "@/lib/security/encryption";

// Mapeo de enum PlatformDatabaseSslMode → valor sslmode de Postgres
const SSL_MODE_MAP: Record<string, string> = {
  DISABLE: "disable",
  PREFER:  "prefer",
  REQUIRE: "require",
};

// Solo los campos necesarios para construir la URL — no el perfil completo
export interface DatabaseProfileConnectionFields {
  db_host:            string;
  db_port:            number | null;
  db_name:            string;
  db_user:            string;
  encrypted_password: string;
  ssl_mode:           string;
}

/**
 * Descifra el password y construye la DATABASE_URL en memoria.
 * La URL resultante contiene el password en plano — no persistir,
 * no loguear, descartar inmediatamente después de crear el PrismaClient.
 */
export function buildDatabaseUrlFromProfile(
  profile: DatabaseProfileConnectionFields,
): string {
  const password = decryptText(profile.encrypted_password);
  const port     = profile.db_port ?? 5432;
  const sslMode  = SSL_MODE_MAP[profile.ssl_mode] ?? "prefer";

  // URL-encode user/password para manejar caracteres especiales sin romper la URL
  const user = encodeURIComponent(profile.db_user);
  const pass = encodeURIComponent(password);
  const db   = encodeURIComponent(profile.db_name);

  return `postgresql://${user}:${pass}@${profile.db_host}:${port}/${db}?sslmode=${sslMode}`;
}

/**
 * Limpia mensajes de error que pudieran contener connection strings,
 * passwords o tokens embebidos antes de devolverlos al cliente.
 * Trunca a 500 caracteres para evitar payloads de error excesivos.
 */
export function sanitizeDatabaseError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  return raw
    // connection strings completas
    .replace(/postgresql:\/\/[^\s"']*/gi, "[connection-string-redacted]")
    .replace(/postgres:\/\/[^\s"']*/gi,   "[connection-string-redacted]")
    // segmento user:password@host en strings libres
    .replace(/:[^@\s]{1,256}@/g, ":[redacted]@")
    // parámetro password= en query strings
    .replace(/password=[^\s&"']*/gi, "password=[redacted]")
    // recortar a tamaño seguro
    .substring(0, 500);
}
