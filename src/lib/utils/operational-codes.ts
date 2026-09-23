import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";

// FASE VI-D4 — ETAPA D: `db` opcional, default Prisma global solo para
// compatibilidad de callers no migrados (ej. settings/codes, Clients).

// ──────────────────────────────────────────────────────────────
// Defaults — se usan si no existe GymSettings para el gym
// ──────────────────────────────────────────────────────────────
const STAFF_DEFAULTS = { prefix: "A", digits: 4, start: 1010 } as const;
const CLIENT_DEFAULTS = { prefix: "C", digits: 4, start: 1010 } as const;

function formatCode(prefix: string, num: number, digits: number): string {
  return `${prefix}${String(num).padStart(digits, "0")}`;
}

/**
 * Resuelve el id de la extensión Gym del tenant, o null si es Commerce-only.
 * SHARED-PILOT-3C: Client.gym_id debe resolverse desde Gym.tenant_id,
 * nunca asumir gym.id === tenantId.
 */
async function resolveGymId(tenantId: string, db: PrismaClient): Promise<string | null> {
  const gym = await db.gym.findUnique({ where: { tenant_id: tenantId }, select: { id: true } });
  return gym?.id ?? null;
}

async function getSettings(tenantId: string, db: PrismaClient = prisma) {
  // GymSettings es 1:1 con Gym (extensión vertical opcional) — se
  // resuelve por Gym.tenant_id, nunca asumiendo gym.id === tenantId.
  // Un tenant Commerce-only sin Gym simplemente no tiene GymSettings —
  // se usan los defaults de abajo.
  const gym = await db.gym.findUnique({ where: { tenant_id: tenantId }, select: { id: true } });
  const s = gym ? await db.gymSettings.findUnique({ where: { gym_id: gym.id } }) : null;
  return {
    staff: {
      prefix: s?.staff_code_prefix ?? STAFF_DEFAULTS.prefix,
      digits: s?.staff_code_digits ?? STAFF_DEFAULTS.digits,
      start: s?.staff_code_start ?? STAFF_DEFAULTS.start,
    },
    client: {
      prefix: s?.client_code_prefix ?? CLIENT_DEFAULTS.prefix,
      digits: s?.client_code_digits ?? CLIENT_DEFAULTS.digits,
      start: s?.client_code_start ?? CLIENT_DEFAULTS.start,
    },
  };
}

/**
 * Sugiere el siguiente código de personal (staff) disponible para el gym.
 * Busca el número más alto ya usado con el mismo prefijo y lo incrementa.
 */
export async function suggestNextStaffCode(tenantId: string, db: PrismaClient = prisma): Promise<string> {
  const { staff } = await getSettings(tenantId, db);
  const { prefix, digits, start } = staff;

  const users = await db.user.findMany({
    where: { tenant_id: tenantId, operational_code: { startsWith: prefix } },
    select: { operational_code: true },
  });

  let maxNum = start - 1;
  for (const u of users) {
    if (!u.operational_code) continue;
    const n = parseInt(u.operational_code.slice(prefix.length), 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  }

  return formatCode(prefix, maxNum + 1, digits);
}

/**
 * Sugiere el siguiente código de cliente disponible para el gym.
 */
export async function suggestNextClientCode(tenantId: string, db: PrismaClient = prisma): Promise<string> {
  const { client } = await getSettings(tenantId, db);
  const { prefix, digits, start } = client;

  const gymId = await resolveGymId(tenantId, db);
  const clients = gymId
    ? await db.client.findMany({
        where: { gym_id: gymId, operational_code: { startsWith: prefix } },
        select: { operational_code: true },
      })
    : [];

  let maxNum = start - 1;
  for (const c of clients) {
    if (!c.operational_code) continue;
    const n = parseInt(c.operational_code.slice(prefix.length), 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  }

  return formatCode(prefix, maxNum + 1, digits);
}

/** Genera un token QR estable usando la API nativa de Node.js. */
export function generateQrToken(): string {
  return crypto.randomUUID();
}

/**
 * Valida que un código no esté ya en uso por otro usuario del mismo gym.
 * Devuelve true si está disponible.
 */
export async function isStaffCodeAvailable(
  tenantId: string,
  code: string,
  excludeUserId?: string,
  db: PrismaClient = prisma
): Promise<boolean> {
  const existing = await db.user.findFirst({
    where: {
      tenant_id: tenantId,
      operational_code: code,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  return !existing;
}

/**
 * Valida que un código no esté ya en uso por otro cliente del mismo gym.
 */
export async function isClientCodeAvailable(
  tenantId: string,
  code: string,
  excludeClientId?: string,
  db: PrismaClient = prisma
): Promise<boolean> {
  const gymId = await resolveGymId(tenantId, db);
  if (!gymId) return true; // Commerce-only tenant — sin Gym, sin clientes GYM

  const existing = await db.client.findFirst({
    where: {
      gym_id: gymId,
      operational_code: code,
      ...(excludeClientId ? { id: { not: excludeClientId } } : {}),
    },
    select: { id: true },
  });
  return !existing;
}
