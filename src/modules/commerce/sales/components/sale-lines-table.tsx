"use client";

import { useState, useEffect, useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import type { SaleItemDetail } from "../types/sale.types";
import type { UpdateSaleItemInput } from "../schemas/sale.schemas";

interface Props {
  items:    SaleItemDetail[];
  onUpdate: (item_id: string, data: UpdateSaleItemInput) => Promise<void>;
  onRemove: (item_id: string) => Promise<void>;
  disabled?: boolean;
}

interface RowProps {
  item:     SaleItemDetail;
  onUpdate: (item_id: string, data: UpdateSaleItemInput) => Promise<void>;
  onRemove: (item_id: string) => Promise<void>;
  disabled?: boolean;
}

const fmt = (n: number) =>
  n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SALE_LINE_COLUMNS = [
  { key: "code",     width: "76px"  },
  { key: "product"                  },
  { key: "quantity", width: "64px"  },
  { key: "price",    width: "92px"  },
  { key: "discount", width: "92px"  },
  { key: "tax",      width: "92px"  },
  { key: "total",    width: "104px" },
  { key: "actions",  width: "44px"  },
] as const;

function EditableRow({ item, onUpdate, onRemove, disabled }: RowProps) {
  const [qty,   setQty]   = useState(String(item.quantity));
  const [price, setPrice] = useState(String(item.unit_price));
  const [disc,  setDisc]  = useState(String(item.discount_amount));

  const [isPending, startTrans] = useTransition();

  useEffect(() => { setQty(String(item.quantity)); },         [item.quantity]);
  useEffect(() => { setPrice(String(item.unit_price)); },     [item.unit_price]);
  useEffect(() => { setDisc(String(item.discount_amount)); }, [item.discount_amount]);

  function handleBlurQty() {
    const n = parseFloat(qty);
    if (!isNaN(n) && n > 0 && n !== item.quantity) {
      startTrans(() => onUpdate(item.id, { quantity: n }));
    } else {
      setQty(String(item.quantity));
    }
  }

  function handleBlurPrice() {
    const n = parseFloat(price);
    if (!isNaN(n) && n >= 0 && n !== item.unit_price) {
      startTrans(() => onUpdate(item.id, { unit_price: n }));
    } else {
      setPrice(String(item.unit_price));
    }
  }

  function handleBlurDisc() {
    const n = parseFloat(disc);
    if (!isNaN(n) && n >= 0 && n !== item.discount_amount) {
      startTrans(() => onUpdate(item.id, { discount_amount: n }));
    } else {
      setDisc(String(item.discount_amount));
    }
  }

  function handleRemove() {
    if (!confirm("¿Eliminar esta línea de la venta?")) return;
    startTrans(() => onRemove(item.id));
  }

  // Confirma edición con Enter sin disparar update por cada tecla
  function commitOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
  }

  const isBusy = isPending || !!disabled;

  const inputCls =
    "h-6 w-full rounded border border-zinc-700 bg-zinc-800 px-1 text-right text-xs text-zinc-100 focus:border-zinc-500 focus:outline-none disabled:opacity-40";

  return (
    <tr className="border-b border-zinc-800 transition-colors hover:bg-zinc-800/30">
      <td className="overflow-hidden whitespace-nowrap px-1.5 py-1 font-mono text-[11px] text-zinc-500">
        {item.product_code_snapshot}
      </td>
      <td className="overflow-hidden truncate px-1.5 py-1 text-xs text-zinc-200" title={item.product_name_snapshot}>
        {item.product_name_snapshot}
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          min="0.001"
          step="1"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={handleBlurQty}
          onKeyDown={commitOnEnter}
          disabled={isBusy}
          className={inputCls}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={handleBlurPrice}
          onKeyDown={commitOnEnter}
          disabled={isBusy}
          className={inputCls}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          min="0"
          step="0.01"
          value={disc}
          onChange={(e) => setDisc(e.target.value)}
          onBlur={handleBlurDisc}
          onKeyDown={commitOnEnter}
          disabled={isBusy}
          className={inputCls}
        />
      </td>
      <td className="whitespace-nowrap px-1.5 py-1 text-right font-mono text-[11px] text-zinc-400">
        ${fmt(item.tax_amount)}
      </td>
      <td className="whitespace-nowrap px-1.5 py-1 text-right font-mono text-[11px] text-zinc-300">
        ${fmt(item.line_total)}
      </td>
      <td className="px-1 py-1 text-center">
        <button
          type="button"
          onClick={handleRemove}
          disabled={isBusy}
          title="Eliminar línea"
          className="text-zinc-600 transition-colors hover:text-red-400 disabled:opacity-30"
        >
          {isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </td>
    </tr>
  );
}

export function SaleLinesTable({ items, onUpdate, onRemove, disabled }: Props) {
  return (
    <div className="flex h-full flex-col">
      {/* Header de sección */}
      <div className="flex-none border-b border-zinc-800 px-3 py-1.5 flex items-center">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Líneas de venta
          {items.length > 0 && (
            <span className="ml-2 text-zinc-600">({items.length})</span>
          )}
        </span>
      </div>

      {/* Cuerpo */}
      <div className="flex-1 overflow-auto">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <span className="text-center text-xs text-zinc-600 leading-snug">
              Sin líneas. Busca un producto arriba para agregar.
            </span>
          </div>
        ) : (
          <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
            <colgroup>{SALE_LINE_COLUMNS.map((col) => (
              <col key={col.key} style={"width" in col ? { width: col.width } : undefined} />
            ))}</colgroup>
            <thead className="sticky top-0 z-10 bg-zinc-900">
              <tr className="border-b border-zinc-800">
                <th className="px-1.5 py-1.5 text-left   text-[10px] uppercase tracking-wider text-zinc-600">Código</th>
                <th className="px-1.5 py-1.5 text-left   text-[10px] uppercase tracking-wider text-zinc-600">Producto</th>
                <th className="px-1   py-1.5 text-right  text-[10px] uppercase tracking-wider text-zinc-600">Cant.</th>
                <th className="px-1   py-1.5 text-right  text-[10px] uppercase tracking-wider text-zinc-600">Precio</th>
                <th className="px-1   py-1.5 text-right  text-[10px] uppercase tracking-wider text-zinc-600">Desc.</th>
                <th className="px-1.5 py-1.5 text-right  text-[10px] uppercase tracking-wider text-zinc-600">IVA</th>
                <th className="px-1.5 py-1.5 text-right  text-[10px] uppercase tracking-wider text-zinc-600">Total</th>
                <th className="w-7    py-1.5" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <EditableRow
                  key={item.id}
                  item={item}
                  onUpdate={onUpdate}
                  onRemove={onRemove}
                  disabled={disabled}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
