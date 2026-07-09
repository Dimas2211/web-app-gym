// ─────────────────────────────────────────────────────────────────
// platform/lib/tenant-binding — tenant-discovery.ts
//
// Detección read-only de tenants (gyms) dentro de una base cliente.
// C7 — Organization Tenant Binding & Auto-Discovery.
//
// Reglas de seguridad:
// - Solo lectura: gym.findMany. Sin creates/updates/deletes.
// - No abre ni cierra la conexión — recibe un PrismaClient ya
//   construido por el caller (withTemporaryPrismaClient se encarga
//   de $disconnect()).
// - No conoce credenciales ni DATABASE_URL — solo recibe el client.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[tenant-discovery] Módulo server-only. No usar en contexto de navegador.",
  );
}

import type { PrismaClient } from "@prisma/client";
import type { DetectedTenant } from "../../types/platform.types";

/**
 * Lee la tabla `gyms` de la base cliente conectada por `prismaClient`
 * y retorna los tenants activos/existentes detectados. Read-only.
 *
 * TODO(provisioning): cuando el flujo de provisioning cree una base
 * nueva y genere el registro en `gyms`, debe guardar automáticamente
 * ese `gym.id` en `organization.tenant_id` (ver bind-organization-tenant.action.ts).
 */
export async function detectTenantsFromClientDatabase(
  prismaClient: PrismaClient,
): Promise<DetectedTenant[]> {
  const gyms = await prismaClient.gym.findMany({
    select: {
      id:     true,
      name:   true,
      slug:   true,
      status: true,
    },
    orderBy: { created_at: "asc" },
    take: 20,
  });

  return gyms.map((g) => ({
    id:     g.id,
    name:   g.name,
    slug:   g.slug ?? null,
    status: g.status ? String(g.status) : null,
  }));
}
