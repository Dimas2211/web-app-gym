import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/permissions/guards";

/** Lista de sucursales filtrada por permisos del usuario */
export async function getBranches(user: SessionUser) {
  if (user.role === "super_admin") {
    return prisma.branch.findMany({
      where: { gym_id: user.gym_id },
      include: { _count: { select: { users: true } } },
      orderBy: { created_at: "desc" },
    });
  }

  if (user.role === "branch_admin" && user.branch_id) {
    return prisma.branch.findMany({
      where: { gym_id: user.gym_id, id: user.branch_id },
      include: { _count: { select: { users: true } } },
    });
  }

  return [];
}

/** Obtiene una sucursal por id, validando que pertenece al gym del usuario */
export async function getBranchById(id: string, user: SessionUser) {
  return prisma.branch.findFirst({
    where: { id, gym_id: user.gym_id },
  });
}

/** Lista simple de sucursales (id + name) para selects */
export async function getBranchOptions(user: SessionUser) {
  if (user.role === "super_admin") {
    return prisma.branch.findMany({
      where: { gym_id: user.gym_id, status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  if (user.branch_id) {
    return prisma.branch.findMany({
      where: { gym_id: user.gym_id, id: user.branch_id, status: "active" },
      select: { id: true, name: true },
    });
  }

  return [];
}
