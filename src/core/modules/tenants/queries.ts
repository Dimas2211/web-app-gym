/**
 * Queries de lectura del dominio Tenant.
 *
 * FUENTE: tabla `runtime_tenants` (RuntimeTenant), raíz neutral de
 * multi-tenancy de la plataforma. `logo_url` es un campo de la vertical
 * Gym (extensión opcional) y se resuelve vía la relación `gym` cuando existe;
 * un RuntimeTenant sin Gym asociado (commerce puro) retorna logo_url: null.
 *
 * MODO: read-only. No hay mutaciones en este módulo.
 */

import { prisma } from "@/lib/db/prisma";
import type { Tenant } from "./types";

// ─── Mapper interno ────────────────────────────────────────────────────────────

/**
 * Convierte un registro RuntimeTenant (+ Gym opcional) al contrato Tenant.
 *
 * El status "deleted" del enum Prisma no existe en Tenant;
 * se normaliza a "inactive" para no exponer semántica interna de borrado.
 */
function runtimeTenantToTenant(tenant: {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  gym: { logo_url: string | null } | null;
}): Tenant {
  const statusMap: Record<string, Tenant["status"]> = {
    active: "active",
    inactive: "inactive",
    suspended: "suspended",
    deleted: "inactive", // normalizado — "deleted" no existe en el contrato Tenant
  };

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    logo_url: tenant.gym?.logo_url ?? null,
    status: statusMap[tenant.status] ?? "inactive",
    created_at: tenant.created_at,
    updated_at: tenant.updated_at,
  };
}

/** Campos RuntimeTenant necesarios para el mapeo — evita over-fetching. */
const TENANT_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  created_at: true,
  updated_at: true,
  gym: { select: { logo_url: true } },
} as const;

// ─── Queries públicas ──────────────────────────────────────────────────────────

/**
 * Retorna un tenant por su ID o null si no existe.
 * Fuente: prisma.runtimeTenant.
 */
export async function getTenantById(id: string): Promise<Tenant | null> {
  const tenant = await prisma.runtimeTenant.findUnique({
    where: { id },
    select: TENANT_SELECT,
  });
  return tenant ? runtimeTenantToTenant(tenant) : null;
}

/**
 * Retorna un tenant por su slug único o null si no existe.
 * Útil para routing por subdominio o path en futuras integraciones multi-tenant.
 */
export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const tenant = await prisma.runtimeTenant.findUnique({
    where: { slug },
    select: TENANT_SELECT,
  });
  return tenant ? runtimeTenantToTenant(tenant) : null;
}

/**
 * Lista todos los tenants activos de la plataforma.
 * Solo relevante para un futuro super-admin de plataforma (no de tenant).
 * Fuente: prisma.runtimeTenant.
 */
export async function listActiveTenants(): Promise<Tenant[]> {
  const tenants = await prisma.runtimeTenant.findMany({
    where: { status: "active" },
    select: TENANT_SELECT,
    orderBy: { name: "asc" },
  });
  return tenants.map(runtimeTenantToTenant);
}

/**
 * Verifica si un tenant existe y está activo.
 * Útil como guard de validación en acciones de módulos nuevos.
 */
export async function isTenantActive(id: string): Promise<boolean> {
  const tenant = await getTenantById(id);
  return tenant?.status === "active";
}
