/**
 * core/storage — supabase-storage.ts
 *
 * Adapter Supabase Storage para avatares. SERVER-ONLY.
 *
 * Variables de entorno (nunca NEXT_PUBLIC_*):
 *   SUPABASE_STORAGE_URL               — URL del proyecto Supabase
 *   SUPABASE_STORAGE_SERVICE_ROLE_KEY  — service role (solo servidor)
 *   SUPABASE_AVATAR_BUCKET             — bucket PRIVADO (default "gym-avatars")
 *
 * Logs y errores SANITIZADOS: nunca se registra ni se propaga error.message
 * del proveedor, bucket, object key, tenant/entidad/versión, service role ni
 * URL de Storage — solo la operación que falló.
 */
if (typeof window !== "undefined") {
  throw new Error("[supabase-storage] Módulo server-only. No usar en contexto de navegador.");
}

import { createClient } from "@supabase/supabase-js";
import {
  AvatarStorageNotConfiguredError,
  AvatarStorageReadError,
  type AvatarStorageAdapter,
} from "./storage-types";

export const DEFAULT_AVATAR_BUCKET = "gym-avatars";

export function createSupabaseAvatarStorage(): AvatarStorageAdapter {
  const url = process.env.SUPABASE_STORAGE_URL?.trim();
  const serviceKey = process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_AVATAR_BUCKET?.trim() || DEFAULT_AVATAR_BUCKET;

  if (!url || !serviceKey) throw new AvatarStorageNotConfiguredError();

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const objects = () => supabase.storage.from(bucket);

  return {
    async put(key, body, contentType) {
      const { error } = await objects().upload(key, body, {
        contentType,
        // Objetos versionados e inmutables: nunca sobrescribir.
        upsert: false,
        cacheControl: "no-cache",
      });
      if (error) {
        console.error("[supabase-storage] upload failed");
        throw new Error("No se pudo guardar la imagen en el almacenamiento.");
      }
    },

    async get(key) {
      // Cualquier fallo (incluido "not found") lanza: el caller solo pide
      // versiones que la DB declara activas, así que no poder descargarla es
      // una falla de Storage, no ausencia normal de avatar.
      try {
        const { data, error } = await objects().download(key);
        if (error || !data) throw new Error("download");
        return {
          body: Buffer.from(await data.arrayBuffer()),
          contentType: data.type || "image/webp",
        };
      } catch {
        console.error("[supabase-storage] download failed");
        throw new AvatarStorageReadError();
      }
    },

    async remove(key) {
      const { error } = await objects().remove([key]);
      if (error) {
        console.error("[supabase-storage] remove failed");
        throw new Error("No se pudo eliminar la imagen del almacenamiento.");
      }
    },
  };
}
