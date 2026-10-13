"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  AVATAR_ALLOWED_MIME_TYPES,
  MAX_AVATAR_UPLOAD_BYTES,
  MAX_AVATAR_UPLOAD_LABEL,
} from "@/core/storage/avatar-limits";

interface AvatarUploadProps {
  /** URL actual del avatar (null si no tiene) */
  currentUrl: string | null;
  /**
   * Endpoint autorizado de la entidad, ej. /api/avatars/clients/{id}.
   * El servidor valida permisos, procesa la imagen, la guarda y actualiza
   * avatar_url en la misma operación — el navegador no envía path, bucket
   * ni URL final.
   */
  uploadEndpoint: string;
  /** Nombre para mostrar iniciales si no hay foto */
  displayName: string;
}

const ACCEPTED_TYPES: readonly string[] = AVATAR_ALLOWED_MIME_TYPES;

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function AvatarUpload({ currentUrl, uploadEndpoint, displayName }: AvatarUploadProps) {
  const router = useRouter();
  const [savedUrl, setSavedUrl] = useState<string | null>(currentUrl);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    // Validación previa solo por UX — la autoritativa ocurre en el servidor.
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Tipo de archivo no permitido. Solo JPG, PNG o WebP.");
      return;
    }
    if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
      setError(`El archivo supera el límite de ${MAX_AVATAR_UPLOAD_LABEL}.`);
      return;
    }

    setUploading(true);
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch(uploadEndpoint, { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;

      if (!res.ok || !data?.url) {
        setError(
          data?.error ??
            (res.status === 413
              ? "El archivo es demasiado grande."
              : "Error al subir la imagen."),
        );
        setPreview(savedUrl);
        return;
      }

      setSavedUrl(data.url);
      setPreview(data.url);
      startTransition(() => router.refresh());
    } catch {
      setError("Error de conexión al subir la imagen.");
      setPreview(savedUrl);
    } finally {
      URL.revokeObjectURL(localUrl);
      setUploading(false);
    }
  }

  const initials = getInitials(displayName);

  return (
    <div className="flex items-center gap-4">
      {/* Avatar */}
      <div className="relative shrink-0">
        {preview ? (
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-zinc-200 bg-zinc-100">
            <Image
              src={preview}
              alt={displayName}
              width={80}
              height={80}
              className="w-full h-full object-cover"
              unoptimized
            />
          </div>
        ) : (
          <div className="w-20 h-20 rounded-full bg-zinc-200 border-2 border-zinc-300 flex items-center justify-center">
            <span className="text-xl font-bold text-zinc-500">{initials}</span>
          </div>
        )}
        {(uploading || isPending) && (
          <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="space-y-1.5 min-w-0">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || isPending}
          className="text-sm text-zinc-700 border border-zinc-300 px-3 py-1.5 rounded-lg hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
        >
          {preview ? "Cambiar foto" : "Subir foto"}
        </button>
        <p className="text-xs text-zinc-400">JPG, PNG, WebP — máx. {MAX_AVATAR_UPLOAD_LABEL}</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_ALLOWED_MIME_TYPES.join(",")}
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
