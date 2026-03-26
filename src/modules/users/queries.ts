import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/permissions/guards";

/** Lista de usuarios administrativos filtrada por permisos */
export async function getAdminUsers(user: SessionUser) {
  if (user.role === "super_admin") {
    return prisma.user.findMany({
      where: { gym_id: user.gym_id, status: { not: "deleted" } },
      include: { branch: { select: { name: true } } },
      orderBy: { created_at: "desc" },
    });
  }

  if (user.role === "branch_admin" && user.branch_id) {
    // branch_admin solo ve usuarios no-admin de su sucursal
    return prisma.user.findMany({
      where: {
        gym_id: user.gym_id,
        branch_id: user.branch_id,
        status: { not: "deleted" },
        role: { in: ["reception", "trainer", "client"] },
      },
      include: { branch: { select: { name: true } } },
      orderBy: { created_at: "desc" },
    });
  }

  return [];
}

/** Obtiene un usuario por id, validando pertenencia al gym */
export async function getUserById(id: string, user: SessionUser) {
  return prisma.user.findFirst({
    where: { id, gym_id: user.gym_id },
  });
}
