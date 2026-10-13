/**
 * core/storage — avatar-limits.ts
 *
 * Contrato de avatares compartido por servidor y UI (sin dependencias
 * server-only, importable desde componentes cliente).
 *
 * 4 MB: margen por debajo del límite de body de funciones Vercel (~4.5 MB),
 * que rechaza la request antes de llegar al handler. Flujo vigente:
 * navegador → servidor Zolvi → sharp → Storage Plane S3-compatible (R2).
 */

export const MAX_AVATAR_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_AVATAR_UPLOAD_LABEL = "4 MB";
export const AVATAR_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
