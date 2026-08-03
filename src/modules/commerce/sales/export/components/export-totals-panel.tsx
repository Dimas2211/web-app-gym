"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-totals-panel.tsx
//
// F3-C21B — Columna derecha fija: resumen de totales + acción
// principal "Crear venta de exportación". Una vez creada la venta,
// el panel DTE (export-sale-dte-panel.tsx) se embebe debajo, en la
// misma columna — nunca al final de una página larga.
// ─────────────────────────────────────────────────────────────────

import { Loader2, Plus, CheckCircle2, PlusCircle } from "lucide-react";
import { ExportSaleDtePanel } from "./export-sale-dte-panel";
import type { ExportDteState } from "../actions/export-sale-dte.actions";

interface Props {
  subtotal:  number;
  insurance: number;
  freight:   number;
  total:     number;
  lineCount: number;

  hasCustomer: boolean;
  pending:     boolean;

  created:  { sale_code: string } | null;
  dteState: ExportDteState | null;

  onCreate:  () => void;
  onNewSale: () => void;
}

const rowCls   = "flex justify-between items-baseline py-0.5";
const labelCls = "text-[11px] text-zinc-400";

function fmtAmt(n: number) {
  return `$${n.toLocaleString("es-SV", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ExportTotalsPanel({
  subtotal, insurance, freight, total, lineCount,
  hasCustomer, pending,
  created, dteState,
  onCreate, onNewSale,
}: Props) {
  const hasLines  = lineCount > 0;
  const valueCls  = hasLines ? "text-[11px] font-mono text-zinc-300" : "text-[11px] font-mono text-zinc-600";
  const canCreate = !created && hasCustomer && hasLines && !pending;

  return (
    <div className="flex h-full flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-900">
      <div className="px-3 pt-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2 block">
          Resumen
        </span>

        <div className="space-y-0.5">
          <div className={rowCls}>
            <span className={labelCls}>Subtotal líneas</span>
            <span className={valueCls}>{fmtAmt(subtotal)}</span>
          </div>
          <div className={rowCls}>
            <span className={labelCls}>Seguro</span>
            <span className={valueCls}>{fmtAmt(insurance)}</span>
          </div>
          <div className={rowCls}>
            <span className={labelCls}>Flete</span>
            <span className={valueCls}>{fmtAmt(freight)}</span>
          </div>
          <div className="border-t border-zinc-700 my-1.5" />
          <div className={rowCls}>
            <span className="text-[11px] font-semibold text-zinc-500">Total</span>
            <span className={`text-sm font-semibold font-mono ${hasLines ? "text-zinc-100" : "text-zinc-600"}`}>
              {fmtAmt(total)}
            </span>
          </div>
        </div>

        <div className="my-3 space-y-1.5">
          {!created && !hasCustomer && (
            <p className="text-[10px] text-amber-500/80 leading-snug">
              Selecciona un receptor extranjero antes de crear la venta.
            </p>
          )}
          {!created && hasCustomer && !hasLines && (
            <p className="text-[10px] text-amber-500/70 leading-snug">
              Agrega al menos un producto.
            </p>
          )}
          {created && (
            <p className="flex items-center gap-1 text-[10px] text-emerald-400/90 leading-snug">
              <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
              Venta creada: {created.sale_code}
            </p>
          )}
        </div>

        {!created ? (
          <button
            type="button"
            onClick={onCreate}
            disabled={!canCreate}
            className="w-full h-9 text-xs font-semibold rounded flex items-center justify-center gap-1.5 transition-colors
              enabled:bg-emerald-600 enabled:hover:bg-emerald-500 enabled:text-white
              disabled:bg-emerald-900/30 disabled:text-emerald-800 disabled:cursor-not-allowed"
          >
            {pending
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Creando…</>
              : <><Plus className="h-3.5 w-3.5" />Crear venta de exportación</>
            }
          </button>
        ) : (
          <button
            type="button"
            onClick={onNewSale}
            className="w-full h-9 text-xs font-semibold rounded flex items-center justify-center gap-1.5 transition-colors bg-blue-700 hover:bg-blue-600 text-white"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Nueva venta de exportación
          </button>
        )}
      </div>

      {created && dteState && (
        <ExportSaleDtePanel key={dteState.dte_document_id} initialState={dteState} />
      )}
    </div>
  );
}
