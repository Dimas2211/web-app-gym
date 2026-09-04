// ─────────────────────────────────────────────────────────────────
// platform/runtime/commercial-enforcement — capacity-registry.ts
//
// Bloque B — registro declarativo de capacidades estáticas: mapea
// cada entitlement code a un usage provider (cómo contar el uso real
// en la runtime DB correcta) y a un helper puro de "¿este estado
// consume cupo?" para los recursos cuyo guard depende de una
// transición de estado (Users/Locations/Products/Cash).
//
// Usage source = TARGET RUNTIME DB — el provider NUNCA asume un
// PrismaClient por defecto. El caller pasa explícito el cliente
// correcto (el `prisma` singleton normal para los 4 recursos en sus
// entry points actuales, o el PrismaClient temporal del Runtime
// Database Router en Data Onboarding). Sin fallback silencioso.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient, Prisma } from "@prisma/client";

/** Cliente Prisma explícito: el singleton normal, un $transaction client, o el runtime temporal de Data Onboarding. */
export type RuntimeDbClient = PrismaClient | Prisma.TransactionClient;

export interface CapacityUsageProvider {
  /** Cuenta el uso actual del tenant contra `runtimeDb` — nunca contra el Control Plane. */
  countUsage: (tenantId: string, runtimeDb: RuntimeDbClient) => Promise<number>;
}

export const CAPACITY_REGISTRY: Record<string, CapacityUsageProvider> = {
  "core.users.max": {
    countUsage: (tenantId, db) => db.user.count({ where: { gym_id: tenantId, status: "active" } }),
  },
  "core.locations.max": {
    countUsage: (tenantId, db) => db.branch.count({ where: { gym_id: tenantId, status: "active" } }),
  },
  "commerce.products.max": {
    countUsage: (tenantId, db) =>
      db.product.count({ where: { tenant_id: tenantId, status: { not: "DISCONTINUED" } } }),
  },
  "commerce.cash_registers.max": {
    countUsage: (tenantId, db) => db.cashRegister.count({ where: { tenant_id: tenantId, is_active: true } }),
  },
};

// ── Helpers puros de "¿este estado consume cupo?" ──────────────────
//
// El entitlement limita recursos HABILITADOS/ACTIVOS, no "toda alta".
// El delta real de una transición es (willBeCounted?1:0) - (wasCounted?1:0)
// ∈ {-1, 0, +1}. Solo se llama assertCapacityAvailable cuando delta > 0.

/** commerce.products.max cuenta todo estado excepto DISCONTINUED (fin de vida). */
export function isProductCountedForCapacity(status: string): boolean {
  return status !== "DISCONTINUED";
}

/** core.users.max cuenta usuarios con status "active" (pueden operar). */
export function isUserCountedForCapacity(status: string): boolean {
  return status === "active";
}

/** core.locations.max cuenta Branch/Location con status "active". */
export function isLocationCountedForCapacity(status: string): boolean {
  return status === "active";
}

/** commerce.cash_registers.max cuenta CashRegister con is_active=true. CashSession nunca consume cupo de caja. */
export function isCashRegisterCountedForCapacity(isActive: boolean): boolean {
  return isActive;
}

/** Delta de capacidad de una transición de estado: -1 | 0 | +1. Solo delta>0 dispara assertCapacityAvailable. */
export function capacityDelta(wasCounted: boolean, willBeCounted: boolean): -1 | 0 | 1 {
  return ((willBeCounted ? 1 : 0) - (wasCounted ? 1 : 0)) as -1 | 0 | 1;
}
