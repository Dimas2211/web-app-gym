/**
 * core/storage — avatar-storage.ts
 *
 * Contrato de almacenamiento de avatares (fotografías personales).
 *
 * Producción: Storage Plane S3-compatible (Cloudflare R2), bucket PRIVADO
 * (ver s3-storage.ts).
 * No existe implementación de filesystem local: en Vercel el filesystem no
 * persiste y /public expondría fotografías personales sin autorización.
 *
 * Reglas:
 *   - El object key lo decide SIEMPRE el servidor (avatar-keys.ts) a partir
 *     de tenantId + entityId ya autorizados. El navegador nunca envía
 *     bucket, path ni URL final.
 *   - Objetos versionados e inmutables: cada foto nueva es un objeto nuevo;
 *     el anterior se limpia solo después de confirmar la DB.
 *   - Este módulo no sabe nada de permisos — la autorización vive en el
 *     servicio del módulo dueño de la entidad (clients / users).
 */
if (typeof window !== "undefined") {
  throw new Error("[avatar-storage] Módulo server-only. No usar en contexto de navegador.");
}

import { createS3AvatarStorage } from "./s3-storage";
import type { AvatarStorageAdapter } from "./storage-types";

export {
  AvatarStorageNotConfiguredError,
  AvatarStorageReadError,
  type AvatarStorageAdapter,
} from "./storage-types";

let cached: AvatarStorageAdapter | null = null;

/**
 * Devuelve el adapter de almacenamiento configurado.
 * Lanza AvatarStorageNotConfiguredError si faltan variables de entorno —
 * los callers deben mapearlo a 503 sin revelar qué variable falta.
 */
export function getAvatarStorage(): AvatarStorageAdapter {
  if (cached) return cached;
  cached = createS3AvatarStorage();
  return cached;
}
