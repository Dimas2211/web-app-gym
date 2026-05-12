"use client";

import { Loader2, Save, RotateCcw, X, CheckCircle } from "lucide-react";

interface SaleTotalsData {
  subtotal:        number;
  discount_amount: number;
  tax_amount:      number;
  total_amount:    number;
}

interface Props {
  isSaving:      boolean;
  hasDraft:      boolean;
  onSave:        () => void;
  onBack:        () => void;
  onClear:       () => void;
  onCancel:      () => void;
  totals?:       SaleTotalsData | null;
  // Confirmación
  canConfirm?:   boolean;
  isConfirming?: boolean;
  isReadOnly?:   boolean;
  onConfirm?:    () => void;
}

const rowCls   = "flex justify-between items-baseline py-0.5";
const labelCls = "text-[11px] text-zinc-400";

function fmtAmt(n: number) {
  return `$${n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SaleTotalsPanel({
  isSaving,
  hasDraft,
  onSave,
  onBack,
  onClear,
  onCancel,
  totals,
  canConfirm   = false,
  isConfirming = false,
  isReadOnly   = false,
  onConfirm,
}: Props) {
  const subtotal  = totals?.subtotal        ?? 0;
  const discounts = totals?.discount_amount ?? 0;
  const tax       = totals?.tax_amount      ?? 0;
  const total     = totals?.total_amount    ?? 0;
  const hasLines  = total > 0 || subtotal > 0;

  const valueCls = hasLines ? "text-[11px] font-mono text-zinc-300" : "text-[11px] font-mono text-zinc-600";

  return (
    <div className="flex flex-col h-full border-l border-zinc-800 bg-zinc-900 px-3 pt-3 pb-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
        Totales
      </span>

      <div className="space-y-0.5">
        <div className={rowCls}>
          <span className={labelCls}>Subtotal</span>
          <span className={valueCls}>{fmtAmt(subtotal)}</span>
        </div>
        <div className={rowCls}>
          <span className={labelCls}>Descuentos</span>
          <span className={valueCls}>{fmtAmt(discounts)}</span>
        </div>
        <div className={rowCls}>
          <span className={labelCls}>IVA</span>
          <span className={valueCls}>{fmtAmt(tax)}</span>
        </div>
        <div className="border-t border-zinc-700 my-1.5" />
        <div className={rowCls}>
          <span className="text-[11px] font-semibold text-zinc-500">Total</span>
          <span className={`text-sm font-semibold font-mono ${hasLines ? "text-zinc-100" : "text-zinc-600"}`}>
            {fmtAmt(total)}
          </span>
        </div>
      </div>

      <div className="my-3">
        {!isReadOnly && !hasLines && (
          <p className="text-[10px] text-amber-500/70 leading-snug">
            La venta aún no tiene líneas.
          </p>
        )}
        {isReadOnly && (
          <p className="text-[10px] text-emerald-500/70 leading-snug flex items-center gap-1">
            <CheckCircle className="h-3 w-3 flex-shrink-0" />
            Venta confirmada. Solo lectura.
          </p>
        )}
      </div>

      <div className="space-y-1.5 mt-auto">
        {/* Botón Confirmar venta */}
        {!isReadOnly && (
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm || isConfirming || isSaving}
            title={!canConfirm ? "Agrega productos antes de confirmar." : undefined}
            className="w-full h-8 text-xs font-medium rounded flex items-center justify-center gap-1 transition-colors
              enabled:bg-emerald-700 enabled:hover:bg-emerald-600 enabled:text-white
              disabled:bg-emerald-900/30 disabled:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isConfirming
              ? <><Loader2 className="h-3 w-3 animate-spin" />Confirmando…</>
              : <><CheckCircle className="h-3 w-3" />Confirmar venta</>
            }
          </button>
        )}

        {/* Botones de borrador — solo en modo edición */}
        {!isReadOnly && (
          <>
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
          </>
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
