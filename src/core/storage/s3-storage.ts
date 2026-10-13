/**
 * core/storage — s3-storage.ts
 *
 * Adapter S3-compatible para avatares (Storage Plane). SERVER-ONLY.
 * Producción inicial: Cloudflare R2. El endpoint determina el proveedor
 * (R2, AWS S3, MinIO, Backblaze B2...) sin cambiar la lógica de dominio.
 *
 * Variables de entorno (nunca NEXT_PUBLIC_*):
 *   OBJECT_STORAGE_ENDPOINT           — p. ej. https://<ACCOUNT_ID>.r2.cloudflarestorage.com
 *   OBJECT_STORAGE_REGION             — default "auto" (R2)
 *   OBJECT_STORAGE_ACCESS_KEY_ID      — token limitado al bucket
 *   OBJECT_STORAGE_SECRET_ACCESS_KEY  — solo servidor
 *   OBJECT_STORAGE_BUCKET             — bucket PRIVADO (default "zolvi-private")
 *   OBJECT_STORAGE_FORCE_PATH_STYLE   — opcional; solo "true" activa path-style.
 *                                       Ausente o cualquier otro valor -> false
 *                                       (virtual-hosted, el modo de R2/AWS S3).
 *
 * Sin ACL pública, sin URL pública, sin presigned URLs: toda lectura pasa
 * por /api/avatars/* con autorización Zolvi.
 *
 * Logs y errores SANITIZADOS: nunca se registra ni se propaga error.message
 * ni error.name del proveedor, endpoint, bucket, object key,
 * tenant/entidad/versión ni credenciales — solo la operación que falló.
 */
if (typeof window !== "undefined") {
  throw new Error("[s3-storage] Módulo server-only. No usar en contexto de navegador.");
}

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  AvatarStorageNotConfiguredError,
  AvatarStorageReadError,
  type AvatarStorageAdapter,
} from "./storage-types";

export const DEFAULT_OBJECT_STORAGE_REGION = "auto";
export const DEFAULT_OBJECT_STORAGE_BUCKET = "zolvi-private";

/** Solo "true" (sin distinguir mayúsculas) activa path-style; todo lo demás es false. */
function parseForcePathStyle(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

export function createS3AvatarStorage(): AvatarStorageAdapter {
  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT?.trim();
  const region = process.env.OBJECT_STORAGE_REGION?.trim() || DEFAULT_OBJECT_STORAGE_REGION;
  const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.OBJECT_STORAGE_BUCKET?.trim() || DEFAULT_OBJECT_STORAGE_BUCKET;
  const forcePathStyle = parseForcePathStyle(process.env.OBJECT_STORAGE_FORCE_PATH_STYLE);

  if (!endpoint || !accessKeyId || !secretAccessKey || !isHttpUrl(endpoint)) {
    throw new AvatarStorageNotConfiguredError();
  }

  const client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    // Addressing configurable: false (virtual-hosted) para R2/AWS S3;
    // true para S3-compatibles que lo requieran (p. ej. MinIO).
    forcePathStyle,
    // Checksums solo cuando la operación los exige: los defaults más
    // recientes del SDK no son soportados por todos los S3-compatibles.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return {
    async put(key, body, contentType) {
      try {
        // Cada versión es una key nueva (UUID del servidor): inmutable desde
        // la lógica de Zolvi. Sin ACL — el bucket es privado.
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            CacheControl: "private, no-store",
          }),
        );
      } catch {
        console.error("[s3-storage] upload failed");
        throw new Error("No se pudo guardar la imagen en el almacenamiento.");
      }
    },

    async get(key) {
      // Cualquier fallo (incluido NoSuchKey) lanza: el caller solo pide
      // versiones que la DB declara activas, así que no poder descargarla es
      // una falla del Storage Plane, no ausencia normal de avatar.
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!res.Body) throw new Error("download");
        const bytes = await res.Body.transformToByteArray();
        return {
          body: Buffer.from(bytes),
          contentType: res.ContentType || "image/webp",
        };
      } catch {
        console.error("[s3-storage] download failed");
        throw new AvatarStorageReadError();
      }
    },

    async remove(key) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch {
        console.error("[s3-storage] remove failed");
        throw new Error("No se pudo eliminar la imagen del almacenamiento.");
      }
    },
  };
}
