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
 * Detecta si el puerto corresponde a un connection pooler en modo
 * TRANSACCIÓN (Supabase Supavisor/PgBouncer, puerto 6543). Ese modo
 * no soporta prepared statements por conexión — Prisma debe usar modo
 * simple query (`pgbouncer=true`) y una sola conexión lógica por
 * instancia de cliente (`connection_limit=1`), o falla con errores tipo
 * "prepared statement \"sNN\" already exists".
 *
 * Deliberadamente NO se usa el host (ej. "*.pooler.supabase.com") como
 * señal: Supabase expone el MISMO host tanto para el Transaction Pooler
 * (6543) como para el Session Pooler (5432), y este último sí soporta
 * prepared statements — agregarle pgbouncer=true sería innecesario y
 * no debe ser automático. El criterio es el puerto.
 *
 * Si en el futuro Supabase u otro proveedor expone una señal explícita
 * de "esto es transaction pooler" (ej. un campo en el perfil), se puede
 * sumar aquí — hoy el único criterio soportado es port === 6543.
 */
function isTransactionPoolerTarget(_host: string, port: number): boolean {
  return port === 6543;
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

  const params = new URLSearchParams({ sslmode: sslMode });

  // Transaction pooler (ej. Supabase puerto 6543): Prisma necesita
  // modo pgbouncer (sin prepared statements) y connection_limit=1
  // para no reventar el pool de conexiones del lado del pooler.
  if (isTransactionPoolerTarget(profile.db_host, port)) {
    params.set("pgbouncer", "true");
    params.set("connection_limit", "1");
  }

  return `postgresql://${user}:${pass}@${profile.db_host}:${port}/${db}?${params.toString()}`;
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
