/**
 * Mutaciones del dominio User core.
 *
 * Funciones async puras — NO son Server Actions.
 * No leen sesión, no redirigen, no revalidan rutas.
 * No crean ni sincronizan perfiles GYM (Trainer, Client).
 *
 * El caller (wrapper GYM u otro módulo) es responsable de:
 *   - autenticar al usuario y extraer tenantId / callerId
 *   - generar operational_code y qr_token antes de llamar a createCoreUser
 *   - sincronizar prisma.trainer tras updateCoreUser (usando previousRole / newRole)
 *   - llamar redirect() / revalidatePath() tras el resultado
 *   - aplicar restricciones de roles específicas de la industria
 *
 * Fuente de datos: tabla `users` (campo `gym_id` mapea a tenantId en este período).
 * Relación de campos en Prisma actual:
 *   User.gym_id    ←→  tenantId (parámetro)
 *   User.branch_id ←→  input.location_id
 */

import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { updateCoreUserSchema } from "./schemas";

// ─── Contratos de retorno ──────────────────────────────────────────────────────

export type UserActionResult =
  | { success: true; id: string }
  | { success: false; errors?: Record<string, string[]>; error?: string };

/** updateCoreUser incluye los roles para que el wrapper GYM decida el sync de Trainer */
export type UpdateCoreUserResult =
  | { success: true; id: string; previousRole: string; newRole: string }
  | { success: false; errors?: Record<string, string[]>; error?: string };

// ─── Input de creación ─────────────────────────────────────────────────────────

/**
 * El caller pre-genera operational_code y qr_token antes de llamar al core.
 * El core los escribe en BD sin conocer su semántica.
 * Si una industria futura no los usa, pueden omitirse (la BD los almacenará como null).
 */
export type CreateCoreUserInput = {
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  location_id?: string | null;
  password: string;
  operational_code?: string | null;
  qr_token?: string | null;
};

// ─── Crear usuario ─────────────────────────────────────────────────────────────

/**
 * Crea un nuevo usuario dentro del tenant indicado.
 * La validación de roles permitidos ocurre en el caller (wrapper GYM).
 */
export async function createCoreUser(
  tenantId: string,
  input: CreateCoreUserInput
): Promise<UserActionResult> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    return { success: false, errors: { email: ["Este correo ya está registrado."] } };
  }

  const password_hash = await bcrypt.hash(input.password, 10);

  const newUser = await prisma.user.create({
    data: {
      gym_id: tenantId,
      branch_id: input.location_id ?? null,
      email: input.email,
      password_hash,
      first_name: input.first_name,
      last_name: input.last_name,
      role: input.role as UserRole,
      status: "active",
      operational_code: input.operational_code ?? null,
      qr_token: input.qr_token ?? null,
    },
    select: { id: true },
  });

  return { success: true, id: newUser.id };
}

// ─── Actualizar usuario ────────────────────────────────────────────────────────

/**
 * Actualiza los campos editables de un usuario.
 * Verifica ownership por tenantId antes de escribir.
 * Retorna previousRole y newRole para que el wrapper GYM sincronice Trainer si aplica.
 */
export async function updateCoreUser(
  userId: string,
  tenantId: string,
  input: unknown
): Promise<UpdateCoreUserResult> {
  const parsed = updateCoreUserSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, gym_id: tenantId },
    select: { id: true, role: true, email: true },
  });
  if (!target) {
    return { success: false, error: "Usuario no encontrado." };
  }

  // Email único excluyendo el usuario actual
  if (parsed.data.email) {
    const duplicate = await prisma.user.findFirst({
      where: { email: parsed.data.email, id: { not: userId } },
      select: { id: true },
    });
    if (duplicate) {
      return { success: false, errors: { email: ["Este correo ya está registrado."] } };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};
  if (parsed.data.email) updateData.email = parsed.data.email;
  if (parsed.data.first_name) updateData.first_name = parsed.data.first_name;
  if (parsed.data.last_name) updateData.last_name = parsed.data.last_name;
  if (parsed.data.role) updateData.role = parsed.data.role;
  if ("location_id" in parsed.data) updateData.branch_id = parsed.data.location_id ?? null;
  if (parsed.data.password && parsed.data.password.length >= 8) {
    updateData.password_hash = await bcrypt.hash(parsed.data.password, 10);
  }

  await prisma.user.update({ where: { id: userId }, data: updateData });

  return {
    success: true,
    id: userId,
    previousRole: target.role as string,
    newRole: (parsed.data.role ?? target.role) as string,
  };
}

// ─── Cambiar estado de usuario ─────────────────────────────────────────────────

/**
 * Alterna el estado active/inactive de un usuario.
 * callerId se usa para impedir auto-desactivación — el caller lo provee desde la sesión.
 */
export async function toggleCoreUserStatus(
  userId: string,
  callerId: string,
  tenantId: string
): Promise<UserActionResult> {
  if (userId === callerId) {
    return { success: false, error: "No puedes desactivar tu propia cuenta." };
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, gym_id: tenantId },
    select: { id: true, status: true },
  });
  if (!user) {
    return { success: false, error: "Usuario no encontrado." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { status: user.status === "active" ? "inactive" : "active" },
  });

  return { success: true, id: userId };
}
