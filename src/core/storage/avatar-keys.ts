/**
 * core/storage — avatar-keys.ts
 *
 * Object keys y URLs internas de avatares. Objetos VERSIONADOS e
 * inmutables, tenant-aware:
 *
 *   tenants/{tenantId}/clients/{clientId}/avatars/{version}.webp
 *   tenants/{tenantId}/users/{userId}/avatars/{version}.webp
 *
 * `version` = UUID generado por el servidor. El nombre de archivo original
 * NUNCA participa del key. Cada upload crea un objeto nuevo: si la DB falla
 * se borra solo el nuevo y el anterior queda intacto.
 *
 * avatar_url persistido = ruta interna autenticada con la versión ACTIVA:
 *
 *   /api/avatars/clients/{clientId}?v={uuid}
 *
 * La fuente de verdad de la versión activa es el avatar_url persistido
 * (server-side). El GET nunca usa la versión que envía el navegador.
 */

export type AvatarEntity = "clients" | "users";

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const VERSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function assertSafeId(value: string, label: string): void {
  if (!SAFE_ID.test(value)) throw new Error(`Identificador inválido para ${label}.`);
}

export function newAvatarVersion(): string {
  return crypto.randomUUID();
}

export function avatarObjectKey(
  entity: AvatarEntity,
  tenantId: string,
  entityId: string,
  version: string,
): string {
  assertSafeId(tenantId, "tenant");
  assertSafeId(entityId, entity);
  if (!VERSION.test(version)) throw new Error("Versión de avatar inválida.");
  return `tenants/${tenantId}/${entity}/${entityId}/avatars/${version}.webp`;
}

export function avatarInternalPath(entity: AvatarEntity, entityId: string): string {
  return `/api/avatars/${entity}/${entityId}`;
}

export function avatarInternalUrl(entity: AvatarEntity, entityId: string, version: string): string {
  if (!VERSION.test(version)) throw new Error("Versión de avatar inválida.");
  return `${avatarInternalPath(entity, entityId)}?v=${version}`;
}

/**
 * Extrae la versión ACTIVA de un avatar_url persistido. null si no es un
 * avatar privado gestionado por esta implementación para ESTA entidad
 * (legacy /uploads/..., URL absoluta, otra entidad, formato inválido).
 */
export function parseInternalAvatarVersion(
  entity: AvatarEntity,
  entityId: string,
  avatarUrl: string | null | undefined,
): string | null {
  if (!avatarUrl) return null;
  const prefix = `${avatarInternalPath(entity, entityId)}?v=`;
  if (!avatarUrl.startsWith(prefix)) return null;
  const version = avatarUrl.slice(prefix.length);
  return VERSION.test(version) ? version : null;
}

/** ¿El avatar_url persistido apunta al almacenamiento privado de esta entidad? */
export function isInternalAvatarUrl(
  entity: AvatarEntity,
  entityId: string,
  avatarUrl: string | null | undefined,
): boolean {
  return parseInternalAvatarVersion(entity, entityId, avatarUrl) !== null;
}
