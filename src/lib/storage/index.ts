/**
 * Capa de abstracción para almacenamiento de archivos.
 *
 * ENTORNO LOCAL (desarrollo):
 *   Los archivos se guardan en /public/uploads/ y quedan accesibles
 *   via la URL estática de Next.js (/uploads/filename).
 *
 * ENTORNO DE PRODUCCIÓN (Vercel u otro hosting sin filesystem persistente):
 *   El filesystem de /public/ es de solo lectura. Para producción debes
 *   cambiar la implementación de `uploadFile` para usar un servicio de
 *   almacenamiento en la nube, por ejemplo:
 *     - Supabase Storage (@supabase/supabase-js)
 *     - Vercel Blob (@vercel/blob)
 *     - Cloudinary (cloudinary)
 *   La interfaz de esta función no cambia — solo la implementación interna.
 */
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "avatars");
const UPLOAD_URL_BASE = "/uploads/avatars";

/** Tipos MIME permitidos para avatares */
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface UploadResult {
  url: string;
  filename: string;
}

export interface UploadError {
  error: string;
}

/**
 * Sube un archivo de imagen al almacenamiento configurado.
 * Devuelve la URL pública del archivo subido.
 *
 * En producción: reemplaza esta implementación por un cliente de Supabase Storage,
 * Vercel Blob u otro servicio.
 */
export async function uploadAvatarFile(
  file: File,
  entityId: string
): Promise<UploadResult | UploadError> {
  // Validar tipo
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { error: "Tipo de archivo no permitido. Solo JPG, PNG, WebP o GIF." };
  }

  // Validar tamaño
  if (file.size > MAX_SIZE_BYTES) {
    return { error: "El archivo supera el límite de 5 MB." };
  }

  // Asegurar que el directorio existe
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const filename = `${entityId}-${Date.now()}.${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  return {
    url: `${UPLOAD_URL_BASE}/${filename}`,
    filename,
  };
}
