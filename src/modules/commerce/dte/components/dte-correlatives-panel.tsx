"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-correlatives-panel.tsx
//
// F3-C24 (corrección de acceso) — Panel "Alineación de correlativos
// DTE" para /dashboard/dte/correlatives, ligado al contexto operativo
// (tenant/location de la sesión), sin depender de PlatformOrganization.
// Estructura y comportamiento idénticos a
// platform/platform-dte-correlative-panel.tsx.
// ─────────────────────────────────────────────────────────────────

import { useState } from "react";
import { ShieldAlert } from "lucide-react";

import { AlignDteCorrelativeSessionDialog } from "./align-dte-correlative-session-dialog";
import type { DteCorrelativeAlignmentRow } from "../queries/list-dte-correlative-alignment-rows";

interface Props {
  rows: DteCorrelativeAlignmentRow[];
}

export function DteCorrelativesPanel({ rows }: Props) {
  const [editingRow, setEditingRow] = useState<DteCorrelativeAlignmentRow | null>(null);

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-100 flex items-center gap-2">
        <ShieldAlert size={16} className="text-zinc-400" />
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Alineación de correlativos DTE ({rows.length})
        </h2>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-400 p-5">
          No hay configuración de emisor DTE activa (con códigos MH completos) para este tenant.
          Configure el emisor DTE (cod_estable_mh/cod_punto_venta_mh) antes de alinear correlativos.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100">
                <th className="text-left px-4 py-2 text-xs font-semibold text-zinc-500">Tipo DTE</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-zinc-500">Sucursal / Ambiente</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-zinc-500">Establ./PV MH</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-zinc-500">Correlativo interno</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-zinc-500">Máx. en emitidos</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-zinc-500">Baseline externo</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-zinc-500">Próximo #</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-zinc-500 w-[110px]"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.issuer_config_id}-${row.dte_type_code}`}
                  className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/50"
                >
                  <td className="px-4 py-2 text-zinc-700">{row.dte_type_label}</td>
                  <td className="px-4 py-2 text-zinc-600">{row.location_name} · {row.environment}</td>
                  <td className="px-4 py-2 font-mono text-xs text-zinc-500">{row.cod_estable_mh}{row.cod_punto_venta_mh}</td>
                  <td className="px-4 py-2 text-right text-zinc-700">{row.local_last_sequence}</td>
                  <td className="px-4 py-2 text-right text-zinc-700">{row.max_used_in_outgoing}</td>
                  <td className="px-4 py-2 text-right text-zinc-700">
                    {row.baseline_last_used_sequence != null ? row.baseline_last_used_sequence : (
                      <span className="text-zinc-300">— sin alinear —</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-zinc-900">{row.next_sequence}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingRow(row)}
                      className="text-xs font-semibold text-zinc-700 border border-zinc-200 rounded-lg px-3 py-1.5 hover:bg-zinc-100 transition-colors"
                    >
                      Alinear
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingRow && (
        <AlignDteCorrelativeSessionDialog
          row={editingRow}
          onClose={() => setEditingRow(null)}
        />
      )}
    </div>
  );
}
