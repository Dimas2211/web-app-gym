import { prisma } from "@/lib/db/prisma";

// ──────────────────────────────────────────────────────────────
// Defaults — se usan si no existe GymSettings para el gym
// ──────────────────────────────────────────────────────────────
const STAFF_DEFAULTS = { prefix: "A", digits: 4, start: 1010 } as const;
const CLIENT_DEFAULTS = { prefix: "C", digits: 4, start: 1010 } as const;

function formatCode(prefix: string, num: number, digits: number): string {
  return `${prefix}${String(num).padStart(digits, "0")}`;
}

async function getSettings(gymId: string) {
  const s = await prisma.gymSettings.findUnique({ where: { gym_id: gymId } });
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
export async function suggestNextStaffCode(gymId: string): Promise<string> {
  const { staff } = await getSettings(gymId);
  const { prefix, digits, start } = staff;

  const users = await prisma.user.findMany({
    where: { gym_id: gymId, operational_code: { startsWith: prefix } },
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
export async function suggestNextClientCode(gymId: string): Promise<string> {
  const { client } = await getSettings(gymId);
  const { prefix, digits, start } = client;

  const clients = await prisma.client.findMany({
    where: { gym_id: gymId, operational_code: { startsWith: prefix } },
    select: { operational_code: true },
  });

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
  gymId: string,
  code: string,
  excludeUserId?: string
): Promise<boolean> {
  const existing = await prisma.user.findFirst({
    where: {
      gym_id: gymId,
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
  gymId: string,
  code: string,
  excludeClientId?: string
): Promise<boolean> {
  const existing = await prisma.client.findFirst({
    where: {
      gym_id: gymId,
      operational_code: code,
      ...(excludeClientId ? { id: { not: excludeClientId } } : {}),
    },
    select: { id: true },
  });
  return !existing;
}
