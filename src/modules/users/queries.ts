import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/permissions/guards";

/**
 * Lista de usuarios de staff filtrada por permisos.
 * Excluye usuarios con rol `client`: se gestionan desde el módulo de Clientes.
 */
export async function getAdminUsers(user: SessionUser) {
  const include = {
    branch: { select: { name: true } },
    trainer_profile: { select: { id: true } },
    // operational_code y qr_token se incluyen automáticamente por el select por defecto
  };

  if (user.role === "super_admin") {
    return prisma.user.findMany({
      where: {
        gym_id: user.gym_id,
        status: { not: "deleted" },
        role: { not: "client" },
      },
      include,
      orderBy: { created_at: "desc" },
    });
  }

  if (user.role === "branch_admin" && user.branch_id) {
    // branch_admin solo ve reception y trainer de su sucursal
    return prisma.user.findMany({
      where: {
        gym_id: user.gym_id,
        branch_id: user.branch_id,
        status: { not: "deleted" },
        role: { in: ["reception", "trainer"] },
      },
      include,
      orderBy: { created_at: "desc" },
    });
  }

  return [];
}

/** Obtiene un usuario por id, validando pertenencia al gym */
export async function getUserById(id: string, user: SessionUser) {
  return prisma.user.findFirst({
    where: { id, gym_id: user.gym_id },
    include: {
      trainer_profile: { select: { id: true } },
      branch: { select: { name: true } },
    },
  });
}
