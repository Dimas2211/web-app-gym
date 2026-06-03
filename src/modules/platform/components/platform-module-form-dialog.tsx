"use client";

import { useActionState } from "react";
import { X }             from "lucide-react";

import { createPlatformModuleAction } from "../actions/create-platform-module.action";
import { updatePlatformModuleAction } from "../actions/update-platform-module.action";
import type { PlatformModuleItem, PlatformVerticalItem } from "../types/platform.types";

interface Props {
  module?:   PlatformModuleItem;
  verticals: PlatformVerticalItem[];
  onClose:   () => void;
}

const CATEGORY_OPTIONS = [
  { value: "CORE",        label: "Core" },
  { value: "COMMERCE",    label: "Commerce" },
  { value: "VERTICAL",    label: "Vertical" },
  { value: "INTEGRATION", label: "Integración" },
] as const;

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-600 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
    </div>
  );
}

const inputCls = "w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900";

export function PlatformModuleFormDialog({ module: mod, verticals, onClose }: Props) {
  const isEdit = !!mod;
  const action = isEdit ? updatePlatformModuleAction : createPlatformModuleAction;
  const [state, formAction, isPending] = useActionState(action, undefined);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between p-5 border-b border-zinc-100">
          <h2 className="text-base font-bold text-zinc-800">
            {isEdit ? "Editar módulo" : "Nuevo módulo"}
          </h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
            <X size={18} />
          </button>
        </div>

        <form action={formAction} className="p-5 space-y-4">
          {state?.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
              {state.error}
            </div>
          )}

          {isEdit && <input type="hidden" name="id" value={mod.id} />}

          <div className="grid grid-cols-2 gap-4">
            {!isEdit && (
              <div className="col-span-2">
                <Field label="Código *" error={state?.errors?.code?.[0]}>
                  <input name="code" type="text" placeholder="ej: commerce.sales" className={inputCls} />
                </Field>
              </div>
            )}

            <div className="col-span-2">
              <Field label="Nombre *" error={state?.errors?.name?.[0]}>
                <input name="name" type="text" defaultValue={mod?.name} placeholder="Nombre del módulo" className={inputCls} />
              </Field>
            </div>

            <div className="col-span-2">
              <Field label="Descripción" error={state?.errors?.description?.[0]}>
                <textarea name="description" defaultValue={mod?.description ?? ""} rows={2}
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none" />
              </Field>
            </div>

            <Field label="Categoría *" error={state?.errors?.category?.[0]}>
              <select name="category" defaultValue={mod?.category ?? "CORE"} className={`${inputCls} bg-white`}>
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Versión" error={state?.errors?.version?.[0]}>
              <input name="version" type="text" defaultValue={mod?.version ?? "1.0"} placeholder="1.0" className={inputCls} />
            </Field>

            <div className="col-span-2">
              <Field label="Vertical asociada" error={state?.errors?.vertical_id?.[0]}>
                <select name="vertical_id" defaultValue={mod?.vertical_id ?? ""} className={`${inputCls} bg-white`}>
                  <option value="">— Transversal / sin vertical —</option>
                  {verticals.map((v) => (
                    <option key={v.id} value={v.id}>{v.name} ({v.code})</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="col-span-2 flex items-center gap-3">
              <input type="hidden" name="is_core" value="false" />
              <input
                id="is_core"
                type="checkbox"
                name="is_core"
                value="true"
                defaultChecked={mod?.is_core}
                className="w-4 h-4 rounded border-zinc-300 accent-zinc-900"
              />
              <label htmlFor="is_core" className="text-sm text-zinc-700">
                Módulo core (no puede desactivarse por organización)
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={isPending}
              className="px-4 py-2 text-sm text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={isPending}
              className="px-4 py-2 text-sm font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50">
              {isPending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear módulo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
