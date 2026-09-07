import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import type { SessionUser } from "@/lib/permissions/guards";

// PASO 6C — `client` opcional para permitir uso runtime-aware (páginas
// GYM operando bajo "Operar como cliente" via resolveEffectiveTenantContext).
// En modo normal se usa el singleton `prisma`, sin cambios de comportamiento.

/** Lista de sucursales filtrada por permisos del usuario */
export async function getBranches(user: SessionUser, client: PrismaClient = prisma) {
  if (user.role === "super_admin") {
    return client.branch.findMany({
      where: { tenant_id: user.tenant_id },
      include: { _count: { select: { users: true } } },
      orderBy: { created_at: "desc" },
    });
  }

  if (user.role === "branch_admin" && user.location_id) {
    return client.branch.findMany({
      where: { tenant_id: user.tenant_id, id: user.location_id },
      include: { _count: { select: { users: true } } },
    });
  }

  return [];
}

/** Obtiene una sucursal por id, validando que pertenece al gym del usuario */
export async function getBranchById(id: string, user: SessionUser, client: PrismaClient = prisma) {
  return client.branch.findFirst({
    where: { id, tenant_id: user.tenant_id },
  });
}

/** Lista simple de sucursales (id + name) para selects */
export async function getBranchOptions(user: SessionUser, client: PrismaClient = prisma) {
  if (user.role === "super_admin") {
    return client.branch.findMany({
      where: { tenant_id: user.tenant_id, status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  if (user.location_id) {
    return client.branch.findMany({
      where: { tenant_id: user.tenant_id, id: user.location_id, status: "active" },
      select: { id: true, name: true },
    });
  }

  return [];
}
