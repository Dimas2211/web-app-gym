// ─────────────────────────────────────────────────────────────────
// platform/lib/provisioning — resolve-optional-gym-for-tenant.ts
//
// SHARED-PILOT-3B. Gym es una extensión vertical opcional de un
// RuntimeTenant — nunca la raíz de identidad. Este helper es el único
// punto donde el código GYM-aware debe resolver "¿este tenant tiene
// una extensión Gym, y cuál es su id?" antes de escribir gym_id en
// User/Branch/Trainer/etc.
//
// Reglas:
// - Busca Gym por `tenant_id` (columna autoritativa) — NUNCA asume
//   `gym.id === tenantId`, aunque en datos migrados existentes eso
//   sea cierto hoy (ver migración 20260923000000_add_runtime_tenant).
// - Nunca crea un Gym. Un tenant sin Gym es un tenant Commerce-only
//   legítimo — devuelve null, no lanza, no improvisa un alta.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";

/**
 * Resuelve el id de la extensión Gym del tenant, o null si el tenant
 * es Commerce-only (no tiene Gym). Server-only, sin efectos secundarios.
 */
export async function resolveOptionalGymForTenant(
  db: PrismaClient,
  tenantId: string,
): Promise<string | null> {
  const gym = await db.gym.findUnique({
    where: { tenant_id: tenantId },
    select: { id: true },
  });
  return gym?.id ?? null;
}
