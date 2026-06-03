"use client";

import { useState } from "react";
import { Plus, Pencil, ToggleLeft, ToggleRight } from "lucide-react";

import { togglePlatformVerticalStatusAction } from "../actions/toggle-platform-vertical-status.action";
import { PlatformVerticalFormDialog }         from "./platform-vertical-form-dialog";
import type { PlatformVerticalItem }          from "../types/platform.types";

export function PlatformVerticalsTable({ verticals }: { verticals: PlatformVerticalItem[] }) {
  const [showCreate, setShowCreate]   = useState(false);
  const [editing, setEditing]         = useState<PlatformVerticalItem | null>(null);
  const [toggling, setToggling]       = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function handleToggle(id: string) {
    setToggling(id);
    setToggleError(null);
    try {
      await togglePlatformVerticalStatusAction(id);
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : "Error al cambiar estado.");
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
        <h2 className="text-sm font-bold text-zinc-800">Verticales de industria</h2>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 text-xs font-semibold bg-zinc-900 text-white px-3 py-1.5 rounded-lg hover:bg-zinc-800"
        >
          <Plus size={13} />
          Nueva vertical
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
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500">Descripción</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-zinc-500">Estado</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {verticals.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-zinc-400 text-sm py-10">
                  No hay verticales registradas
                </td>
              </tr>
            )}
            {verticals.map((v) => (
              <tr key={v.id} className="hover:bg-zinc-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs font-bold text-zinc-600">{v.code}</td>
                <td className="px-4 py-3 font-medium text-zinc-800">{v.name}</td>
                <td className="px-4 py-3 text-zinc-500 text-xs max-w-xs truncate">
                  {v.description ?? "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    v.is_active ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
                  }`}>
                    {v.is_active ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => setEditing(v)}
                      className="text-zinc-400 hover:text-zinc-700" title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button type="button" onClick={() => handleToggle(v.id)} disabled={toggling === v.id}
                      className="text-zinc-400 hover:text-zinc-700 disabled:opacity-40"
                      title={v.is_active ? "Desactivar" : "Activar"}>
                      {v.is_active
                        ? <ToggleRight size={16} className="text-green-600" />
                        : <ToggleLeft size={16} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <PlatformVerticalFormDialog onClose={() => setShowCreate(false)} />}
      {editing    && <PlatformVerticalFormDialog vertical={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
