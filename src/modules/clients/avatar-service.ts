/**
 * clients — avatar-service.ts (GYM)
 *
 * Subida y lectura del avatar de un Client. Una sola operación autorizada
 * controla upload + persistencia: el navegador solo envía el archivo; el
 * tenant, el object key, el bucket y el avatar_url final los decide el
 * servidor.
 *
 * Upload:
 *   1. gate inicial por rol de sesión (canManageMembers = requireClientManager)
 *   2. requireOperationalContext({ write: true }) — Support Session bloqueada
 *      ANTES de leer/escribir nada
 *   3. Client por id + context.tenantId en context.client (DB efectiva)
 *   4. canManageClient con identidad efectiva (rol LIVE en RUNTIME_CLIENT)
 *   5. validar + normalizar imagen (sharp → WebP 512x512 sin EXIF)
 *   6. replaceAvatar (core/storage/avatar-lifecycle): objeto NUEVO versionado
 *      tenants/{tenantId}/clients/{clientId}/avatars/{uuid}.webp →
 *      Client.avatar_url = /api/avatars/clients/{id}?v={uuid}; si la DB falla
 *      se borra solo el nuevo; si va bien se limpia el anterior.
 *
 * Read (versión activa = la de Client.avatar_url, nunca la del request):
 *   - role=client: solo su propio Client (Client.user_id === session id)
 *   - staff: canManageClient con identidad efectiva
 *   - cualquier otro caso → 404 (no se revela existencia)
 */
if (typeof window !== "undefined") {
  throw new Error("[clients/avatar-service] Módulo server-only.");
}

import { revalidatePath } from "next/cache";
import type { UserRole } from "@prisma/client";
import { canManageClient, type SessionUser } from "@/lib/permissions/guards";
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

export type { AvatarUploadResult, AvatarReadResult };

const NOT_FOUND = { ok: false as const, status: 404, error: "Cliente no encontrado." };

export async function uploadClientAvatar(
  sessionUser: SessionUser,
  clientId: string,
  file: unknown,
): Promise<AvatarUploadResult> {
  if (!getCapabilities(sessionUser.role).canManageMembers) {
    return { ok: false, status: 403, error: "Sin permiso para modificar clientes." };
  }

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return { ok: false, status: err.httpStatus, error: err.userMessage };
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const client = await context.client.client.findFirst({
      where: { id: clientId, tenant_id: context.tenantId },
      select: { id: true, branch_id: true, avatar_url: true },
    });
    if (!client) return NOT_FOUND;

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    } as SessionUser;
    if (!canManageClient(effectiveSessionUser, client)) {
      return { ok: false, status: 403, error: "Sin permiso para modificar este cliente." };
    }

    if (!(file instanceof File)) {
      return { ok: false, status: 400, error: "No se recibió ningún archivo." };
    }

    const image = await processAvatarImage(file);
    if (!image.ok) return { ok: false, status: image.status, error: image.error };

    const result = await replaceAvatar({
      entity: "clients",
      tenantId: context.tenantId,
      entityId: client.id,
      previousAvatarUrl: client.avatar_url,
      image,
      persist: (avatarUrl) =>
        context.client.client.update({ where: { id: client.id }, data: { avatar_url: avatarUrl } }),
      persistErrorMessage: "No se pudo guardar la foto del cliente.",
    });
    if (!result.ok) return result;

    revalidatePath(`/dashboard/clients/${client.id}`);
    revalidatePath(`/dashboard/clients/${client.id}/credential`);
    revalidatePath("/portal/credencial");
    return result;
  } finally {
    await dispose();
  }
}

export async function readClientAvatar(
  sessionUser: SessionUser,
  clientId: string,
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
    const client = await context.client.client.findFirst({
      where: { id: clientId, tenant_id: context.tenantId },
      select: { id: true, branch_id: true, user_id: true, avatar_url: true },
    });
    if (!client) return NOT_FOUND;

    const role = context.effectiveUser.role as UserRole;
    const allowed =
      role === "client"
        ? client.user_id !== null && client.user_id === sessionUser.id
        : canManageClient({ ...context.effectiveUser, role } as SessionUser, client);
    if (!allowed) return NOT_FOUND;

    return readActiveAvatar({
      entity: "clients",
      tenantId: context.tenantId,
      entityId: client.id,
      avatarUrl: client.avatar_url,
      notFound: NOT_FOUND,
    });
  } finally {
    await dispose();
  }
}
