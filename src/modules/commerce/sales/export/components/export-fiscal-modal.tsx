"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-fiscal-modal.tsx
//
// F3-C21B — Modal de datos fiscales de exportación (SaleExportDetails).
// Antes vivía como card larga en la pantalla principal; ahora es
// captura secundaria en modal, con solo un resumen compacto visible
// en la barra operativa (ver export-top-bar.tsx).
// ─────────────────────────────────────────────────────────────────

import { X } from "lucide-react";
import {
  FEX_INCOTERMS, FEX_REGIMES, FEX_FISCAL_PRECINCTS, FEX_ITEM_TYPE_EXPORT,
} from "../utils/fex-catalogs";

export interface FiscalData {
  itemTypeExport: 1 | 2 | 3;
  fiscalPrecinct: string;
  regimeCode: string;
  incotermCode: string;
  incotermDesc: string;
  insurance: number;
  freight: number;
}

interface Props {
  data: FiscalData;
  onChange: (patch: Partial<FiscalData>) => void;
  onClose: () => void;
}

const inputCls =
  "w-full h-8 rounded border border-zinc-700 bg-zinc-800 px-2.5 text-xs text-zinc-100 " +
  "focus:outline-none focus:border-zinc-500";
const labelCls = "block text-[10px] text-zinc-500 mb-1";

export function ExportFiscalModal({ data, onChange, onClose }: Props) {
  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8"
      onClick={handleBackdrop}
      onKeyDown={handleKeyDown}
    >
      <div className="w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">

        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">Datos fiscales de exportación</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 grid grid-cols-2 gap-x-3 gap-y-3">
          <div className="col-span-2">
            <label className={labelCls}>Tipo de ítem exportado</label>
            <select
              className={inputCls}
              value={data.itemTypeExport}
              onChange={(e) => onChange({ itemTypeExport: Number(e.target.value) as 1 | 2 | 3 })}
            >
              {FEX_ITEM_TYPE_EXPORT.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </div>

          {data.itemTypeExport !== 2 && (
            <>
              <div>
                <label className={labelCls}>Recinto fiscal (CAT-027)</label>
                <select className={inputCls} value={data.fiscalPrecinct}
                  onChange={(e) => onChange({ fiscalPrecinct: e.target.value })}>
                  {FEX_FISCAL_PRECINCTS.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Régimen (CAT-028)</label>
                <select className={inputCls} value={data.regimeCode}
                  onChange={(e) => onChange({ regimeCode: e.target.value })}>
                  {FEX_REGIMES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                </select>
              </div>
            </>
          )}

          <div className={data.itemTypeExport !== 2 ? "" : "col-span-2"}>
            <label className={labelCls}>INCOTERM (CAT-031)</label>
            <select
              className={inputCls}
              value={data.incotermCode}
              onChange={(e) => {
                const inc = FEX_INCOTERMS.find((i) => i.code === e.target.value);
                onChange({ incotermCode: e.target.value, incotermDesc: inc?.label ?? "" });
              }}
            >
              {FEX_INCOTERMS.map((i) => <option key={i.code} value={i.code}>{i.label}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>Seguro (USD)</label>
            <input type="number" min={0} step="0.01" className={inputCls} value={data.insurance}
              onChange={(e) => onChange({ insurance: Number(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>Flete (USD)</label>
            <input type="number" min={0} step="0.01" className={inputCls} value={data.freight}
              onChange={(e) => onChange({ freight: Number(e.target.value) })} />
          </div>
        </div>

        <div className="flex justify-end border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
