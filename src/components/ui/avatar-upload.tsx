"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";

interface AvatarUploadProps {
  /** URL actual del avatar (null si no tiene) */
  currentUrl: string | null;
  /** ID de la entidad (user o client) */
  entityId: string;
  /** Nombre para mostrar iniciales si no hay foto */
  displayName: string;
  /** Server action que recibe (entity_id, avatar_url) y actualiza el registro */
  onSaveAction: (formData: FormData) => Promise<void>;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function AvatarUpload({
  currentUrl,
  entityId,
  displayName,
  onSaveAction,
}: AvatarUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);

    // Previsualización local inmediata
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    // Subir al servidor
    const fd = new FormData();
    fd.append("file", file);
    fd.append("entity_id", entityId);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error ?? "Error al subir la imagen.");
        setPreview(currentUrl);
        return;
      }

      // Guardar URL en BD via server action
      const saveFd = new FormData();
      saveFd.append("entity_id", entityId);
      saveFd.append("avatar_url", data.url);
      startTransition(() => {
        onSaveAction(saveFd);
      });
    } catch {
      setError("Error de conexión al subir la imagen.");
      setPreview(currentUrl);
    } finally {
      setUploading(false);
    }
  }

  const initials = getInitials(displayName);

  return (
    <div className="flex items-center gap-4">
      {/* Avatar */}
      <div className="relative">
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
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || isPending}
          className="text-sm text-zinc-700 border border-zinc-300 px-3 py-1.5 rounded-lg hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
        >
          {preview ? "Cambiar foto" : "Subir foto"}
        </button>
        <p className="text-xs text-zinc-400">JPG, PNG, WebP — máx. 5 MB</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
