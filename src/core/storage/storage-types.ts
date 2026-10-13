/**
 * core/storage — storage-types.ts
 * Contrato del adapter de avatares (sin dependencias de runtime).
 */

export interface AvatarStorageAdapter {
  /** Crea el objeto (versionado, inmutable — sin upsert). */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Devuelve el contenido. Lanza AvatarStorageReadError si no puede leerlo. */
  get(key: string): Promise<{ body: Buffer; contentType: string }>;
  /** Elimina el objeto. */
  remove(key: string): Promise<void>;
}

export class AvatarStorageNotConfiguredError extends Error {
  constructor() {
    super("Almacenamiento de avatares no configurado.");
    this.name = "AvatarStorageNotConfiguredError";
  }
}

/** Falla al leer un objeto. Mensaje genérico: nunca incluye detalles del proveedor. */
export class AvatarStorageReadError extends Error {
  constructor() {
    super("No se pudo cargar la imagen.");
    this.name = "AvatarStorageReadError";
  }
}
