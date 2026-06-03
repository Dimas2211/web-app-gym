"use client";

import { useState } from "react";
import { Plus, Pencil, ToggleLeft, ToggleRight, Lock } from "lucide-react";

import { togglePlatformModuleStatusAction }  from "../actions/toggle-platform-module-status.action";
import { PlatformModuleFormDialog }          from "./platform-module-form-dialog";
import type { PlatformModuleItem, PlatformVerticalItem } from "../types/platform.types";

const CATEGORY_COLORS: Record<string, string> = {
  CORE:        "bg-purple-100 text-purple-700",
  COMMERCE:    "bg-blue-100 text-blue-700",
  VERTICAL:    "bg-amber-100 text-amber-700",
  INTEGRATION: "bg-cyan-100 text-cyan-700",
};

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE:   "bg-green-100 text-green-700",
  COMING_SOON: "bg-yellow-100 text-yellow-700",
  DEPRECATED:  "bg-zinc-100 text-zinc-500",
};

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE:   "Disponible",
  COMING_SOON: "Próximamente",
  DEPRECATED:  "Obsoleto",
};

interface Props {
  modules:   PlatformModuleItem[];
  verticals: PlatformVerticalItem[];
}

export function PlatformModulesTable({ modules, verticals }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing]       = useState<PlatformModuleItem | null>(null);
  const [toggling, setToggling]     = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function handleToggle(id: string) {
    setToggling(id);
    setToggleError(null);
    try {
      await togglePlatformModuleStatusAction(id);
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : "Error al cambiar estado.");
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
        <h2 className="text-sm font-bold text-zinc-800">Catálogo de módulos</h2>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 text-xs font-semibold bg-zinc-900 text-white px-3 py-1.5 rounded-lg hover:bg-zinc-800"
        >
          <Plus size={13} />
          Nuevo módulo
        </button>
      </div>

      {toggleError && (
        <div className="mx-5 mt-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-4 py-2">
          {toggleError}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-100">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">Código</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">Nombre</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">Categoría</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">Vertical</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-zinc-500">Versión</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-zinc-500">Estado</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {modules.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-zinc-400 text-sm py-10">
                  No hay módulos registrados
                </td>
              </tr>
            )}
            {modules.map((m) => (
              <tr key={m.id} className="hover:bg-zinc-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-zinc-500 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    {m.is_core && <span title="Módulo core"><Lock size={11} className="text-purple-400" /></span>}
                    {m.code}
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-zinc-800">{m.name}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[m.category] ?? "bg-zinc-100 text-zinc-500"}`}>
                    {m.category}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-500 text-xs">
                  {m.vertical?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-center font-mono text-xs text-zinc-500">{m.version}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[m.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                    {STATUS_LABELS[m.status] ?? m.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => setEditing(m)}
                      className="text-zinc-400 hover:text-zinc-700" title="Editar">
                      <Pencil size={14} />
                    </button>
                    {!m.is_core && (
                      <button type="button" onClick={() => handleToggle(m.id)} disabled={toggling === m.id}
                        className="text-zinc-400 hover:text-zinc-700 disabled:opacity-40"
                        title={m.status === "AVAILABLE" ? "Marcar obsoleto" : "Reactivar"}>
                        {m.status === "AVAILABLE"
                          ? <ToggleRight size={16} className="text-green-600" />
                          : <ToggleLeft size={16} />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <PlatformModuleFormDialog verticals={verticals} onClose={() => setShowCreate(false)} />
      )}
      {editing && (
        <PlatformModuleFormDialog module={editing} verticals={verticals} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
