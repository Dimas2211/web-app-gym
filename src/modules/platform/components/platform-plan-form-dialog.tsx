"use client";

import { useActionState } from "react";
import { X }             from "lucide-react";

import { createPlatformPlanAction } from "../actions/create-platform-plan.action";
import { updatePlatformPlanAction } from "../actions/update-platform-plan.action";
import type { PlatformPlanItem }    from "../types/platform.types";

interface Props {
  plan?:    PlatformPlanItem;
  onClose:  () => void;
}

const BILLING_OPTIONS = [
  { value: "MONTHLY",  label: "Mensual" },
  { value: "ANNUAL",   label: "Anual" },
  { value: "LIFETIME", label: "De por vida" },
  { value: "NONE",     label: "Sin facturación" },
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

export function PlatformPlanFormDialog({ plan, onClose }: Props) {
  const isEdit = !!plan;
  const action = isEdit ? updatePlatformPlanAction : createPlatformPlanAction;

  const [state, formAction, isPending] = useActionState(action, undefined);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between p-5 border-b border-zinc-100">
          <h2 className="text-base font-bold text-zinc-800">
            {isEdit ? "Editar plan" : "Nuevo plan"}
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

          {isEdit && <input type="hidden" name="id" value={plan.id} />}

          <div className="grid grid-cols-2 gap-4">
            {!isEdit && (
              <div className="col-span-2">
                <Field label="Código *" error={state?.errors?.code?.[0]}>
                  <input name="code" type="text" placeholder="ej: starter" className={inputCls} />
                </Field>
              </div>
            )}

            <div className="col-span-2">
              <Field label="Nombre *" error={state?.errors?.name?.[0]}>
                <input name="name" type="text" defaultValue={plan?.name} placeholder="Nombre del plan" className={inputCls} />
              </Field>
            </div>

            <div className="col-span-2">
              <Field label="Descripción" error={state?.errors?.description?.[0]}>
                <textarea
                  name="description"
                  defaultValue={plan?.description ?? ""}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
                />
              </Field>
            </div>

            <Field label="Ciclo de facturación" error={state?.errors?.billing_cycle?.[0]}>
              <select name="billing_cycle" defaultValue={plan?.billing_cycle ?? "MONTHLY"} className={`${inputCls} bg-white`}>
                {BILLING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Precio mensual (USD)" error={state?.errors?.price_monthly?.[0]}>
              <input name="price_monthly" type="number" step="0.01" min="0"
                defaultValue={plan?.price_monthly ?? ""} placeholder="0.00" className={inputCls} />
            </Field>

            <Field label="Precio anual (USD)" error={state?.errors?.price_annual?.[0]}>
              <input name="price_annual" type="number" step="0.01" min="0"
                defaultValue={plan?.price_annual ?? ""} placeholder="0.00" className={inputCls} />
            </Field>

            <Field label="Máx. ubicaciones" error={state?.errors?.max_locations?.[0]}>
              <input name="max_locations" type="number" min="1"
                defaultValue={plan?.max_locations ?? ""} placeholder="Sin límite" className={inputCls} />
            </Field>

            <Field label="Máx. usuarios" error={state?.errors?.max_users?.[0]}>
              <input name="max_users" type="number" min="1"
                defaultValue={plan?.max_users ?? ""} placeholder="Sin límite" className={inputCls} />
            </Field>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={isPending}
              className="px-4 py-2 text-sm text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={isPending}
              className="px-4 py-2 text-sm font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50">
              {isPending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
