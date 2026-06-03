"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-branding-panel.tsx
//
// Panel de branding de una organización.
// Permite editar los campos disponibles del modelo PlatformBranding.
// ─────────────────────────────────────────────────────────────────

import { useActionState, useState } from "react";
import { Pencil, X }                from "lucide-react";

import { updatePlatformBrandingAction } from "../actions/update-platform-branding.action";
import type { PlatformBrandingData }    from "../types/platform.types";

interface Props {
  organizationId: string;
  branding:       PlatformBrandingData | null;
}

function ColorSwatch({ color }: { color: string | null }) {
  if (!color) return <span className="text-zinc-400">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block w-4 h-4 rounded border border-zinc-200 shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="font-mono text-xs">{color}</span>
    </span>
  );
}

export function PlatformBrandingPanel({ organizationId, branding }: Props) {
  const [isEditing, setIsEditing] = useState(false);

  const [state, formAction, isPending] = useActionState(
    updatePlatformBrandingAction,
    undefined,
  );

  function handleSuccess() {
    // revalidatePath en la action recarga datos automáticamente
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Branding</h2>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            <Pencil size={13} />
            Editar
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-zinc-400 mb-0.5">Color primario</p>
            <ColorSwatch color={branding?.primary_color ?? null} />
          </div>
          <div>
            <p className="text-xs text-zinc-400 mb-0.5">Color secundario</p>
            <ColorSwatch color={branding?.secondary_color ?? null} />
          </div>
          <div>
            <p className="text-xs text-zinc-400 mb-0.5">Logo URL</p>
            <p className="text-sm text-zinc-700 break-all">
              {branding?.logo_url
                ? <a href={branding.logo_url} target="_blank" rel="noreferrer" className="underline text-blue-600 text-xs">{branding.logo_url}</a>
                : <span className="text-zinc-400">—</span>
              }
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-400 mb-0.5">Favicon URL</p>
            <p className="text-sm text-zinc-700 break-all">
              {branding?.favicon_url
                ? <a href={branding.favicon_url} target="_blank" rel="noreferrer" className="underline text-blue-600 text-xs">{branding.favicon_url}</a>
                : <span className="text-zinc-400">—</span>
              }
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-400 mb-0.5">Dominio personalizado</p>
            <p className="text-sm text-zinc-700">{branding?.custom_domain ?? "—"}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Branding — editar</h2>
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <form
        action={async (fd) => {
          await formAction(fd);
          handleSuccess();
        }}
        className="space-y-4"
      >
        <input type="hidden" name="organization_id" value={organizationId} />

        {state?.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
            {state.error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              Color primario
            </label>
            <input
              name="primary_color"
              type="text"
              defaultValue={branding?.primary_color ?? ""}
              placeholder="#1a1a2e"
              className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              Color secundario
            </label>
            <input
              name="secondary_color"
              type="text"
              defaultValue={branding?.secondary_color ?? ""}
              placeholder="#16213e"
              className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              Logo URL
            </label>
            <input
              name="logo_url"
              type="text"
              defaultValue={branding?.logo_url ?? ""}
              placeholder="https://cdn.ejemplo.com/logo.png"
              className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              Favicon URL
            </label>
            <input
              name="favicon_url"
              type="text"
              defaultValue={branding?.favicon_url ?? ""}
              placeholder="https://cdn.ejemplo.com/favicon.ico"
              className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              Dominio personalizado
            </label>
            <input
              name="custom_domain"
              type="text"
              defaultValue={branding?.custom_domain ?? ""}
              placeholder="app.cliente.com"
              className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            disabled={isPending}
            className="px-4 py-2 text-sm text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 text-sm font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {isPending ? "Guardando…" : "Guardar branding"}
          </button>
        </div>
      </form>
    </div>
  );
}
