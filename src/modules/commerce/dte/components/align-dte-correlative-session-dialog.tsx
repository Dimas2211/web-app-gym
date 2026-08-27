"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — align-dte-correlative-session-dialog.tsx
//
// F3-C24 (corrección de acceso) — Igual a
// platform/align-dte-correlative-dialog.tsx pero ligado a la action
// de sesión (sin organization_id/PlatformOrganization).
// ─────────────────────────────────────────────────────────────────

import { useActionState, useEffect } from "react";
import { X, AlertTriangle } from "lucide-react";

import { alignDteCorrelativeSessionAction } from "../actions/align-dte-correlative-session.action";
import type { DteCorrelativeAlignmentRow } from "../queries/list-dte-correlative-alignment-rows";

interface Props {
  row:     DteCorrelativeAlignmentRow;
  onClose: () => void;
}

export function AlignDteCorrelativeSessionDialog({ row, onClose }: Props) {
  const [state, formAction, isPending] = useActionState(alignDteCorrelativeSessionAction, undefined);

  useEffect(() => {
    if (state && "success" in state && state.success) {
      const t = setTimeout(onClose, 1200);
      return () => clearTimeout(t);
    }
  }, [state, onClose]);

  const localFloor = Math.max(row.local_last_sequence, row.max_used_in_outgoing);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">

        <div className="flex items-center justify-between p-5 border-b border-zinc-100">
          <h2 className="text-base font-bold text-zinc-800">Alinear correlativo DTE</h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form action={formAction} className="p-5 space-y-4">
          <input type="hidden" name="location_id" value={row.location_id} />
          <input type="hidden" name="issuer_config_id" value={row.issuer_config_id} />
          <input type="hidden" name="environment" value={row.environment} />
          <input type="hidden" name="dte_type_code" value={row.dte_type_code} />
          <input type="hidden" name="cod_estable_mh" value={row.cod_estable_mh} />
          <input type="hidden" name="cod_punto_venta_mh" value={row.cod_punto_venta_mh} />

          {state && "error" in state && state.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
              {state.error}
            </div>
          )}
          {state && "success" in state && state.success && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2">
              Baseline registrado. Próximo numeroControl: secuencia {state.next_sequence}.
            </div>
          )}

          <div className="bg-zinc-50 rounded-lg px-4 py-3 text-sm text-zinc-600 space-y-1">
            <div><span className="font-medium">{row.dte_type_label}</span> — {row.location_name} ({row.environment})</div>
            <div>Establecimiento/punto de venta MH: <span className="font-mono">{row.cod_estable_mh}{row.cod_punto_venta_mh}</span></div>
            <div>Correlativo interno actual: <span className="font-semibold">{row.local_last_sequence}</span></div>
            <div>Máximo usado en documentos emitidos: <span className="font-semibold">{row.max_used_in_outgoing}</span></div>
            {row.baseline_last_used_sequence != null && (
              <div>Baseline externo actual: <span className="font-semibold">{row.baseline_last_used_sequence}</span></div>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex gap-2">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Esta acción afecta el siguiente numeroControl que se emitirá ante Hacienda.
              Verifique contra el sistema anterior antes de guardar. No se puede bajar por
              debajo de {localFloor} (lo ya usado localmente).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              Último número usado en el sistema anterior <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="last_used_sequence"
              min={localFloor}
              required
              placeholder={`Ej. ${localFloor}`}
              className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
            {state && "errors" in state && state.errors?.last_used_sequence && (
              <p className="text-xs text-red-600 mt-0.5">{state.errors.last_used_sequence[0]}</p>
            )}
            <p className="text-xs text-zinc-400 mt-1">
              El siguiente numeroControl a emitir será la secuencia inmediatamente posterior a este valor.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Origen del baseline</label>
            <input
              type="text"
              name="source"
              placeholder="Ej. Sistema anterior XYZ, migración inicial…"
              className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              Nota / justificación <span className="text-red-500">*</span>
            </label>
            <textarea
              name="notes"
              rows={3}
              required
              placeholder="Explique la evidencia usada para confirmar este número (ej. reporte del sistema anterior, portal MH, etc.)"
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
            />
            {state && "errors" in state && state.errors?.notes && (
              <p className="text-xs text-red-600 mt-0.5">{state.errors.notes[0]}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Referencia/evidencia (opcional)</label>
            <input
              type="text"
              name="evidence_ref"
              placeholder="Folio, archivo, ticket de soporte…"
              className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
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
              {isPending ? "Guardando…" : "Guardar alineación"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
