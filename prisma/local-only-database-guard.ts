/**
 * prisma/local-only-database-guard.ts
 *
 * Barrera para scripts de datos DEMO que escriben directo con Prisma
 * (p. ej. seed-sales-demo.ts). Debe ejecutarse ANTES de crear el
 * PrismaClient y antes de cualquier lectura/escritura.
 *
 * Falla cerrado. Solo permite ejecutar cuando:
 *   - NODE_ENV no es "production" y no se está dentro de Vercel;
 *   - DATABASE_URL está definida y apunta a un host local;
 *   - DIRECT_URL, si está definida, también apunta a un host local;
 *   - ambas son URLs postgres:// o postgresql:// parseables, sin parámetro
 *     `host`/`hostaddr` (que podría redirigir a otro servidor).
 * Hosts locales aceptados: localhost, 127.0.0.1, ::1. El nombre de la base
 * NO se usa como criterio. Los mensajes nunca incluyen la URL, el usuario,
 * la contraseña ni el host recibido.
 */

export type GuardEnv = Record<string, string | undefined>;

export type GuardResult = { ok: true } | { ok: false; reason: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

function checkUrl(name: string, raw: string): GuardResult {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: `${name} no es una URL válida.` };
  }
  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: `${name} no es una URL de PostgreSQL.` };
  }
  if (!LOCAL_HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, reason: `${name} apunta a un host que no es local.` };
  }
  for (const key of url.searchParams.keys()) {
    const k = key.toLowerCase();
    if (k === "host" || k === "hostaddr") {
      return { ok: false, reason: `${name} redefine el host con el parámetro "${k}".` };
    }
  }
  return { ok: true };
}

export function checkLocalOnlyDatabase(env: GuardEnv): GuardResult {
  if ((env.NODE_ENV ?? "").trim().toLowerCase() === "production") {
    return { ok: false, reason: "NODE_ENV=production." };
  }
  if (env.VERCEL || env.VERCEL_ENV) {
    return { ok: false, reason: "Ejecución dentro de Vercel." };
  }

  const databaseUrl = env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    return { ok: false, reason: "DATABASE_URL no está definida." };
  }
  const db = checkUrl("DATABASE_URL", databaseUrl);
  if (!db.ok) return db;

  const directUrl = env.DIRECT_URL;
  if (directUrl !== undefined) {
    if (directUrl.trim() === "") {
      return { ok: false, reason: "DIRECT_URL está definida pero vacía (configuración ambigua)." };
    }
    const direct = checkUrl("DIRECT_URL", directUrl);
    if (!direct.ok) return direct;
  }

  return { ok: true };
}

/** Aborta el proceso (exit 1) si el entorno no es una base local de desarrollo. */
export function assertLocalOnlyDatabase(env: GuardEnv, scriptName: string): void {
  const result = checkLocalOnlyDatabase(env);
  if (result.ok) return;
  console.error(`\n✗ ${scriptName}: ejecución bloqueada — ${result.reason}`);
  console.error("  Este script solo puede escribir en una base PostgreSQL local de desarrollo.\n");
  process.exit(1);
}
