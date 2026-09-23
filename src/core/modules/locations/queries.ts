/**
 * Queries de lectura del dominio Location.
 *
 * FUENTE TEMPORAL: tabla `branches` del schema actual.
 * Cuando se complete la Fase 3 del roadmap (tabla `locations` o renaming en Prisma),
 * solo cambia el mapper interno — los consumidores de estas funciones no cambian.
 *
 * MODO: read-only. No hay mutaciones en este módulo.
 */

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { Location, LocationOption } from "./types";

// ─── Mapper interno ────────────────────────────────────────────────────────────

/**
 * Convierte un registro Branch al contrato Location.
 *
 * Mapeo de campos:
 *   Branch.id        → Location.id
 *   Branch.tenant_id → Location.tenant_id
 *   Branch.name      → Location.name
 *   Branch.address → Location.address
 *   Branch.phone   → Location.phone
 *   Branch.status  → Location.status  (ver nota de normalización)
 *
 * NORMALIZACIÓN DE STATUS:
 * Branch usa el enum Status de Prisma (active | inactive | suspended | deleted).
 * Location solo contempla "active" | "inactive".
 * Los valores "suspended" y "deleted" se normalizan a "inactive" para no
 * exponer semántica interna de la tabla branches fuera del módulo GYM.
 */
function branchToLocation(branch: {
  id: string;
  tenant_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}): Location {
  return {
    id: branch.id,
    tenant_id: branch.tenant_id,
    name: branch.name,
    address: branch.address,
    phone: branch.phone,
    status: branch.status === "active" ? "active" : "inactive",
    created_at: branch.created_at,
    updated_at: branch.updated_at,
  };
}

/** Campos Branch necesarios para el mapeo — evita over-fetching. */
const LOCATION_SELECT = {
  id: true,
  tenant_id: true,
  name: true,
  address: true,
  phone: true,
  status: true,
  created_at: true,
  updated_at: true,
} as const;

// ─── Queries públicas ──────────────────────────────────────────────────────────

/**
 * Retorna una ubicación por su ID, tenant-scoped, o null si no existe
 * o pertenece a otro tenant.
 *
 * SHARED-PILOT-3C: antes hacía findUnique solo por `id`, exponiendo
 * locations de tenants ajenos a cualquier caller que conociera el UUID
 * (cookies, params). Ahora exige tenant_id — fail closed.
 */
export async function getLocationById(
  id: string,
  tenantId: string,
  db: PrismaClient = prisma
): Promise<Location | null> {
  const branch = await db.branch.findFirst({
    where: { id, tenant_id: tenantId },
    select: LOCATION_SELECT,
  });
  return branch ? branchToLocation(branch) : null;
}

/**
 * Lista todas las ubicaciones de un tenant, ordenadas por nombre.
 * Incluye todos los estados (para vistas de administración).
 */
export async function getLocationsByTenantId(tenantId: string, db: PrismaClient = prisma): Promise<Location[]> {
  const branches = await db.branch.findMany({
    where: { tenant_id: tenantId },
    select: LOCATION_SELECT,
    orderBy: { name: "asc" },
  });
  return branches.map(branchToLocation);
}

/**
 * Lista liviana de ubicaciones activas para selects y dropdowns.
 * Solo retorna id + name.
 */
export async function getLocationOptions(tenantId: string, db: PrismaClient = prisma): Promise<LocationOption[]> {
  const branches = await db.branch.findMany({
    where: { tenant_id: tenantId, status: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return branches;
}

/**
 * Verifica si una ubicación existe y está activa.
 * Útil como guard de validación en acciones de módulos nuevos.
 */
export async function isLocationActive(
  id: string,
  tenantId: string,
  db: PrismaClient = prisma
): Promise<boolean> {
  const location = await getLocationById(id, tenantId, db);
  return location?.status === "active";
}
