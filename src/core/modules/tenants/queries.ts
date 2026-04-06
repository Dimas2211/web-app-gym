/**
 * Queries de lectura del dominio Tenant.
 *
 * FUENTE TEMPORAL: tabla `gyms` del schema actual.
 * Cuando se complete la Fase 3 del roadmap (tabla `tenants` en Prisma),
 * solo cambia la fuente aquí — los consumidores de estas funciones no cambian.
 *
 * MODO: read-only. No hay mutaciones en este módulo.
 */

import { prisma } from "@/lib/db/prisma";
import type { Tenant } from "./types";

// ─── Mapper interno ────────────────────────────────────────────────────────────

/**
 * Convierte un registro Gym al contrato Tenant.
 *
 * Campos incluidos en Tenant:  id, name, slug, logo_url, status, timestamps.
 * Campos GYM-específicos omitidos: address, phone, email, website.
 * (Esos campos irán a GymProfile en Fase 3.)
 *
 * El status "deleted" del enum Prisma no existe en Tenant;
 * se normaliza a "inactive" para no exponer semántica interna de borrado.
 */
function gymToTenant(gym: {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}): Tenant {
  const statusMap: Record<string, Tenant["status"]> = {
    active: "active",
    inactive: "inactive",
    suspended: "suspended",
    deleted: "inactive", // normalizado — "deleted" no existe en el contrato Tenant
  };

  return {
    id: gym.id,
    name: gym.name,
    slug: gym.slug,
    logo_url: gym.logo_url,
    status: statusMap[gym.status] ?? "inactive",
    created_at: gym.created_at,
    updated_at: gym.updated_at,
  };
}

/** Campos Gym necesarios para el mapeo — evita over-fetching. */
const TENANT_SELECT = {
  id: true,
  name: true,
  slug: true,
  logo_url: true,
  status: true,
  created_at: true,
  updated_at: true,
} as const;

// ─── Queries públicas ──────────────────────────────────────────────────────────

/**
 * Retorna un tenant por su ID o null si no existe.
 * Fuente temporal: prisma.gym.
 */
export async function getTenantById(id: string): Promise<Tenant | null> {
  const gym = await prisma.gym.findUnique({
    where: { id },
    select: TENANT_SELECT,
  });
  return gym ? gymToTenant(gym) : null;
}

/**
 * Retorna un tenant por su slug único o null si no existe.
 * Útil para routing por subdominio o path en futuras integraciones multi-tenant.
 */
export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const gym = await prisma.gym.findUnique({
    where: { slug },
    select: TENANT_SELECT,
  });
  return gym ? gymToTenant(gym) : null;
}

/**
 * Lista todos los tenants activos de la plataforma.
 * Solo relevante para un futuro super-admin de plataforma (no de tenant).
 * Fuente temporal: prisma.gym.
 */
export async function listActiveTenants(): Promise<Tenant[]> {
  const gyms = await prisma.gym.findMany({
    where: { status: "active" },
    select: TENANT_SELECT,
    orderBy: { name: "asc" },
  });
  return gyms.map(gymToTenant);
}

/**
 * Verifica si un tenant existe y está activo.
 * Útil como guard de validación en acciones de módulos nuevos.
 */
export async function isTenantActive(id: string): Promise<boolean> {
  const tenant = await getTenantById(id);
  return tenant?.status === "active";
}
