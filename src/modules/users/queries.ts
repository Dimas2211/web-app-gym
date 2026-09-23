import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import type { SessionUser } from "@/lib/permissions/guards";

// PASO 6E — `client` opcional en toda query exportada: en modo normal usa
// el singleton `prisma` (sin cambios); en páginas runtime-aware ("Operar
// como cliente") el caller pasa `context.client` junto con un `user` cuyo
// tenant_id ya es el tenant EFECTIVO.

/**
 * Lista de usuarios de staff filtrada por permisos.
 * Excluye usuarios con rol `client`: se gestionan desde el módulo de Clientes.
 */
export async function getAdminUsers(user: SessionUser, client: PrismaClient = prisma) {
  const include = {
    branch: { select: { name: true } },
    trainer_profile: { select: { id: true } },
    // operational_code y qr_token se incluyen automáticamente por el select por defecto
  };

  if (user.role === "super_admin") {
    return client.user.findMany({
      where: {
        tenant_id: user.tenant_id,
        status: { not: "deleted" },
        role: { not: "client" },
      },
      include,
      orderBy: { created_at: "desc" },
    });
  }

  if (user.role === "branch_admin" && user.location_id) {
    // branch_admin solo ve reception y trainer de su sucursal
    return client.user.findMany({
      where: {
        tenant_id: user.tenant_id,
        branch_id: user.location_id,
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
export async function getUserById(id: string, user: SessionUser, client: PrismaClient = prisma) {
  return client.user.findFirst({
    where: { id, tenant_id: user.tenant_id },
    include: {
      trainer_profile: { select: { id: true } },
      branch: { select: { name: true } },
    },
  });
}
