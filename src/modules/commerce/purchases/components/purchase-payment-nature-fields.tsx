"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase-payment-nature-fields.tsx
//
// Bloque compartido "Naturaleza del pago y Retención de Renta",
// usado en dos contextos:
//   1. Zone E de la estación de captura (purchase-form-totals.tsx)
//      — ANTES de confirmar, es el flujo principal.
//   2. Panel Fiscal DTE (purchase-dte-fiscal-panel.tsx)
//      — DESPUÉS de confirmar, solo mientras no exista un DTE firmado.
//
// Toda la lógica de cálculo vive en el servidor (income-tax-withholding
// .util.ts vía updatePurchasePaymentNatureAction) — este componente solo
// captura la decisión del usuario y muestra el snapshot fiscal ya
// persistido en PurchaseDetail. Nunca calcula rate/amount en cliente.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { PurchaseDetail } from "../types/purchase.types";
import { updatePurchasePaymentNatureAction } from "../actions/update-purchase-payment-nature.action";
import {
  PAYMENT_NATURE_OPTIONS, SUPPLIER_PERSON_TYPE_LABELS,
} from "../constants/purchase-document.constants";

interface Props {
  detail:    PurchaseDetail;
  editable:  boolean;
  frozenNote?: string; // mensaje mostrado cuando !editable (p.ej. "DTE ya firmado")
  onUpdated: (detail: PurchaseDetail) => void;
  // false en Zone E (purchase-form-totals.tsx) — el panel de Totales ya
  // muestra Gravada/IVA compra/Total, no hace falta repetirlos aquí.
  showCommercialTotals?: boolean;
}

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const lbl = "block text-[10px] font-medium uppercase tracking-wider text-zinc-500 truncate";
const val = "block text-xs text-zinc-200 truncate font-mono";

export function PurchasePaymentNatureFields({
  detail, editable, frozenNote, onUpdated, showCommercialTotals = true,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [natureDraft, setNatureDraft] = useState(detail.payment_nature ?? "");
  const [baseDraft, setBaseDraft] = useState(
    detail.payment_nature === "GOODS_AND_SERVICES" ? String(detail.income_tax_withholding_base) : "",
  );

  const supplierFiscal = detail.supplier_fiscal;

  function handleSave() {
    if (natureDraft === "") return;
    setError(null);
    const manualBase = natureDraft === "GOODS_AND_SERVICES"
      ? (baseDraft.trim() === "" ? null : Number(baseDraft))
      : null;
    startTransition(async () => {
      const result = await updatePurchasePaymentNatureAction(detail.id, natureDraft, manualBase);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onUpdated(result.detail);
    });
  }

  return (
    <div className="border border-zinc-800 rounded bg-zinc-950/40 px-2.5 py-2 space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        Naturaleza del pago y Retención de Renta
      </span>

      {error && (
        <p className="text-[11px] text-red-400 bg-red-900/30 border border-red-700/40 rounded px-2 py-1">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-y-1.5">
        <div className="min-w-0">
          <span className={lbl}>Naturaleza del pago</span>
          {editable ? (
            <select
              value={natureDraft}
              onChange={(e) => { setNatureDraft(e.target.value); if (e.target.value !== "GOODS_AND_SERVICES") setBaseDraft(""); }}
              disabled={isPending}
              className="w-full h-7 text-xs bg-zinc-900 border border-zinc-700 rounded px-1.5 text-zinc-200"
            >
              <option value="">— Sin definir —</option>
              {PAYMENT_NATURE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <span className={val}>
              {detail.payment_nature
                ? PAYMENT_NATURE_OPTIONS.find((o) => o.value === detail.payment_nature)?.label ?? detail.payment_nature
                : "— Sin definir —"}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <span className={lbl}>Clasificación del proveedor</span>
          <span className={val}>{SUPPLIER_PERSON_TYPE_LABELS[supplierFiscal.person_type] ?? supplierFiscal.person_type}</span>
        </div>

        {natureDraft === "GOODS_AND_SERVICES" && (
          <div className="min-w-0">
            <span className={lbl}>Monto correspondiente a servicios</span>
            {editable ? (
              <input
                type="number"
                min={0}
                step="0.01"
                value={baseDraft}
                onChange={(e) => setBaseDraft(e.target.value)}
                disabled={isPending}
                className="w-full h-7 text-xs bg-zinc-900 border border-zinc-700 rounded px-1.5 text-zinc-200 font-mono"
              />
            ) : (
              <span className={val}>{money(detail.income_tax_withholding_base)}</span>
            )}
          </div>
        )}

        {editable && (
          <button
            type="button"
            disabled={isPending || natureDraft === ""}
            onClick={handleSave}
            className="h-7 px-2 text-xs text-emerald-400 hover:text-emerald-200 border border-emerald-800/50 hover:border-emerald-600 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-start"
          >
            {isPending && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
            Guardar naturaleza
          </button>
        )}
      </div>

      {supplierFiscal.person_type === "UNKNOWN" &&
        (natureDraft === "SERVICES" || natureDraft === "LUMP_SUM_CONTRACT" || natureDraft === "GOODS_AND_SERVICES") && (
        <p className="text-[10px] text-amber-400">
          ⚠ El proveedor no tiene clasificación persona natural/jurídica definida. Al guardar, el sistema
          bloqueará la retención automática hasta que clasifique al proveedor (o elija Naturaleza = Otro si no corresponde).
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 border-t border-zinc-800/60">
        {showCommercialTotals && (
          <>
            <div className="min-w-0"><span className={lbl}>Total compra</span><span className={val}>{money(detail.subtotal)}</span></div>
            <div className="min-w-0"><span className={lbl}>IVA compra</span><span className={val}>{money(detail.tax_amount)}</span></div>
          </>
        )}
        <div className="min-w-0"><span className={lbl}>Base sujeta a Renta</span><span className={val}>{money(detail.income_tax_withholding_base)}</span></div>
        <div className="min-w-0">
          <span className={lbl}>Retención Renta{detail.income_tax_withholding_rate != null ? ` (${detail.income_tax_withholding_rate}%)` : ""}</span>
          <span className={val}>{detail.income_tax_withholding_applies ? money(detail.income_tax_withholding_amount) : "No aplica"}</span>
        </div>
        <div className="min-w-0 col-span-2">
          <span className={lbl}>Neto a pagar</span>
          <span className="block text-xs text-zinc-100 font-mono font-semibold">
            {money(
              detail.subtotal
              - (detail.retention_1pct_applies ? detail.retention_1pct_amount : 0)
              - (detail.income_tax_withholding_applies ? detail.income_tax_withholding_amount : 0),
            )}
          </span>
        </div>
      </div>

      {!editable && frozenNote && (
        <p className="text-[10px] text-zinc-600">{frozenNote}</p>
      )}
    </div>
  );
}
