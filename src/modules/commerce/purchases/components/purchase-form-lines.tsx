"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase-form-lines.tsx
//
// Zones B + C: strip de captura rápida de línea (B) +
// grilla de líneas existentes con botón eliminar (C).
//
// Zone B: pre-rellena desde selectedProduct, el usuario ajusta
//         cantidad y costo antes de presionar Agregar.
// Zone C: tabla de PurchaseItemDetail con trash por fila.
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { Trash2, Plus, Loader2 } from "lucide-react";
import type { PurchaseDetail, ProductForPurchaseLookup } from "../types/purchase.types";
import {
  addPurchaseItemAction,
  removePurchaseItemAction,
} from "../actions/manage-purchase-items.action";

interface Props {
  purchaseId:      string | null;
  detail:          PurchaseDetail | null;
  selectedProduct: ProductForPurchaseLookup | null;
  clearVersion:    number;
  onRefresh:       () => Promise<void> | void;
  onClearProduct:  () => void;
  onItemAdded:     (detail: PurchaseDetail) => void;
}

interface LineForm {
  product_id:   string;
  product_code: string;
  product_name: string;
  unit_symbol:  string;
  quantity:     string;
  unit_cost:    string;
  tax_rate_pct: number;   // tasa del TaxRate en la base (%), solo UI
  tax_amount:   string;   // calculado: subtotal * (tax_rate_pct/100), enviado al backend
}

const EMPTY_LINE: LineForm = {
  product_id: "", product_code: "", product_name: "",
  unit_symbol: "", quantity: "1", unit_cost: "",
  tax_rate_pct: 13, tax_amount: "",
};

function computeTax(quantity: string, unitCost: string, ratePct: number): string {
  const q = parseFloat(quantity) || 0;
  const c = parseFloat(unitCost) || 0;
  if (q <= 0 || c <= 0) return "";
  const tax = Math.round(q * c * (ratePct / 100) * 100) / 100;
  return tax.toFixed(2);
}

const inCls  = "h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 w-full";
const numCls = `${inCls} font-mono text-right`;

export function PurchaseFormLines({
  purchaseId,
  detail,
  selectedProduct,
  clearVersion,
  onRefresh,
  onClearProduct,
  onItemAdded,
}: Props) {
  const [line,        setLine]        = useState<LineForm>(EMPTY_LINE);
  const [addError,    setAddError]    = useState<string | null>(null);
  const [addPending,  setAddPending]  = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const quantityRef = useRef<HTMLInputElement>(null);
  const costRef     = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setLine(EMPTY_LINE);
    setAddError(null);
    setAddPending(false);
    setRemovingIds(new Set());
  }, [clearVersion]);

  // Pre-fill strip when product selected from Zone D; auto-focus quantity
  useEffect(() => {
    if (!selectedProduct) return;
    const cost    = selectedProduct.cost_price ?? 0;
    const ratePct = selectedProduct.tax_rate   ?? 13;   // tasa desde TaxRate en la base
    setLine({
      product_id:   selectedProduct.id,
      product_code: selectedProduct.product_code,
      product_name: selectedProduct.name,
      unit_symbol:  selectedProduct.unit_symbol,
      quantity:     "1",
      unit_cost:    cost > 0 ? String(cost) : "",
      tax_rate_pct: ratePct,
      tax_amount:   cost > 0 ? computeTax("1", String(cost), ratePct) : "",
    });
    setAddError(null);
    setTimeout(() => quantityRef.current?.focus(), 0);
  }, [selectedProduct]);

  const handleAddLine = useCallback(async () => {
    if (!purchaseId || addPending) return;
    setAddError(null);
    setAddPending(true);

    const fd = new FormData();
    fd.set("purchase_id", purchaseId);
    fd.set("product_id",  line.product_id);
    fd.set("quantity",    line.quantity);
    fd.set("unit_cost",   line.unit_cost);
    fd.set("tax_amount",  line.tax_amount);

    try {
      const result = await addPurchaseItemAction(undefined, fd);
      if (result && "error" in result && result.error) {
        setAddError(result.error);
      } else if (result && "errors" in result && result.errors) {
        const first = Object.values(result.errors)[0]?.[0];
        setAddError(first ?? "Error al agregar la línea.");
      } else if (result && "ok" in result && result.ok && result.detail) {
        onItemAdded(result.detail);
        setLine(EMPTY_LINE);
        onClearProduct();
      } else {
        setLine(EMPTY_LINE);
        onClearProduct();
        await onRefresh();
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Error inesperado al agregar la línea.");
    } finally {
      setAddPending(false);
    }
  }, [purchaseId, addPending, line, onClearProduct, onRefresh, onItemAdded]);

  const focusAddButton = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); addButtonRef.current?.focus(); }
    },
    [],
  );

  async function handleRemoveLine(itemId: string) {
    if (!purchaseId) return;
    setRemovingIds((prev) => new Set(prev).add(itemId));
    const fd = new FormData();
    fd.set("purchase_id", purchaseId);
    fd.set("item_id",     itemId);
    const result = await removePurchaseItemAction(undefined, fd);
    setRemovingIds((prev) => { const s = new Set(prev); s.delete(itemId); return s; });
    if (result && "ok" in result && result.ok && result.detail) {
      onItemAdded(result.detail);
    } else {
      await onRefresh();
    }
  }

  const items = detail?.items ?? [];
  const canAdd = !!purchaseId && !!line.product_id && !!line.quantity && !!line.unit_cost;

  return (
    <div className="flex flex-col h-full">

      {/* ── Zone B: Quick-add strip ─────────────────────────────── */}
      <div className="flex-none border-b border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <div className="flex items-end gap-2">

          {/* Código */}
          <div className="w-24 shrink-0">
            <span className="block text-[10px] text-zinc-500 mb-0.5">Código</span>
            <input
              type="text"
              value={line.product_code}
              readOnly
              placeholder="Código"
              tabIndex={-1}
              className={`${inCls} text-zinc-400`}
            />
          </div>

          {/* Nombre */}
          <div className="flex-1 min-w-0">
            <span className="block text-[10px] text-zinc-500 mb-0.5">Producto</span>
            <input
              type="text"
              value={line.product_name}
              readOnly
              placeholder="← Seleccionar en panel inferior"
              tabIndex={-1}
              className={`${inCls} text-zinc-400`}
            />
          </div>

          {/* Unidad */}
          <div className="w-12 shrink-0">
            <span className="block text-[10px] text-zinc-500 mb-0.5 text-center">Unidad</span>
            <div className="h-7 flex items-center justify-center text-xs text-zinc-500 truncate">
              {line.unit_symbol || "—"}
            </div>
          </div>

          {/* Cantidad */}
          <div className="w-20 shrink-0">
            <span className="block text-[10px] text-zinc-500 mb-0.5">Cantidad</span>
            <input
              ref={quantityRef}
              type="number"
              min="0.001"
              step="any"
              value={line.quantity}
              onChange={(e) =>
                setLine((l) => ({
                  ...l,
                  quantity:   e.target.value,
                  tax_amount: computeTax(e.target.value, l.unit_cost, l.tax_rate_pct),
                }))
              }
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); costRef.current?.focus(); }
              }}
              placeholder="Cant."
              className={numCls}
            />
          </div>

          {/* Costo unitario */}
          <div className="w-24 shrink-0">
            <span className="block text-[10px] text-zinc-500 mb-0.5">Costo unitario</span>
            <input
              ref={costRef}
              type="number"
              min="0"
              step="0.01"
              value={line.unit_cost}
              onChange={(e) =>
                setLine((l) => ({
                  ...l,
                  unit_cost:  e.target.value,
                  tax_amount: computeTax(l.quantity, e.target.value, l.tax_rate_pct),
                }))
              }
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={focusAddButton}
              placeholder="Costo u."
              className={numCls}
            />
          </div>

          {/* IVA — calculado automáticamente, no editable */}
          <div className="w-20 shrink-0">
            <span className="block text-[10px] text-zinc-500 mb-0.5">IVA</span>
            <input
              type="text"
              value={line.tax_amount ? `$${Number(line.tax_amount).toFixed(2)}` : "—"}
              readOnly
              tabIndex={-1}
              placeholder="IVA"
              className={`${numCls} text-zinc-400 cursor-default`}
            />
          </div>

          {/* Agregar */}
          <button
            ref={addButtonRef}
            type="button"
            onClick={handleAddLine}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleAddLine(); }
            }}
            disabled={addPending || !canAdd}
            className="shrink-0 h-7 px-3 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded flex items-center gap-1 disabled:opacity-40 transition-colors"
          >
            {addPending
              ? <><Loader2 className="h-3 w-3 animate-spin" />Agregando…</>
              : <><Plus className="h-3 w-3" />Agregar</>
            }
          </button>
        </div>

        {addError && (
          <p className="mt-1 text-[11px] text-red-400">{addError}</p>
        )}
      </div>

      {/* ── Zone C: Lines grid ──────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-zinc-900/90 z-10">
            <tr className="text-left text-[10px] text-zinc-500 uppercase tracking-wide border-b border-zinc-800">
              <th className="py-1 px-3 font-medium w-8">#</th>
              <th className="py-1 px-3 font-medium w-24">Código</th>
              <th className="py-1 px-3 font-medium">Descripción</th>
              <th className="py-1 px-3 font-medium w-12 text-center">Unid.</th>
              <th className="py-1 px-3 font-medium w-20 text-right">Cantidad</th>
              <th className="py-1 px-3 font-medium w-24 text-right">Costo u.</th>
              <th className="py-1 px-3 font-medium w-20 text-right">IVA</th>
              <th className="py-1 px-3 font-medium w-24 text-right">Subtotal</th>
              <th className="py-1 px-3 font-medium w-24 text-right">Total</th>
              <th className="py-1 px-3 font-medium w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr
                key={item.id}
                className="border-t border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
              >
                <td className="py-1.5 px-3 text-zinc-600">{idx + 1}</td>
                <td className="py-1.5 px-3 font-mono text-zinc-300">{item.product_code}</td>
                <td className="py-1.5 px-3 text-zinc-200 truncate max-w-0">{item.product_name}</td>
                <td className="py-1.5 px-3 text-center text-zinc-400">{item.unit_symbol}</td>
                <td className="py-1.5 px-3 text-right font-mono text-zinc-300">
                  {Number(item.quantity).toFixed(2)}
                </td>
                <td className="py-1.5 px-3 text-right font-mono text-zinc-300">
                  ${Number(item.unit_cost).toFixed(2)}
                </td>
                <td className="py-1.5 px-3 text-right font-mono text-zinc-400">
                  ${Number(item.tax_amount).toFixed(2)}
                </td>
                <td className="py-1.5 px-3 text-right font-mono text-zinc-300">
                  ${Number(item.line_subtotal).toFixed(2)}
                </td>
                <td className="py-1.5 px-3 text-right font-mono text-zinc-100 font-medium">
                  ${Number(item.line_total).toFixed(2)}
                </td>
                <td className="py-1.5 px-3 text-center">
                  <button
                    type="button"
                    onClick={() => handleRemoveLine(item.id)}
                    disabled={removingIds.has(item.id)}
                    className="text-zinc-600 hover:text-red-400 disabled:opacity-30 transition-colors"
                    title="Eliminar línea"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}

            {items.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="py-8 text-center text-zinc-600 text-xs"
                >
                  {purchaseId
                    ? "Sin líneas — selecciona un producto en el panel inferior"
                    : "Guarda la cabecera primero para agregar líneas"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
