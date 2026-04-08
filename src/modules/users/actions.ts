"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
import {
  createCoreUser,
  updateCoreUser,
  toggleCoreUserStatus,
} from "@/core/modules/users/actions";

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

  // Validación GYM: campos, tipos y contraseña requerida
  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  // Restricciones GYM: branch_admin solo puede crear ciertos roles en su sucursal
  if (sessionUser.role === "branch_admin") {
    if (!BRANCH_ADMIN_ASSIGNABLE_ROLES.includes(parsed.data.role)) {
      return { error: "No tienes permiso para crear usuarios con ese rol." };
    }
    if (parsed.data.branch_id !== sessionUser.location_id) {
      return { error: "Solo puedes crear usuarios en tu propia sucursal." };
    }
  }

  // Generar códigos operativos GYM antes de delegar al core
  const operational_code = await suggestNextStaffCode(sessionUser.tenant_id);
  const qr_token = generateQrToken();

  const result = await createCoreUser(sessionUser.tenant_id, {
    email: parsed.data.email,
    first_name: parsed.data.first_name,
    last_name: parsed.data.last_name,
    role: parsed.data.role,
    location_id: parsed.data.branch_id ?? null,
    password: parsed.data.password,
    operational_code,
    qr_token,
  });

  if (!result.success) return result;

  // Efecto secundario GYM: crear perfil Trainer si corresponde
  if (parsed.data.role === "trainer" && parsed.data.branch_id) {
    await prisma.trainer.create({
      data: {
        gym_id: sessionUser.tenant_id,
        tenant_id: sessionUser.tenant_id,
        branch_id: parsed.data.branch_id,
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
        user_id: result.id,
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

  // Leer target para verificación de permisos GYM y sync Trainer posterior
  const target = await prisma.user.findUnique({
    where: { id },
    include: { trainer_profile: { select: { id: true } } },
  });
  if (!target) return { error: "Usuario no encontrado." };
  if (!canManageUser(sessionUser, target)) {
    return { error: "Sin permiso para editar este usuario." };
  }

  // Validación GYM: verificar contraseña y campos con updateUserSchema
  const rawForValidation = {
    email: formData.get("email"),
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    role: formData.get("role"),
    branch_id: formData.get("branch_id") || null,
    password: formData.get("password") || "",
  };
  const gymParsed = updateUserSchema.safeParse(rawForValidation);
  if (!gymParsed.success) {
    return { errors: gymParsed.error.flatten().fieldErrors };
  }

  // Delegar mutación al core (mapea branch_id → location_id)
  const result = await updateCoreUser(id, sessionUser.tenant_id, {
    email: gymParsed.data.email,
    first_name: gymParsed.data.first_name,
    last_name: gymParsed.data.last_name,
    role: gymParsed.data.role,
    location_id: gymParsed.data.branch_id ?? null,
    password: gymParsed.data.password || "",
  });

  if (!result.success) return result;

  // Efecto secundario GYM: sincronizar perfil Trainer según cambio de rol
  const { previousRole, newRole } = result;

  if (previousRole !== "trainer" && newRole === "trainer") {
    if (target.trainer_profile) {
      // Trainer previo encontrado (user_id fue preservado) — reactivar en lugar de duplicar
      await prisma.trainer.update({
        where: { id: target.trainer_profile.id },
        data: {
          status: "active",
          tenant_id: target.tenant_id ?? undefined,
          branch_id: gymParsed.data.branch_id ?? undefined,
          first_name: gymParsed.data.first_name,
          last_name: gymParsed.data.last_name,
        },
      });
    } else if (gymParsed.data.branch_id) {
      // Primera vez que este usuario tiene rol trainer — crear perfil
      await prisma.trainer.create({
        data: {
          gym_id: target.gym_id,
          tenant_id: target.tenant_id ?? undefined,
          branch_id: gymParsed.data.branch_id,
          first_name: gymParsed.data.first_name,
          last_name: gymParsed.data.last_name,
          user_id: id,
          status: "active",
        },
      });
    }
    revalidatePath("/dashboard/trainers");
  } else if (previousRole === "trainer" && newRole !== "trainer") {
    if (target.trainer_profile) {
      // Marcar inactivo — user_id se preserva para posible reactivación futura sin duplicados
      await prisma.trainer.update({
        where: { id: target.trainer_profile.id },
        data: { status: "inactive" },
      });
    }
    revalidatePath("/dashboard/trainers");
  }

  revalidatePath("/dashboard/users");
  redirect("/dashboard/users");
}

// ──────────────────────────────────────────────
// Eliminación definitiva con autorización (sin cambios — lógica GYM pura)
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
    where: { id, tenant_id: sessionUser.tenant_id },
    include: {
      trainer_profile: { select: { id: true } },
      client_profile: { select: { id: true } },
    },
  });

  if (!target) return { error: "Usuario no encontrado." };
  if (!canManageUser(sessionUser, target)) {
    return { error: "Sin permisos para gestionar este usuario." };
  }

  // Bloqueos por dependencias GYM
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

  // Verificación de permisos GYM (requiere leer el target)
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return;
  if (!canManageUser(sessionUser, target)) return;

  // Delegar toggle y guard de auto-desactivación al core
  await toggleCoreUserStatus(id, sessionUser.id, sessionUser.tenant_id);

  revalidatePath("/dashboard/users");
}
