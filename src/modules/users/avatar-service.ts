/**
 * users — avatar-service.ts
 *
 * Avatar de User (staff) sobre el mismo backend privado que Client.
 * Reemplaza el flujo legacy /api/upload + updateUserAvatarAction.
 *
 * Upload: mismo criterio que la gestión de identidad de staff existente —
 * gate canManageStaff (requireAdmin), módulo core.users, write=true y rol
 * LIVE super_admin; además ownership explícito por tenant efectivo (el
 * action legacy no lo verificaba).
 *
 * Read: el propio usuario, o quien pueda gestionarlo (canManageUser con
 * identidad efectiva). Cualquier otro caso → 404.
 *
 * Mismo ciclo versionado que Client (core/storage/avatar-lifecycle.ts):
 * tenants/{tenantId}/users/{userId}/avatars/{uuid}.webp.
 */
if (typeof window !== "undefined") {
  throw new Error("[users/avatar-service] Módulo server-only.");
}

import { revalidatePath } from "next/cache";
import type { UserRole } from "@prisma/client";
import { canManageUser, type SessionUser } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import {
  processAvatarImage,
  replaceAvatar,
  readActiveAvatar,
  type AvatarUploadResult,
  type AvatarReadResult,
} from "@/core/storage";

const NOT_FOUND = { ok: false as const, status: 404, error: "Usuario no encontrado." };

export async function uploadUserAvatar(
  sessionUser: SessionUser,
  userId: string,
  file: unknown,
): Promise<AvatarUploadResult> {
  if (!getCapabilities(sessionUser.role).canManageStaff) {
    return { ok: false, status: 403, error: "Sin permiso para modificar usuarios." };
  }

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "core.users", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return { ok: false, status: err.httpStatus, error: err.userMessage };
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (context.effectiveUser.role !== "super_admin") {
      return { ok: false, status: 403, error: "Solo el Super Admin puede editar la identidad operativa." };
    }

    const target = await context.client.user.findFirst({
      where: { id: userId, tenant_id: context.tenantId },
      select: { id: true, role: true, avatar_url: true },
    });
    if (!target || target.role === "client") return NOT_FOUND;

    if (!(file instanceof File)) {
      return { ok: false, status: 400, error: "No se recibió ningún archivo." };
    }

    const image = await processAvatarImage(file);
    if (!image.ok) return { ok: false, status: image.status, error: image.error };

    const result = await replaceAvatar({
      entity: "users",
      tenantId: context.tenantId,
      entityId: target.id,
      previousAvatarUrl: target.avatar_url,
      image,
      persist: (avatarUrl) =>
        context.client.user.update({ where: { id: target.id }, data: { avatar_url: avatarUrl } }),
      persistErrorMessage: "No se pudo guardar la foto del usuario.",
    });
    if (!result.ok) return result;

    revalidatePath(`/dashboard/users/${target.id}/edit`);
    revalidatePath(`/dashboard/users/${target.id}/credential`);
    revalidatePath("/dashboard/credential");
    return result;
  } finally {
    await dispose();
  }
}

export async function readUserAvatar(
  sessionUser: SessionUser,
  userId: string,
): Promise<AvatarReadResult> {
  let handle;
  try {
    handle = await requireOperationalContext(sessionUser);
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return { ok: false, status: err.httpStatus, error: err.userMessage };
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const target = await context.client.user.findFirst({
      where: { id: userId, tenant_id: context.tenantId },
      select: { id: true, role: true, branch_id: true, avatar_url: true },
    });
    if (!target) return NOT_FOUND;

    const isSelf = target.id === sessionUser.id;
    const effective = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    } as SessionUser;
    if (!isSelf && (effective.role === "client" || !canManageUser(effective, target))) {
      return NOT_FOUND;
    }

    return readActiveAvatar({
      entity: "users",
      tenantId: context.tenantId,
      entityId: target.id,
      avatarUrl: target.avatar_url,
      notFound: NOT_FOUND,
    });
  } finally {
    await dispose();
  }
}
