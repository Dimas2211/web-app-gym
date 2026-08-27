"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-configure-mh-unit-modal.tsx
//
// F3-C23E — Salida operativa para productos/servicios sin unidad MH
// (CAT-014) configurada. No bloquea al usuario para siempre: permite
// elegir un código CAT-014 válido y asignarlo a la unidad del
// producto sin salir del flujo de venta de exportación. Servicios NO
// quedan bloqueados por ser servicios — solo necesitan una unidad MH
// válida, igual que cualquier producto.
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Loader2, X, AlertTriangle } from "lucide-react";
import { CAT014_UNITS } from "../../../../../../prisma/seeds/data/cat014-units";
import { getUnitMhContextAction, configureExportUnitMhCodeAction } from "../actions/export-sale.actions";
import type { ExportProductLookup } from "../queries/search-export-products";

interface Props {
  product:      ExportProductLookup;
  onClose:      () => void;
  onConfigured: (mh_unit_code: string) => void;
}

const selectCls =
  "w-full h-8 rounded border border-zinc-700 bg-zinc-800 px-2.5 text-xs text-zinc-100 " +
  "focus:outline-none focus:border-zinc-500";

export function ExportConfigureMhUnitModal({ product, onClose, onConfigured }: Props) {
  const [loading, setLoading]           = useState(true);
  const [sharedCount, setSharedCount]   = useState<number | null>(null);
  const [selected, setSelected]         = useState<string>("");
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!product.unit_id) {
      setError("Este producto no tiene una unidad de medida asignada. Configure la unidad desde el maestro de productos primero.");
      setLoading(false);
      return;
    }
    (async () => {
      const result = await getUnitMhContextAction(product.unit_id!);
      if (cancelled) return;
      if (!result.ok) { setError(result.error); setLoading(false); return; }
      setSharedCount(result.context.shared_product_count);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [product.unit_id]);

  async function handleSave() {
    if (!product.unit_id || !selected) return;
    setSaving(true);
    setError(null);
    try {
      const result = await configureExportUnitMhCodeAction(product.unit_id, selected);
      if (!result.ok) { setError(result.error); return; }
      onConfigured(result.mh_unit_code);
    } finally {
      setSaving(false);
    }
  }

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8"
      onClick={handleBackdrop}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">Configurar unidad MH (CAT-014)</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          <p className="text-xs text-zinc-400 leading-relaxed">
            <span className="font-medium text-zinc-200">{product.name}</span> usa la unidad{" "}
            <span className="font-mono text-zinc-300">{product.unit_name ?? product.unit_symbol ?? "—"}</span>,
            que todavía no tiene código de unidad de medida MH (CAT-014) asignado. Este código es obligatorio
            para generar el DTE de exportación (FEX 11) — no importa si el ítem es un producto físico o un
            servicio.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando contexto de la unidad…
            </div>
          ) : (
            <>
              {sharedCount != null && sharedCount > 1 && (
                <div className="flex items-start gap-1.5 rounded border border-amber-800/50 bg-amber-900/20 px-2.5 py-2 text-[11px] text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 flex-none mt-0.5" />
                  <span>
                    Esta unidad la comparten <strong>{sharedCount}</strong> productos en total. Asignar un
                    código MH aquí lo asigna a la unidad completa (afecta a todos ellos), no solo a este
                    ítem.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-[10px] text-zinc-500 mb-1">Código CAT-014</label>
                <select className={selectCls} value={selected} onChange={(e) => setSelected(e.target.value)}>
                  <option value="">Seleccionar unidad MH…</option>
                  {CAT014_UNITS.map((u) => (
                    <option key={u.mh_code} value={u.mh_code}>
                      {u.mh_code} — {u.name} ({u.symbol})
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {error && (
            <div className="rounded border border-red-700/50 bg-red-950/30 px-2.5 py-2 text-[11px] text-red-300 whitespace-pre-wrap">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-xs text-zinc-400 border border-zinc-700 rounded hover:text-zinc-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || !selected}
            className="h-8 px-4 flex items-center gap-1.5 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Asignar unidad MH
          </button>
        </div>
      </div>
    </div>
  );
}
