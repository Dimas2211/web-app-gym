"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase-form-totals.tsx
//
// Zone E: panel lateral de totales + botones de acción.
// Muestra gravada, IVA, total, retención IVA 1% y neto a pagar
// a partir del PurchaseDetail más reciente.
// ─────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Loader2, CheckCircle, RotateCcw } from "lucide-react";
import type { PurchaseDetail } from "../types/purchase.types";

interface Props {
  detail:       PurchaseDetail | null;
  purchaseId:   string | null;
  isConfirming: boolean;
  confirmError: string | null;
  onConfirm:    () => void;
  onBack:       () => void;
  onClear:      () => void;
}

const rowCls   = "flex justify-between items-baseline py-0.5";
const labelCls = "text-[11px] text-zinc-400";
const valueCls = "text-[11px] font-mono text-zinc-200";
const boldCls  = "text-sm font-semibold font-mono text-zinc-100";

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

export function PurchaseFormTotals({
  detail,
  purchaseId,
  isConfirming,
  confirmError,
  onConfirm,
  onBack,
  onClear,
}: Props) {
  const sub     = detail ? Number(detail.subtotal)              : 0;
  const tax     = detail ? Number(detail.tax_amount)            : 0;
  const total   = detail ? Number(detail.total_amount)          : 0;
  const ret1    = detail ? Number(detail.retention_1pct_amount) : 0;
  const net     = detail ? Number(detail.net_to_pay)            : 0;
  const applies = detail?.retention_1pct_applies ?? false;
  const hasItems = (detail?.items?.length ?? 0) > 0;

  return (
    <div className="flex flex-col h-full border-l border-zinc-800 bg-zinc-900 px-3 pt-3 pb-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
        Totales
      </span>

      <div className="flex-1 space-y-0.5">
        <div className={rowCls}>
          <span className={labelCls}>Exenta</span>
          <span className={`${valueCls} text-zinc-600`}>$0.00</span>
        </div>
        <div className={rowCls}>
          <span className={labelCls}>Gravada</span>
          <span className={valueCls}>{fmt(sub)}</span>
        </div>
        <div className={rowCls}>
          <span className={labelCls}>IVA (13%)</span>
          <span className={valueCls}>{fmt(tax)}</span>
        </div>

        <div className="border-t border-zinc-700 my-1.5" />

        <div className={rowCls}>
          <span className="text-[11px] font-semibold text-zinc-300">Total</span>
          <span className={boldCls}>{fmt(total)}</span>
        </div>

        {applies && (
          <div className={rowCls}>
            <span className={`${labelCls} text-amber-500`}>Ret. IVA 1%</span>
            <span className={`font-mono text-[11px] text-amber-400`}>−{fmt(ret1)}</span>
          </div>
        )}

        {applies && (
          <>
            <div className="border-t border-zinc-700 my-1.5" />
            <div className={rowCls}>
              <span className="text-[11px] font-semibold text-zinc-300">Neto a pagar</span>
              <span className={boldCls}>{fmt(net)}</span>
            </div>
          </>
        )}
      </div>

      {confirmError && (
        <p className="text-[10px] text-red-400 bg-red-900/30 border border-red-700/30 rounded px-1.5 py-1 mb-2">
          {confirmError}
        </p>
      )}

      <div className="space-y-1.5 mt-2">
        <button
          type="button"
          disabled={!purchaseId || isConfirming || !hasItems}
          onClick={onConfirm}
          className="w-full h-8 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded flex items-center justify-center gap-1 disabled:opacity-40 transition-colors"
        >
          {isConfirming ? (
            <><Loader2 className="h-3 w-3 animate-spin" />Confirmando…</>
          ) : (
            <><CheckCircle className="h-3 w-3" />Confirmar compra</>
          )}
        </button>

        <button
          type="button"
          onClick={onClear}
          className="w-full h-7 text-[11px] border border-zinc-700 rounded text-zinc-500 hover:text-amber-400 flex items-center justify-center gap-1 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          Limpiar compra
        </button>

        <Link
          href="/dashboard/purchases/import"
          className="w-full h-7 text-[11px] border border-blue-800/60 rounded text-blue-400 hover:text-blue-200 hover:border-blue-600 transition-colors flex items-center justify-center"
        >
          Importar DTE
        </Link>

        <button
          type="button"
          onClick={onBack}
          className="w-full h-7 text-[11px] border border-zinc-700 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Volver a compras
        </button>
      </div>
    </div>
  );
}
