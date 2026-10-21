// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2B — arnés de integración contra PostgreSQL REAL desechable.
//
// Mismas reglas de aislamiento que la certificación de 2A:
//  - solo 127.0.0.1 y puerto ≠ 5432;
//  - data_directory del servidor = GYM_BOOKING_IT_DATA_DIR (verificado);
//  - crea y borra sus propias bases zolvi_it2b_*;
//  - nunca lee .env, DATABASE_URL ni DIRECT_URL (PrismaClient recibe la URL
//    explícita; sin las variables GYM_BOOKING_IT_* los tests se omiten).
//
//   $env:GYM_BOOKING_IT_ADMIN_URL = "postgresql://<user>@127.0.0.1:<port>/postgres"
//   $env:GYM_BOOKING_IT_DATA_DIR  = "<data_directory del servidor desechable>"
//   $env:GYM_BOOKING_IT_PSQL      = "C:\Program Files\PostgreSQL\18\bin\psql.exe"   (opcional; default "psql")
//   npx vitest run src/modules/classes/booking --testTimeout=120000
//
// Las migraciones se aplican con `psql -1 -v ON_ERROR_STOP=1 -f` (forma
// atómica certificada en 2A §7.1), en orden, una por archivo.
// ─────────────────────────────────────────────────────────────────

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../../prisma/migrations");

export const IT_ADMIN_URL = process.env.GYM_BOOKING_IT_ADMIN_URL ?? "";
export const IT_DATA_DIR = process.env.GYM_BOOKING_IT_DATA_DIR ?? "";
const IT_PSQL = process.env.GYM_BOOKING_IT_PSQL ?? "psql";

/** true si el entorno desechable está configurado (si no, los tests de integración se omiten). */
export const IT_ENABLED = IT_ADMIN_URL !== "" && IT_DATA_DIR !== "";

function urlFor(dbName: string, params = ""): string {
  const u = new URL(IT_ADMIN_URL);
  u.pathname = `/${dbName}`;
  u.search = params;
  return u.toString();
}

function assertDisposableUrl() {
  const u = new URL(IT_ADMIN_URL);
  if (u.hostname !== "127.0.0.1" || (u.port || "5432") === "5432") {
    throw new Error("Rechazado: el arnés solo acepta 127.0.0.1 con puerto ≠ 5432");
  }
}

const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

let admin: PrismaClient | null = null;
async function adminClient(): Promise<PrismaClient> {
  if (admin) return admin;
  assertDisposableUrl();
  const c = new PrismaClient({ datasourceUrl: IT_ADMIN_URL });
  const [{ d }] = await c.$queryRawUnsafe<{ d: string }[]>("SELECT current_setting('data_directory') AS d");
  if (norm(d) !== norm(IT_DATA_DIR)) {
    await c.$disconnect();
    throw new Error(`Rechazado: data_directory=${d} no coincide con GYM_BOOKING_IT_DATA_DIR`);
  }
  admin = c;
  return c;
}

export function migrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export function migrationPath(name: string): string {
  return path.join(MIGRATIONS_DIR, name, "migration.sql");
}

/** Ejecuta un archivo SQL con psql en una sola transacción. Lanza con la salida de error de psql. */
export function psqlFile(dbName: string, file: string): string {
  try {
    return execFileSync(IT_PSQL, ["-X", "-q", "-1", "-v", "ON_ERROR_STOP=1", "-d", urlFor(dbName), "-f", file], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    throw new Error(e.stderr?.trim() || e.message);
  }
}

let seq = 0;

export interface ItDatabase {
  name: string;
  db: PrismaClient;
  /** Conexión adicional e independiente (para mantener locks desde fuera del servicio). */
  extraClient: () => PrismaClient;
  drop: () => Promise<void>;
}

/**
 * Crea una base desechable con las migraciones aplicadas. `until` (exclusivo)
 * permite detenerse antes de una migración (p. ej. para certificar la de 2B).
 */
export async function createItDatabase(opts: { until?: string } = {}): Promise<ItDatabase> {
  const a = await adminClient();
  const name = `zolvi_it2b_${process.pid}_${Date.now().toString(36)}_${seq++}`;
  await a.$executeRawUnsafe(`CREATE DATABASE "${name}" ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);
  for (const m of migrationNames()) {
    if (opts.until && m >= opts.until) break;
    psqlFile(name, migrationPath(m));
  }
  const clients: PrismaClient[] = [];
  const make = () => {
    const c = new PrismaClient({ datasourceUrl: urlFor(name, "?connection_limit=40&pool_timeout=30") });
    clients.push(c);
    return c;
  };
  const db = make();
  return {
    name,
    db,
    extraClient: make,
    drop: async () => {
      await Promise.all(clients.map((c) => c.$disconnect()));
      await a.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    },
  };
}

/** Espera (sin sleeps fijos) a que alguna conexión de la base quede bloqueada esperando un lock. */
export async function waitForLockWaiters(dbName: string, count = 1, timeoutMs = 15_000): Promise<void> {
  const a = await adminClient();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [{ n }] = await a.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname = $1 AND wait_event_type = 'Lock'`,
      dbName
    );
    if (n >= count) return;
    if (Date.now() > deadline) throw new Error(`timeout esperando ${count} conexión(es) bloqueadas en ${dbName}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

export async function disconnectAdmin() {
  if (admin) await admin.$disconnect();
  admin = null;
}
