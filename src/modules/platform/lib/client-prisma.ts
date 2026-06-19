// ─────────────────────────────────────────────────────────────────
// platform/lib — client-prisma.ts
//
// Helper SERVER-ONLY para crear y gestionar un PrismaClient
// temporal apuntando a la base de datos de un cliente.
//
// Reglas de seguridad:
// - El PrismaClient dinámico NUNCA se mantiene como singleton global.
// - Siempre se ejecuta $disconnect() en el bloque finally.
// - Solo se usa desde actions administrativas de Platform Admin.
// - La databaseUrl contiene el password descifrado — no loguear.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[client-prisma] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { PrismaClient } from "@prisma/client";

/**
 * Crea un PrismaClient temporal apuntando a `databaseUrl`,
 * ejecuta `callback`, y desconecta siempre en el bloque finally.
 *
 * El PrismaClient creado aquí es completamente independiente del
 * singleton de la app (src/lib/db/prisma.ts) y no afecta el
 * runtime normal de la aplicación.
 */
export async function withTemporaryPrismaClient<T>(
  databaseUrl: string,
  callback: (client: PrismaClient) => Promise<T>,
): Promise<T> {
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: [],  // Sin logs — la URL contiene el password
  });

  try {
    return await callback(client);
  } finally {
    await client.$disconnect();
  }
}
