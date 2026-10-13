/**
 * core/storage — avatar-image.ts
 *
 * Validación + normalización server-side de avatares (fuente autoritativa;
 * el navegador solo previsualiza).
 *
 *   - MIME declarado: image/jpeg | image/png | image/webp
 *   - Tamaño máximo: MAX_AVATAR_UPLOAD_BYTES (4 MB, ver avatar-limits.ts)
 *   - Contenido real verificado por sharp (no basta el MIME declarado)
 *   - Orientación EXIF aplicada (.rotate()) y metadata eliminada
 *     (sharp no copia EXIF/ICC/XMP salvo withMetadata())
 *   - Salida: WebP, recorte cuadrado 512x512
 */
if (typeof window !== "undefined") {
  throw new Error("[avatar-image] Módulo server-only. No usar en contexto de navegador.");
}

import sharp from "sharp";
import {
  AVATAR_ALLOWED_MIME_TYPES,
  MAX_AVATAR_UPLOAD_BYTES,
  MAX_AVATAR_UPLOAD_LABEL,
} from "./avatar-limits";

export const AVATAR_SIZE_PX = 512;
export const AVATAR_CONTENT_TYPE = "image/webp";

const TOO_LARGE = `El archivo supera el límite de ${MAX_AVATAR_UPLOAD_LABEL}.`;
const ALLOWED_DECODED_FORMATS = new Set(["jpeg", "png", "webp"]);

export type AvatarImageResult =
  | { ok: true; body: Buffer; contentType: typeof AVATAR_CONTENT_TYPE }
  | { ok: false; error: string; status: 400 | 413 };

export function validateAvatarFile(
  file: { type: string; size: number },
): { ok: true } | { ok: false; error: string; status: 400 | 413 } {
  if (!(AVATAR_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: "Tipo de archivo no permitido. Solo JPG, PNG o WebP.", status: 400 };
  }
  if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
    return { ok: false, error: TOO_LARGE, status: 413 };
  }
  if (file.size === 0) {
    return { ok: false, error: "El archivo está vacío.", status: 400 };
  }
  return { ok: true };
}

export async function processAvatarImage(file: File): Promise<AvatarImageResult> {
  const valid = validateAvatarFile(file);
  if (!valid.ok) return valid;

  const input = Buffer.from(await file.arrayBuffer());
  if (input.byteLength > MAX_AVATAR_UPLOAD_BYTES) {
    return { ok: false, error: TOO_LARGE, status: 413 };
  }

  try {
    const image = sharp(input, { failOn: "error", limitInputPixels: 40_000_000 });
    const meta = await image.metadata();
    if (!meta.format || !ALLOWED_DECODED_FORMATS.has(meta.format)) {
      return { ok: false, error: "El contenido no es una imagen JPG, PNG o WebP válida.", status: 400 };
    }

    const body = await image
      .rotate()
      .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();

    return { ok: true, body, contentType: AVATAR_CONTENT_TYPE };
  } catch {
    return { ok: false, error: "No se pudo procesar la imagen. Verifica que no esté dañada.", status: 400 };
  }
}
