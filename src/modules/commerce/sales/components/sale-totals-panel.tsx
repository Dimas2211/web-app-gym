"use client";

import { Loader2, Save, RotateCcw, X } from "lucide-react";

interface Props {
  isSaving:  boolean;
  hasDraft:  boolean;
  onSave:    () => void;
  onBack:    () => void;
  onClear:   () => void;
  onCancel:  () => void;
}

const rowCls   = "flex justify-between items-baseline py-0.5";
const labelCls = "text-[11px] text-zinc-400";
const valueCls = "text-[11px] font-mono text-zinc-600";

export function SaleTotalsPanel({ isSaving, hasDraft, onSave, onBack, onClear, onCancel }: Props) {
  return (
    <div className="flex flex-col h-full border-l border-zinc-800 bg-zinc-900 px-3 pt-3 pb-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
        Totales
      </span>

      <div className="space-y-0.5">
        <div className={rowCls}>
          <span className={labelCls}>Subtotal</span>
          <span className={valueCls}>$0.00</span>
        </div>
        <div className={rowCls}>
          <span className={labelCls}>Descuentos</span>
          <span className={valueCls}>$0.00</span>
        </div>
        <div className={rowCls}>
          <span className={labelCls}>IVA (13%)</span>
          <span className={valueCls}>$0.00</span>
        </div>
        <div className="border-t border-zinc-700 my-1.5" />
        <div className={rowCls}>
          <span className="text-[11px] font-semibold text-zinc-500">Total</span>
          <span className="text-sm font-semibold font-mono text-zinc-600">$0.00</span>
        </div>
      </div>

      <div className="space-y-1 my-3">
        <p className="text-[10px] text-amber-500/70 leading-snug">
          La venta aún no tiene líneas.
        </p>
        <p className="text-[10px] text-zinc-600 leading-snug">
          Productos: Fase 4D.
        </p>
        <p className="text-[10px] text-zinc-600 leading-snug">
          Confirmación: Fase 5.
        </p>
      </div>

      <div className="space-y-1.5 mt-auto">
        {/* Confirmar — siempre deshabilitado en esta fase */}
        <button
          type="button"
          disabled
          className="w-full h-8 text-xs font-medium bg-emerald-900/30 text-emerald-800 rounded flex items-center justify-center gap-1 cursor-not-allowed opacity-50"
        >
          Confirmar venta
        </button>

        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="w-full h-7 text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded flex items-center justify-center gap-1 disabled:opacity-40 transition-colors"
        >
          {isSaving
            ? <><Loader2 className="h-3 w-3 animate-spin" />Guardando…</>
            : <><Save className="h-3 w-3" />{hasDraft ? "Actualizar" : "Guardar"}</>
          }
        </button>

        <button
          type="button"
          onClick={onClear}
          className="w-full h-7 text-[11px] border border-zinc-700 rounded text-zinc-500 hover:text-amber-400 flex items-center justify-center gap-1 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          Limpiar
        </button>

        {hasDraft && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full h-7 text-[11px] border border-red-900/40 rounded text-red-600/70 hover:text-red-400 flex items-center justify-center gap-1 transition-colors"
          >
            <X className="h-3 w-3" />
            Cancelar borrador
          </button>
        )}

        <button
          type="button"
          onClick={onBack}
          className="w-full h-7 text-[11px] border border-zinc-700 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Volver a ventas
        </button>
      </div>
    </div>
  );
}
