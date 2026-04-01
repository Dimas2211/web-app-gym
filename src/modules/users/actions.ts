"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import {
  requireAdmin,
  canManageUser,
  getSessionOrRedirect,
} from "@/lib/permissions/guards";
import {
  checkDeleteAuth,
  type DeleteAuthActionState,
} from "@/lib/permissions/delete-authorization";
import { createUserSchema, updateUserSchema } from "./schemas";
import { BRANCH_ADMIN_ASSIGNABLE_ROLES } from "@/lib/utils/roles";
import { suggestNextStaffCode, generateQrToken } from "@/lib/utils/operational-codes";

export type UserActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

// ──────────────────────────────────────────────
// Crear usuario
// ──────────────────────────────────────────────
export async function createUserAction(
  _prev: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const sessionUser = await requireAdmin();

  const raw = {
    email: formData.get("email"),
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    role: formData.get("role"),
    branch_id: formData.get("branch_id") || null,
    password: formData.get("password"),
  };

  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  // branch_admin solo puede crear ciertos roles en su propia sucursal
  if (sessionUser.role === "branch_admin") {
    if (!BRANCH_ADMIN_ASSIGNABLE_ROLES.includes(parsed.data.role)) {
      return { error: "No tienes permiso para crear usuarios con ese rol." };
    }
    if (parsed.data.branch_id !== sessionUser.branch_id) {
      return { error: "Solo puedes crear usuarios en tu propia sucursal." };
    }
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return { errors: { email: ["Este correo ya está registrado."] } };
  }

  const password_hash = await bcrypt.hash(parsed.data.password, 10);

  // Generar código operativo y token QR para el nuevo usuario
  const operational_code = await suggestNextStaffCode(sessionUser.gym_id);
  const qr_token = generateQrToken();

  const newUser = await prisma.user.create({
    data: {
      gym_id: sessionUser.gym_id,
      branch_id: parsed.data.branch_id ?? null,
      email: parsed.data.email,
      password_hash,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      role: parsed.data.role,
      status: "active",
      operational_code,
      qr_token,
    },
  });

  // Al crear un usuario con rol trainer, crear su perfil operativo automáticamente
  if (parsed.data.role === "trainer" && parsed.data.branch_id) {
    await prisma.trainer.create({
      data: {
        gym_id: sessionUser.gym_id,
        branch_id: parsed.data.branch_id,
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
        user_id: newUser.id,
        status: "active",
      },
    });
    revalidatePath("/dashboard/trainers");
  }

  revalidatePath("/dashboard/users");
  redirect("/dashboard/users");
}

// ──────────────────────────────────────────────
// Editar usuario
// ──────────────────────────────────────────────
export async function updateUserAction(
  _prev: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const sessionUser = await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return { error: "ID de usuario requerido." };

  const target = await prisma.user.findUnique({
    where: { id },
    include: { trainer_profile: { select: { id: true } } },
  });
  if (!target) return { error: "Usuario no encontrado." };

  if (!canManageUser(sessionUser, target)) {
    return { error: "Sin permiso para editar este usuario." };
  }

  const raw = {
    email: formData.get("email"),
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    role: formData.get("role"),
    branch_id: formData.get("branch_id") || null,
    password: formData.get("password") || "",
  };

  const parsed = updateUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  // Email único excluyendo el usuario actual
  const duplicate = await prisma.user.findFirst({
    where: { email: parsed.data.email, id: { not: id } },
  });
  if (duplicate) {
    return { errors: { email: ["Este correo ya está registrado."] } };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {
    email: parsed.data.email,
    first_name: parsed.data.first_name,
    last_name: parsed.data.last_name,
    role: parsed.data.role,
    branch_id: parsed.data.branch_id ?? null,
  };

  if (parsed.data.password && parsed.data.password.length >= 8) {
    updateData.password_hash = await bcrypt.hash(parsed.data.password, 10);
  }

  await prisma.user.update({ where: { id }, data: updateData });

  // Sincronizar perfil Trainer según cambio de rol
  const previousRole = target.role;
  const newRole = parsed.data.role;

  if (previousRole !== "trainer" && newRole === "trainer") {
    // Rol cambió A trainer → crear perfil si no existe
    if (!target.trainer_profile && parsed.data.branch_id) {
      await prisma.trainer.create({
        data: {
          gym_id: target.gym_id,
          branch_id: parsed.data.branch_id,
          first_name: parsed.data.first_name,
          last_name: parsed.data.last_name,
          user_id: id,
          status: "active",
        },
      });
    }
    revalidatePath("/dashboard/trainers");
  } else if (previousRole === "trainer" && newRole !== "trainer") {
    // Rol cambió DESDE trainer → desvincular perfil (sin borrar datos operativos)
    if (target.trainer_profile) {
      await prisma.trainer.update({
        where: { id: target.trainer_profile.id },
        data: { user_id: null },
      });
    }
    revalidatePath("/dashboard/trainers");
  }

  revalidatePath("/dashboard/users");
  redirect("/dashboard/users");
}

// ──────────────────────────────────────────────
// Eliminación definitiva con autorización
// ──────────────────────────────────────────────
export async function deleteUserAction(
  _prev: DeleteAuthActionState,
  formData: FormData
): Promise<DeleteAuthActionState> {
  const sessionUser = await getSessionOrRedirect();
  const id = formData.get("id") as string;
  if (!id) return { error: "Datos inválidos" };

  if (id === sessionUser.id) {
    return { error: "No puedes eliminar tu propia cuenta." };
  }

  const target = await prisma.user.findFirst({
    where: { id, gym_id: sessionUser.gym_id },
    include: {
      trainer_profile: { select: { id: true } },
      client_profile: { select: { id: true } },
    },
  });

  if (!target) return { error: "Usuario no encontrado." };
  if (!canManageUser(sessionUser, target)) {
    return { error: "Sin permisos para gestionar este usuario." };
  }

  // Bloqueos por dependencias
  if (target.trainer_profile) {
    return {
      error:
        "Este usuario tiene un perfil de entrenador vinculado. Elimina primero el perfil desde el módulo de Entrenadores.",
    };
  }
  if (target.client_profile) {
    return {
      error:
        "Este usuario tiene un portal de cliente vinculado. Deshabilita el portal desde la ficha del cliente antes de eliminar.",
    };
  }

  const auth = await checkDeleteAuth(formData, sessionUser);
  if (!auth.ok) return { error: auth.error };

  await prisma.user.delete({ where: { id } });
  revalidatePath("/dashboard/users");
  redirect("/dashboard/users");
}

// ──────────────────────────────────────────────
// Cambiar estado (sin borrado físico)
// ──────────────────────────────────────────────
export async function toggleUserStatusAction(formData: FormData): Promise<void> {
  const sessionUser = await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return;
  if (!canManageUser(sessionUser, target)) return;
  // No puede desactivarse a sí mismo
  if (id === sessionUser.id) return;

  await prisma.user.update({
    where: { id },
    data: { status: target.status === "active" ? "inactive" : "active" },
  });

  revalidatePath("/dashboard/users");
}
