// ─────────────────────────────────────────────────────────────────
// platform/lib/tenant-binding — tenant-discovery.ts
//
// Detección read-only de tenants (runtime_tenants) dentro de una base
// cliente. C7 — Organization Tenant Binding & Auto-Discovery.
//
// SHARED-PILOT-3: RuntimeTenant es la raíz neutral de identidad runtime.
// Antes leía `gyms` directamente (Gym actuaba como tenant root implícito);
// ahora lee `runtime_tenants`, que para tenants GYM existentes conserva el
// mismo id que su `gyms.id` (ver migración 20260923000000_add_runtime_tenant)
// y para tenants Commerce-only puede no tener ningún Gym asociado.
//
// Reglas de seguridad:
// - Solo lectura: runtimeTenant.findMany. Sin creates/updates/deletes.
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
 * Lee la tabla `runtime_tenants` de la base cliente conectada por
 * `prismaClient` y retorna los tenants activos/existentes detectados.
 * Read-only.
 *
 * TODO(provisioning): cuando el flujo de provisioning cree una base
 * nueva, debe crear el `runtime_tenant` correspondiente y guardar
 * automáticamente ese `runtime_tenant.id` en `organization.tenant_id`
 * (ver bind-organization-tenant.action.ts).
 */
export async function detectTenantsFromClientDatabase(
  prismaClient: PrismaClient,
): Promise<DetectedTenant[]> {
  const tenants = await prismaClient.runtimeTenant.findMany({
    select: {
      id:     true,
      name:   true,
      slug:   true,
      status: true,
    },
    orderBy: { created_at: "asc" },
    take: 20,
  });

  return tenants.map((t) => ({
    id:     t.id,
    name:   t.name,
    slug:   t.slug ?? null,
    status: t.status ? String(t.status) : null,
  }));
}
