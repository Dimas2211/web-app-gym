import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import { canDeleteDirectly } from "@/lib/permissions/guards";
import type { UserRole } from "@prisma/client";

/**
 * Estado de retorno para server actions de eliminación definitiva.
 * Compatible con useActionState del diálogo reutilizable.
 */
export type DeleteAuthActionState = { error?: string } | undefined;

export type AdminDeleteCredentials = {
  email: string;
  password: string;
};

export type AdminDeleteAuthResult =
  | { authorized: true; authorized_by: string }
  | { authorized: false; error: string };

/**
 * Verifica credenciales de un administrador para autorizar una eliminación excepcional.
 *
 * Condiciones que debe cumplir el admin:
 * - Debe ser super_admin o branch_admin
 * - Debe estar activo
 * - Debe pertenecer al mismo gym que el usuario que solicita la autorización
 *
 * Se aplica timing-safe compare: si el usuario no existe, igualmente se corre
 * bcrypt.compare contra un hash dummy para evitar ataques de temporización.
 */
export async function verifyAdminDeleteCredentials(
  credentials: AdminDeleteCredentials,
  gymId: string
): Promise<AdminDeleteAuthResult> {
  if (!credentials.email?.trim() || !credentials.password) {
    return { authorized: false, error: "Credenciales requeridas" };
  }

  const admin = await prisma.user.findFirst({
    where: {
      email: credentials.email.toLowerCase().trim(),
      gym_id: gymId,
      role: { in: ["super_admin", "branch_admin"] },
      status: "active",
    },
    select: {
      id: true,
      password_hash: true,
      first_name: true,
      last_name: true,
    },
  });

  // Hash dummy: se usa cuando el usuario no existe para mantener tiempo constante
  // y evitar que el atacante pueda enumerar correos por diferencia de latencia.
  const DUMMY_HASH =
    "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWi";
  const hashToCompare = admin?.password_hash ?? DUMMY_HASH;

  const valid = await bcrypt.compare(credentials.password, hashToCompare);

  if (!admin || !valid) {
    return {
      authorized: false,
      error: "Credenciales administrativas inválidas",
    };
  }

  return {
    authorized: true,
    authorized_by: `${admin.first_name} ${admin.last_name}`.trim(),
  };
}

/**
 * Helper reutilizable que verifica la autorización de eliminación según el rol del usuario.
 *
 * - Si el usuario tiene permiso directo (super_admin / branch_admin):
 *   verifica que haya escrito la palabra "ELIMINAR" en el campo confirmation_word.
 * - Si no tiene permiso directo:
 *   verifica credenciales admin en admin_email + admin_password.
 *
 * @returns { ok: true } si autorizado, { ok: false; error: string } si no.
 */
export async function checkDeleteAuth(
  formData: FormData,
  sessionUser: { role: UserRole; gym_id: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (canDeleteDirectly(sessionUser.role)) {
    const word = (formData.get("confirmation_word") as string) ?? "";
    if (word !== "ELIMINAR") {
      return {
        ok: false,
        error: 'Confirmación incorrecta. Escribe "ELIMINAR" para continuar.',
      };
    }
  } else {
    const email = ((formData.get("admin_email") as string) ?? "").trim();
    const password = (formData.get("admin_password") as string) ?? "";
    if (!email || !password) {
      return {
        ok: false,
        error: "Se requieren credenciales administrativas para continuar",
      };
    }
    const result = await verifyAdminDeleteCredentials(
      { email, password },
      sessionUser.gym_id
    );
    if (!result.authorized) {
      return { ok: false, error: result.error };
    }
  }
  return { ok: true };
}
