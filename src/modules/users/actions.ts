"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
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
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { CommercialEnforcementError } from "@/modules/platform/runtime/commercial-enforcement";

export type UserActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

// Construye un objeto compatible con SessionUser a partir de la identidad
// operacional efectiva (rol LIVE para RUNTIME_CLIENT) — usado en los
// checks de permiso GYM (canManageUser, restricción branch_admin) que
// esperan `{ role, location_id, tenant_id, ... }`.
function toGymSessionUser(effectiveUser: {
  id: string;
  tenant_id: string;
  location_id: string | null;
  role: string;
  auth_scope: "PLATFORM" | "RUNTIME_CLIENT" | undefined;
  organization_id?: string;
}) {
  return { ...effectiveUser, role: effectiveUser.role as UserRole };
}

// ──────────────────────────────────────────────
// Crear usuario
// ──────────────────────────────────────────────
export async function createUserAction(
  _prev: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  // requireAdmin(): gate de sesión/rol inicial sin cambios para PLATFORM.
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "core.users", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const gymUser = toGymSessionUser(context.effectiveUser);

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

    // Restricciones GYM: branch_admin solo puede crear ciertos roles en su
    // sucursal — evaluado con el ROL LIVE (context.effectiveUser.role),
    // nunca con el rol stale de requireAdmin()/JWT.
    if (gymUser.role === "branch_admin") {
      if (!BRANCH_ADMIN_ASSIGNABLE_ROLES.includes(parsed.data.role)) {
        return { error: "No tienes permiso para crear usuarios con ese rol." };
      }
      if (parsed.data.branch_id !== gymUser.location_id) {
        return { error: "Solo puedes crear usuarios en tu propia sucursal." };
      }
    }

    // Generar códigos operativos GYM antes de delegar al core — contra la
    // DB EFECTIVA (runtime propia para RUNTIME_CLIENT).
    const operational_code = await suggestNextStaffCode(context.tenantId, context.client);
    const qr_token = generateQrToken();

    const result = await createCoreUser(
      context.tenantId,
      {
        email: parsed.data.email,
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
        role: parsed.data.role,
        location_id: parsed.data.branch_id ?? null,
        password: parsed.data.password,
        operational_code,
        qr_token,
      },
      context.commercialContext!,
      context.client,
    );

    if (!result.success) return result;

    // Efecto secundario GYM: crear perfil Trainer si corresponde — SIEMPRE
    // contra context.client, nunca Prisma global.
    if (parsed.data.role === "trainer" && parsed.data.branch_id) {
      await context.client.trainer.create({
        data: {
          gym_id: context.tenantId,
          tenant_id: context.tenantId,
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
  } finally {
    await dispose();
  }

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

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "core.users", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const gymUser = toGymSessionUser(context.effectiveUser);

    const id = formData.get("id") as string;
    if (!id) return { error: "ID de usuario requerido." };

    // ETAPA W — ownership por tenant SIEMPRE en el WHERE (nunca findUnique(id)
    // seguido de mutación sin validar pertenencia).
    const target = await context.client.user.findFirst({
      where: { id, gym_id: context.tenantId },
      include: { trainer_profile: { select: { id: true } } },
    });
    if (!target) return { error: "Usuario no encontrado." };
    if (!canManageUser(gymUser, target)) {
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

    // FASE VI-D4 — ETAPA H: la misma restricción de creación aplica a
    // edición. Sin este check, un branch_admin podía escalar el rol de un
    // usuario que sí puede gestionar (ej. reception) a super_admin/branch_admin
    // vía el formulario de edición — createUserAction ya lo bloqueaba,
    // updateUserAction no. Cerrado aquí, con la misma fuente de política
    // (BRANCH_ADMIN_ASSIGNABLE_ROLES), sin inventar reglas nuevas.
    if (gymUser.role === "branch_admin") {
      if (!BRANCH_ADMIN_ASSIGNABLE_ROLES.includes(gymParsed.data.role)) {
        return { error: "No tienes permiso para asignar ese rol." };
      }
      if (gymParsed.data.branch_id !== gymUser.location_id) {
        return { error: "Solo puedes asignar usuarios a tu propia sucursal." };
      }
    }

    // Delegar mutación al core (mapea branch_id → location_id)
    const result = await updateCoreUser(id, context.tenantId, {
      email: gymParsed.data.email,
      first_name: gymParsed.data.first_name,
      last_name: gymParsed.data.last_name,
      role: gymParsed.data.role,
      location_id: gymParsed.data.branch_id ?? null,
      password: gymParsed.data.password || "",
    }, context.client);

    if (!result.success) return result;

    // Efecto secundario GYM: sincronizar perfil Trainer según cambio de rol
    const { previousRole, newRole } = result;

    if (previousRole !== "trainer" && newRole === "trainer") {
      if (target.trainer_profile) {
        // Trainer previo encontrado (user_id fue preservado) — reactivar en lugar de duplicar
        await context.client.trainer.update({
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
        await context.client.trainer.create({
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
        await context.client.trainer.update({
          where: { id: target.trainer_profile.id },
          data: { status: "inactive" },
        });
      }
      revalidatePath("/dashboard/trainers");
    }

    revalidatePath("/dashboard/users");
  } finally {
    await dispose();
  }

  redirect("/dashboard/users");
}

// ──────────────────────────────────────────────
// Eliminación definitiva con autorización (lógica GYM pura)
// ──────────────────────────────────────────────
export async function deleteUserAction(
  _prev: DeleteAuthActionState,
  formData: FormData
): Promise<DeleteAuthActionState> {
  const sessionUser = await getSessionOrRedirect();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "core.users", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const gymUser = toGymSessionUser(context.effectiveUser);

    const id = formData.get("id") as string;
    if (!id) return { error: "Datos inválidos" };

    if (id === context.effectiveUser.id) {
      return { error: "No puedes eliminar tu propia cuenta." };
    }

    const target = await context.client.user.findFirst({
      where: { id, tenant_id: context.tenantId },
      include: {
        trainer_profile: { select: { id: true } },
        client_profile: { select: { id: true } },
      },
    });

    if (!target) return { error: "Usuario no encontrado." };
    if (!canManageUser(gymUser, target)) {
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

    // Re-autenticación admin (si aplica según canDeleteDirectly) — SIEMPRE
    // contra la DB EFECTIVA, nunca Prisma global.
    const auth = await checkDeleteAuth(formData, gymUser, context.client);
    if (!auth.ok) return { error: auth.error };

    await context.client.user.delete({ where: { id } });
    revalidatePath("/dashboard/users");
  } finally {
    await dispose();
  }

  redirect("/dashboard/users");
}

// ──────────────────────────────────────────────
// Cambiar estado (sin borrado físico)
// ──────────────────────────────────────────────
// Retorna void (invocada vía <form action={...}> sin useActionState, no
// hay canal de error hoy) — un bloqueo de módulo/capacidad se comunica
// con redirect + query param, leído como banner en users/page.tsx.
export async function toggleUserStatusAction(formData: FormData): Promise<void> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "core.users", write: true });
  } catch {
    // Fail closed silencioso — este action retorna void (sin canal de
    // error); el estado no cambia.
    return;
  }
  const { context, dispose } = handle;

  try {
    const gymUser = toGymSessionUser(context.effectiveUser);

    const id = formData.get("id") as string;
    if (!id) return;

    // Verificación de permisos GYM (requiere leer el target) — ETAPA W:
    // ownership por tenant en el WHERE, no findUnique(id) sin scope.
    const target = await context.client.user.findFirst({ where: { id, gym_id: context.tenantId } });
    if (!target) return;
    if (!canManageUser(gymUser, target)) return;

    try {
      const result = await toggleCoreUserStatus(id, context.effectiveUser.id, context.tenantId, context.commercialContext!, context.client);
      if (!result.success) {
        revalidatePath("/dashboard/users");
        redirect("/dashboard/users?commercial_error=capacity_limit_reached");
      }
    } catch (err) {
      if (err instanceof CommercialEnforcementError) {
        revalidatePath("/dashboard/users");
        redirect("/dashboard/users?commercial_error=module_not_enabled");
      }
      throw err;
    }

    revalidatePath("/dashboard/users");
  } finally {
    await dispose();
  }
}
