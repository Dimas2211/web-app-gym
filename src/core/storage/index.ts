/**
 * Capa de almacenamiento de archivos (server-only).
 *
 * Avatares: Storage Plane S3-compatible (Cloudflare R2), bucket privado.
 * Sin filesystem local — en Vercel no persiste y /public expondría
 * fotografías personales.
 * Configuración: docs/modules/gym-credentials.md
 */
export {
  getAvatarStorage,
  AvatarStorageNotConfiguredError,
  type AvatarStorageAdapter,
} from "./avatar-storage";
export {
  avatarObjectKey,
  avatarInternalPath,
  avatarInternalUrl,
  isInternalAvatarUrl,
  parseInternalAvatarVersion,
  newAvatarVersion,
  type AvatarEntity,
} from "./avatar-keys";
export {
  processAvatarImage,
  validateAvatarFile,
  AVATAR_CONTENT_TYPE,
  type AvatarImageResult,
} from "./avatar-image";
export {
  replaceAvatar,
  readActiveAvatar,
  type AvatarUploadResult,
  type AvatarReadResult,
} from "./avatar-lifecycle";
export {
  MAX_AVATAR_UPLOAD_BYTES,
  MAX_AVATAR_UPLOAD_LABEL,
  AVATAR_ALLOWED_MIME_TYPES,
} from "./avatar-limits";
