"use client";

// ─────────────────────────────────────────────────────────────────
// platform — new-platform-organization-dialog.tsx
//
// Diálogo para crear una nueva PlatformOrganization.
// Usa createPlatformOrganizationAction vía useActionState (React 19).
// ─────────────────────────────────────────────────────────────────

import { useActionState } from "react";
import { X } from "lucide-react";

import { createPlatformOrganizationAction } from "../actions/create-platform-organization.action";
import type { PlatformVerticalItem, PlatformPlanItem } from "../types/platform.types";

interface Props {
  verticals: PlatformVerticalItem[];
  plans:     PlatformPlanItem[];
  onClose:   () => void;
}

export function NewPlatformOrganizationDialog({ verticals, plans, onClose }: Props) {
  const [state, formAction, isPending] = useActionState(
    createPlatformOrganizationAction,
    undefined,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-100">
          <h2 className="text-base font-bold text-zinc-800">Nueva organización</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <form action={formAction} className="p-5 space-y-4">

          {state?.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
              {state.error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Código */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">
                Código <span className="text-red-500">*</span>
              </label>
              <input
                name="code"
                type="text"
                placeholder="ej: acme-gym"
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {state?.errors?.code && (
                <p className="text-xs text-red-600 mt-0.5">{state.errors.code[0]}</p>
              )}
            </div>

            {/* Nombre */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">
                Nombre comercial <span className="text-red-500">*</span>
              </label>
              <input
                name="name"
                type="text"
                placeholder="Nombre de la organización"
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {state?.errors?.name && (
                <p className="text-xs text-red-600 mt-0.5">{state.errors.name[0]}</p>
              )}
            </div>

            {/* Razón social */}
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">
                Razón social
              </label>
              <input
                name="legal_name"
                type="text"
                placeholder="Razón social formal (opcional)"
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            {/* NIT */}
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">NIT</label>
              <input
                name="nit"
                type="text"
                placeholder="Identificación fiscal"
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            {/* Tenant ID */}
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Tenant ID</label>
              <input
                name="tenant_id"
                type="text"
                placeholder="ID de tenant existente (opcional)"
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            {/* Vertical */}
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Vertical</label>
              <select
                name="vertical_id"
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
              >
                <option value="">— Sin vertical —</option>
                {verticals.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            {/* Plan */}
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Plan</label>
              <select
                name="plan_id"
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
              >
                <option value="">— Sin plan —</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Ciclo de facturación */}
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">
                Ciclo de facturación
              </label>
              <select
                name="billing_cycle"
                defaultValue="MONTHLY"
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
              >
                <option value="MONTHLY">Mensual</option>
                <option value="ANNUAL">Anual</option>
                <option value="LIFETIME">De por vida</option>
                <option value="NONE">Sin facturación</option>
              </select>
            </div>

            {/* País */}
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">
                País (ISO alpha-2)
              </label>
              <input
                name="country_code"
                type="text"
                placeholder="SV, GT, MX…"
                maxLength={2}
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 uppercase"
              />
              {state?.errors?.country_code && (
                <p className="text-xs text-red-600 mt-0.5">{state.errors.country_code[0]}</p>
              )}
            </div>

            {/* Timezone */}
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Zona horaria</label>
              <input
                name="timezone"
                type="text"
                placeholder="America/El_Salvador"
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            {/* Dominio */}
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Dominio</label>
              <input
                name="domain"
                type="text"
                placeholder="cliente.midominio.com (opcional)"
                className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
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
              {isPending ? "Creando…" : "Crear organización"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
