"use client";

import { useActionState } from "react";
import { X }             from "lucide-react";

import { updatePlatformOrganizationAction } from "../actions/update-platform-organization.action";
import type {
  PlatformOrganizationDetail,
  PlatformVerticalItem,
  PlatformPlanItem,
} from "../types/platform.types";

interface Props {
  org:       PlatformOrganizationDetail;
  verticals: PlatformVerticalItem[];
  plans:     PlatformPlanItem[];
  onClose:   () => void;
}

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

export function PlatformOrganizationEditForm({ org, verticals, plans, onClose }: Props) {
  const [state, formAction, isPending] = useActionState(updatePlatformOrganizationAction, undefined);

  function fmtDate(d: Date | null | undefined): string {
    if (!d) return "";
    return new Date(d).toISOString().slice(0, 10);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between p-5 border-b border-zinc-100">
          <h2 className="text-base font-bold text-zinc-800">Editar organización — {org.name}</h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
            <X size={18} />
          </button>
        </div>

        <form action={formAction} className="p-5 space-y-5">
          {state?.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
              {state.error}
            </div>
          )}

          <input type="hidden" name="id" value={org.id} />

          {/* Identidad */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Identidad</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <Field label="Nombre comercial *" error={state?.errors?.name?.[0]}>
                  <input name="name" type="text" defaultValue={org.name} className={inputCls} />
                </Field>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Field label="Razón social" error={state?.errors?.legal_name?.[0]}>
                  <input name="legal_name" type="text" defaultValue={org.legal_name ?? ""} className={inputCls} />
                </Field>
              </div>
              <Field label="NIT" error={state?.errors?.nit?.[0]}>
                <input name="nit" type="text" defaultValue={org.nit ?? ""} className={inputCls} />
              </Field>
              <Field label="Tenant ID" error={state?.errors?.tenant_id?.[0]}>
                <input name="tenant_id" type="text" defaultValue={org.tenant_id ?? ""} placeholder="ID del tenant runtime" className={inputCls} />
              </Field>
            </div>
          </div>

          {/* Clasificación */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Clasificación</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Vertical" error={state?.errors?.vertical_id?.[0]}>
                <select name="vertical_id" defaultValue={org.vertical?.id ?? ""} className={`${inputCls} bg-white`}>
                  <option value="">— Sin vertical —</option>
                  {verticals.map((v) => (
                    <option key={v.id} value={v.id}>{v.name} ({v.code})</option>
                  ))}
                </select>
              </Field>
              <Field label="Plan" error={state?.errors?.plan_id?.[0]}>
                <select name="plan_id" defaultValue={org.plan?.id ?? ""} className={`${inputCls} bg-white`}>
                  <option value="">— Sin plan —</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Ciclo de facturación" error={state?.errors?.billing_cycle?.[0]}>
                <select name="billing_cycle" defaultValue={org.billing_cycle} className={`${inputCls} bg-white`}>
                  <option value="MONTHLY">Mensual</option>
                  <option value="ANNUAL">Anual</option>
                  <option value="LIFETIME">De por vida</option>
                  <option value="NONE">Sin facturación</option>
                </select>
              </Field>
              <Field label="País (ISO alpha-2)" error={state?.errors?.country_code?.[0]}>
                <input name="country_code" type="text" maxLength={2}
                  defaultValue={org.country_code ?? ""} placeholder="SV" className={`${inputCls} uppercase`} />
              </Field>
              <Field label="Zona horaria" error={state?.errors?.timezone?.[0]}>
                <input name="timezone" type="text" defaultValue={org.timezone ?? ""}
                  placeholder="America/El_Salvador" className={inputCls} />
              </Field>
              <Field label="Dominio" error={state?.errors?.domain?.[0]}>
                <input name="domain" type="text" defaultValue={org.domain ?? ""}
                  placeholder="cliente.midominio.com" className={inputCls} />
              </Field>
            </div>
          </div>

          {/* Despliegue */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Despliegue</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Field label="URL de despliegue" error={state?.errors?.deployment_url?.[0]}>
                  <input name="deployment_url" type="text" defaultValue={org.deployment_url ?? ""}
                    placeholder="https://erp.cliente.com" className={inputCls} />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Identificador de instancia" error={state?.errors?.instance_identifier?.[0]}>
                  <input name="instance_identifier" type="text" defaultValue={org.instance_identifier ?? ""}
                    placeholder="cliente-gym-sv-01" className={inputCls} />
                </Field>
              </div>
            </div>
          </div>

          {/* Licencia */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Fechas de licencia</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Trial hasta" error={state?.errors?.trial_ends_at?.[0]}>
                <input name="trial_ends_at" type="date" defaultValue={fmtDate(org.trial_ends_at)} className={inputCls} />
              </Field>
              <Field label="Licencia vence" error={state?.errors?.license_expires_at?.[0]}>
                <input name="license_expires_at" type="date" defaultValue={fmtDate(org.license_expires_at)} className={inputCls} />
              </Field>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={isPending}
              className="px-4 py-2 text-sm text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={isPending}
              className="px-4 py-2 text-sm font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50">
              {isPending ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
