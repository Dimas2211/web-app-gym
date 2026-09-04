// ─────────────────────────────────────────────────────────────────
// platform/runtime/commercial-enforcement — with-capacity-checked-transaction.ts
//
// Bloque B — helper de atomicidad para operaciones que INCREMENTAN
// una capacidad (delta > 0): check de capacidad + write en la MISMA
// transacción, con isolationLevel Serializable y retry acotado ante
// conflicto de serialización (P2034 / código PG 40001). Reutilizable
// para create/reactivate de Users, Locations, Products, Cash.
//
// delta<=0 (desactivar/editar sin cambio de cupo) no necesita pasar
// por aquí — nunca compite por el límite.
//
// Solo P2034 (conflicto de serialización/write) dispara retry. Un
// CommercialEnforcementError (MODULE_NOT_ENABLED, CAPACITY_LIMIT_REACHED,
// ENTITLEMENT_NOT_CONFIGURED) NUNCA se reintenta — se propaga tal cual.
// ─────────────────────────────────────────────────────────────────

import { Prisma, type PrismaClient } from "@prisma/client";
import { assertCapacityAvailable } from "./capacity-engine";
import type { CommercialEnforcementContext } from "./types";

function isPrismaSerializationConflict(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === "P2034" || err.meta?.code === "40001")
  );
}

export interface WithCapacityCheckedTransactionOptions {
  /** Máximo de reintentos ADICIONALES ante conflicto de serialización. Default 2 (3 intentos totales). */
  maxRetries?: number;
}

/**
 * Ejecuta `write` dentro de una transacción Serializable que primero
 * verifica capacidad fresca (`assertCapacityAvailable`) contra el mismo
 * `tx`. Reintenta hasta `maxRetries` veces (default 2) solo si Postgres
 * aborta por conflicto de serialización — cualquier otro error, incluido
 * CommercialEnforcementError, se propaga de inmediato sin reintentar.
 */
export async function withCapacityCheckedTransaction<T>(
  runtimeDb: PrismaClient,
  entitlementCode: string,
  delta: number,
  ctx: CommercialEnforcementContext,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
  opts?: WithCapacityCheckedTransactionOptions,
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 2;

  for (let attempt = 0; ; attempt++) {
    try {
      return await runtimeDb.$transaction(
        async (tx) => {
          if (delta > 0) {
            await assertCapacityAvailable(entitlementCode, delta, ctx, tx);
          }
          return write(tx);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (isPrismaSerializationConflict(err) && attempt < maxRetries) continue;
      throw err;
    }
  }
}
