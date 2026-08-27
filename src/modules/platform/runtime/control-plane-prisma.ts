// ─────────────────────────────────────────────────────────────────
// platform/runtime — control-plane-prisma.ts
//
// Reexporta explícitamente el Prisma singleton de CONTROL PLANE
// (base de la app: PlatformOrganization, PlatformDatabaseProfile,
// PlatformDeploymentLog, usuarios superadmin, preflight, inspector,
// configuración de plataforma).
//
// Este cliente usa DATABASE_URL de la app (src/lib/db/prisma.ts).
// NUNCA debe usarse para leer/escribir datos operativos de un
// cliente (gyms, products, sales, dte, etc.) — eso es CLIENT RUNTIME
// y debe resolverse con runtime-database-router.ts.
//
// Regla de nombres: cualquier módulo que necesite la base cliente
// debe importar `withRuntimePrisma` / `withOrganizationRuntimePrisma`
// de "./runtime-database-router", nunca `controlPlanePrisma`.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[control-plane-prisma] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { prisma } from "@/lib/db/prisma";

/** Prisma del control plane — solo entidades PlatformX. Nunca datos de cliente. */
export const controlPlanePrisma = prisma;
