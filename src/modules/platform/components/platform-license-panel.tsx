"use client";

import { useActionState } from "react";

import { updateOrganizationLicenseAction } from "../actions/update-organization-license.action";
import type {
  PlatformOrganizationDetail,
  PlatformLicenseStatus,
  PlatformBillingCycle,
} from "../types/platform.types";

const LICENSE_COLORS: Record<PlatformLicenseStatus, string> = {
  TRIAL:     "bg-blue-100 text-blue-700",
  ACTIVE:    "bg-green-100 text-green-700",
  SUSPENDED: "bg-orange-100 text-orange-700",
  EXPIRED:   "bg-red-100 text-red-700",
  CANCELLED: "bg-zinc-100 text-zinc-500",
};

const LICENSE_LABELS: Record<PlatformLicenseStatus, string> = {
  TRIAL:     "Trial",
  ACTIVE:    "Activa",
  SUSPENDED: "Suspendida",
  EXPIRED:   "Vencida",
  CANCELLED: "Cancelada",
};

const BILLING_LABELS: Record<PlatformBillingCycle, string> = {
  MONTHLY:  "Mensual",
  ANNUAL:   "Anual",
  LIFETIME: "De por vida",
  NONE:     "Sin facturación",
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-zinc-800">{value ?? "—"}</p>
    </div>
  );
}

const inputCls = "w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900";

export function PlatformLicensePanel({ org }: { org: PlatformOrganizationDetail }) {
  const [state, formAction, isPending] = useActionState(updateOrganizationLicenseAction, undefined);

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-5">
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Gestión de licencia</h2>

      {/* Estado actual */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-zinc-400 mb-1">Estado licencia</p>
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${LICENSE_COLORS[org.license_status]}`}>
            {LICENSE_LABELS[org.license_status]}
          </span>
        </div>
        <InfoRow label="Ciclo de facturación" value={BILLING_LABELS[org.billing_cycle]} />
        <InfoRow label="Trial hasta" value={org.trial_ends_at ? new Date(org.trial_ends_at).toLocaleDateString("es-SV") : "—"} />
        <InfoRow label="Licencia vence" value={org.license_expires_at ? new Date(org.license_expires_at).toLocaleDateString("es-SV") : "—"} />
      </div>

      {org.suspended_at && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
          <span className="font-semibold">Suspendida: </span>
          {new Date(org.suspended_at).toLocaleDateString("es-SV")}
          {org.suspension_reason && ` — ${org.suspension_reason}`}
        </div>
      )}

      {/* Formulario de gestión */}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={org.id} />

        {state?.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
            {state.error}
          </div>
        )}
        {state?.success && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2">
            Licencia actualizada correctamente.
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Estado de licencia</label>
            <select name="license_status" defaultValue={org.license_status} className={`${inputCls} bg-white`}>
              <option value="TRIAL">Trial</option>
              <option value="ACTIVE">Activa</option>
              <option value="SUSPENDED">Suspendida</option>
              <option value="EXPIRED">Vencida</option>
              <option value="CANCELLED">Cancelada</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Ciclo de facturación</label>
            <select name="billing_cycle" defaultValue={org.billing_cycle} className={`${inputCls} bg-white`}>
              <option value="MONTHLY">Mensual</option>
              <option value="ANNUAL">Anual</option>
              <option value="LIFETIME">De por vida</option>
              <option value="NONE">Sin facturación</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Trial hasta</label>
            <input name="trial_ends_at" type="date" defaultValue={fmtDate(org.trial_ends_at)} className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Licencia vence</label>
            <input name="license_expires_at" type="date" defaultValue={fmtDate(org.license_expires_at)} className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Fecha de suspensión</label>
            <input name="suspended_at" type="date" defaultValue={fmtDate(org.suspended_at)} className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Motivo de suspensión</label>
            <input name="suspension_reason" type="text" defaultValue={org.suspension_reason ?? ""}
              placeholder="Motivo (opcional)" className={inputCls} />
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={isPending}
            className="px-4 py-2 text-sm font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50">
            {isPending ? "Guardando…" : "Actualizar licencia"}
          </button>
        </div>
      </form>
    </div>
  );
}
