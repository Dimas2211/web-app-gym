"use client";

import { useState }                          from "react";
import { Plus, Pencil, ToggleLeft, ToggleRight } from "lucide-react";

import { togglePlatformPlanStatusAction }   from "../actions/toggle-platform-plan-status.action";
import { PlatformPlanFormDialog }           from "./platform-plan-form-dialog";
import type { PlatformPlanItem, PlatformModuleItem, PlatformEntitlementDefinitionItem } from "../types/platform.types";

const BILLING_LABELS: Record<string, string> = {
  MONTHLY:  "Mensual",
  ANNUAL:   "Anual",
  LIFETIME: "De por vida",
  NONE:     "Sin facturación",
};

function fmt(n: number | null): string {
  if (n === null) return "—";
  return `$${n.toFixed(2)}`;
}

function fmtLimit(n: number | null): string {
  return n === null ? "Sin límite" : String(n);
}

interface Props {
  plans:                   PlatformPlanItem[];
  allModules:               PlatformModuleItem[];
  entitlementDefinitions:  PlatformEntitlementDefinitionItem[];
}

export function PlatformPlansTable({ plans, allModules, entitlementDefinitions }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing]       = useState<PlatformPlanItem | null>(null);
  const [toggling, setToggling]     = useState<string | null>(null);

  async function handleToggle(id: string) {
    setToggling(id);
    try { await togglePlatformPlanStatusAction(id); } finally { setToggling(null); }
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
        <h2 className="text-sm font-bold text-zinc-800">Planes de licencia</h2>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 text-xs font-semibold bg-zinc-900 text-white px-3 py-1.5 rounded-lg hover:bg-zinc-800"
        >
          <Plus size={13} />
          Nuevo plan
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-100">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">Código</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">Nombre</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">Ciclo</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-500">Mensual</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-500">Anual</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-zinc-500">Ubic.</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-zinc-500">Usuarios</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-zinc-500">Estado</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {plans.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-zinc-400 text-sm py-10">
                  No hay planes registrados
                </td>
              </tr>
            )}
            {plans.map((p) => (
              <tr key={p.id} className="hover:bg-zinc-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-zinc-500">{p.code}</td>
                <td className="px-4 py-3 font-medium text-zinc-800">{p.name}</td>
                <td className="px-4 py-3 text-zinc-600">{BILLING_LABELS[p.billing_cycle] ?? p.billing_cycle}</td>
                <td className="px-4 py-3 text-right text-zinc-700">{fmt(p.price_monthly)}</td>
                <td className="px-4 py-3 text-right text-zinc-700">{fmt(p.price_annual)}</td>
                <td className="px-4 py-3 text-center text-zinc-600">{fmtLimit(p.max_locations)}</td>
                <td className="px-4 py-3 text-center text-zinc-600">{fmtLimit(p.max_users)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    p.is_active ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
                  }`}>
                    {p.is_active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="text-zinc-400 hover:text-zinc-700 transition-colors"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggle(p.id)}
                      disabled={toggling === p.id}
                      className="text-zinc-400 hover:text-zinc-700 transition-colors disabled:opacity-40"
                      title={p.is_active ? "Desactivar" : "Activar"}
                    >
                      {p.is_active ? <ToggleRight size={16} className="text-green-600" /> : <ToggleLeft size={16} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <PlatformPlanFormDialog
          allModules={allModules}
          entitlementDefinitions={entitlementDefinitions}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editing && (
        <PlatformPlanFormDialog
          plan={editing}
          allModules={allModules}
          entitlementDefinitions={entitlementDefinitions}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
