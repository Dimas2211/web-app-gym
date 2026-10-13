/**
 * core/storage — avatar-lifecycle.ts
 *
 * Ciclo de vida de un avatar privado versionado, compartido por Client y
 * User. La AUTORIZACIÓN ocurre antes, en el servicio del módulo dueño; este
 * helper recibe tenantId/entityId ya autorizados y la imagen ya procesada.
 *
 * Reemplazo (atomicidad lógica):
 *   1. version = UUID del servidor
 *   2. subir NUEVO objeto inmutable  tenants/{t}/{entity}/{id}/avatars/{version}.webp
 *   3. persistir avatar_url = /api/avatars/{entity}/{id}?v={version}
 *   4. DB falla  → borrar SOLO el objeto nuevo; el anterior y el avatar_url
 *                  anterior quedan intactos; se devuelve error
 *   5. DB ok     → versión nueva activa; se intenta borrar el objeto anterior
 *                  (solo si era un avatar privado gestionado aquí). Si ese
 *                  cleanup falla NO se revierte: queda un objeto huérfano
 *                  inaccesible (el GET solo sirve la versión activa) y se
 *                  registra un log sanitizado.
 *
 * Lectura: la versión activa sale SIEMPRE del avatar_url persistido. La
 * versión que envíe el navegador (?v=) se ignora — no permite recuperar
 * versiones históricas ni construir keys arbitrarios.
 *   - avatar_url ausente/legacy/inválido → notFound, sin tocar Storage
 *   - versión activa válida + Storage falla → 502 genérico (NO 404: la DB
 *     afirma que existe; no poder descargarla es una falla operacional)
 *   - Storage sin configurar → 503
 */
if (typeof window !== "undefined") {
  throw new Error("[avatar-lifecycle] Módulo server-only. No usar en contexto de navegador.");
}

import { getAvatarStorage, AvatarStorageNotConfiguredError } from "./avatar-storage";
import type { AvatarStorageAdapter } from "./storage-types";
import {
  avatarObjectKey,
  avatarInternalUrl,
  newAvatarVersion,
  parseInternalAvatarVersion,
  type AvatarEntity,
} from "./avatar-keys";

export type AvatarUploadResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string };

export type AvatarReadResult =
  | { ok: true; body: Buffer; contentType: string }
  | { ok: false; status: number; error: string };

const STORAGE_READ_FAILED = { ok: false as const, status: 502, error: "No se pudo cargar la imagen." };

const STORAGE_UNAVAILABLE = {
  ok: false as const,
  status: 503,
  error: "Almacenamiento de avatares no configurado.",
};

type StorageResolution =
  | { ok: true; storage: AvatarStorageAdapter }
  | { ok: false; status: number; error: string };

function resolveStorage(): StorageResolution {
  try {
    return { ok: true, storage: getAvatarStorage() };
  } catch (err) {
    if (err instanceof AvatarStorageNotConfiguredError) return STORAGE_UNAVAILABLE;
    throw err;
  }
}

export interface ReplaceAvatarInput {
  entity: AvatarEntity;
  /** Tenant EFECTIVO ya autorizado (context.tenantId). */
  tenantId: string;
  /** Entidad ya autorizada. */
  entityId: string;
  /** avatar_url persistido ANTES del cambio. */
  previousAvatarUrl: string | null;
  image: { body: Buffer; contentType: string };
  /** Persiste el nuevo avatar_url en la DB efectiva. Debe lanzar si falla. */
  persist: (avatarUrl: string) => Promise<unknown>;
  /** Mensaje de usuario si la DB falla. */
  persistErrorMessage: string;
}

export async function replaceAvatar(input: ReplaceAvatarInput): Promise<AvatarUploadResult> {
  const resolved = resolveStorage();
  if (!resolved.ok) return resolved;
  const { storage } = resolved;

  const version = newAvatarVersion();
  const newKey = avatarObjectKey(input.entity, input.tenantId, input.entityId, version);

  try {
    await storage.put(newKey, input.image.body, input.image.contentType);
  } catch {
    return { ok: false, status: 502, error: "No se pudo guardar la imagen. Intenta nuevamente." };
  }

  const url = avatarInternalUrl(input.entity, input.entityId, version);
  try {
    await input.persist(url);
  } catch {
    // Compensación: solo el objeto NUEVO. El anterior sigue referenciado.
    await storage.remove(newKey).catch(() => {
      console.error(`[avatar] compensación fallida: versión nueva huérfana (${input.entity})`);
    });
    console.error(`[avatar] no se pudo persistir avatar_url (${input.entity})`);
    return { ok: false, status: 500, error: input.persistErrorMessage };
  }

  const previousVersion = parseInternalAvatarVersion(
    input.entity,
    input.entityId,
    input.previousAvatarUrl,
  );
  if (previousVersion && previousVersion !== version) {
    const previousKey = avatarObjectKey(input.entity, input.tenantId, input.entityId, previousVersion);
    await storage.remove(previousKey).catch(() => {
      // No se revierte un cambio ya confirmado; la versión anterior queda
      // huérfana e inaccesible (el GET solo sirve la versión activa).
      console.error(`[avatar] limpieza de versión anterior fallida (${input.entity})`);
    });
  }

  return { ok: true, url };
}

export interface ReadActiveAvatarInput {
  entity: AvatarEntity;
  tenantId: string;
  entityId: string;
  /** avatar_url persistido de la entidad ya autorizada — única fuente de la versión. */
  avatarUrl: string | null;
  notFound: { ok: false; status: number; error: string };
}

export async function readActiveAvatar(input: ReadActiveAvatarInput): Promise<AvatarReadResult> {
  const version = parseInternalAvatarVersion(input.entity, input.entityId, input.avatarUrl);
  if (!version) return input.notFound;

  const resolved = resolveStorage();
  if (!resolved.ok) return resolved;

  try {
    const object = await resolved.storage.get(
      avatarObjectKey(input.entity, input.tenantId, input.entityId, version),
    );
    return { ok: true, body: object.body, contentType: object.contentType };
  } catch {
    // Nunca se propaga message/stack del adapter/proveedor.
    return STORAGE_READ_FAILED;
  }
}
