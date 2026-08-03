"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-lines-table.tsx
//
// F3-C21D — Tabla de líneas de la venta de exportación. Mismo patrón
// visual/funcional que sale-lines-table.tsx (ventas): columna fija,
// scroll interno, edición inline de cantidad/precio/descuento.
//
// Expone focusQuantityAt(index) vía ref para que el workspace pueda
// llevar el foco a la cantidad de la línea recién agregada. Enter en
// cantidad dispara onQuantityEnter (el workspace devuelve el foco al
// buscador de productos para seguir agregando).
// ─────────────────────────────────────────────────────────────────

import { useRef, forwardRef, useImperativeHandle } from "react";
import { Trash2 } from "lucide-react";
import type { ExportProductLookup } from "../queries/search-export-products";

export interface ExportLineDraft {
  product: ExportProductLookup;
  quantity: number;
  unit_price: number;
  discount_amount: number;
}

export interface ExportLinesTableHandle {
  focusQuantityAt: (index: number) => void;
}

interface Props {
  lines: ExportLineDraft[];
  onUpdate: (index: number, patch: Partial<ExportLineDraft>) => void;
  onRemove: (index: number) => void;
  onQuantityEnter?: () => void;
  disabled?: boolean;
}

const fmt = (n: number) =>
  n.toLocaleString("es-SV", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const cellInputCls =
  "h-6 w-full rounded border border-zinc-700 bg-zinc-800 px-1 text-right text-xs text-zinc-100 " +
  "focus:border-zinc-500 focus:outline-none disabled:opacity-40";

export const ExportLinesTable = forwardRef<ExportLinesTableHandle, Props>(
function ExportLinesTable({ lines, onUpdate, onRemove, onQuantityEnter, disabled }, ref) {
  const qtyRefs = useRef<(HTMLInputElement | null)[]>([]);

  useImperativeHandle(ref, () => ({
    focusQuantityAt: (index: number) => {
      const el = qtyRefs.current[index];
      if (el) {
        el.focus();
        el.select();
      }
    },
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="flex-none border-b border-zinc-800 px-3 py-1.5 flex items-center">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Líneas de venta
          {lines.length > 0 && <span className="ml-2 text-zinc-600">({lines.length})</span>}
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        {lines.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <span className="text-center text-xs text-zinc-600 leading-snug">
              Sin líneas. Busca un producto abajo para agregarlo a la venta.
            </span>
          </div>
        ) : (
          <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "84px" }} />
              <col />
              <col style={{ width: "56px" }} />
              <col style={{ width: "68px" }} />
              <col style={{ width: "92px" }} />
              <col style={{ width: "84px" }} />
              <col style={{ width: "100px" }} />
              <col style={{ width: "36px" }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-zinc-900">
              <tr className="border-b border-zinc-800">
                <th className="px-1.5 py-1.5 text-left  text-[10px] uppercase tracking-wider text-zinc-600">Código</th>
                <th className="px-1.5 py-1.5 text-left  text-[10px] uppercase tracking-wider text-zinc-600">Producto</th>
                <th className="px-1   py-1.5 text-center text-[10px] uppercase tracking-wider text-zinc-600">Unidad</th>
                <th className="px-1   py-1.5 text-right text-[10px] uppercase tracking-wider text-zinc-600">Cant.</th>
                <th className="px-1   py-1.5 text-right text-[10px] uppercase tracking-wider text-zinc-600">Precio</th>
                <th className="px-1   py-1.5 text-right text-[10px] uppercase tracking-wider text-zinc-600">Desc.</th>
                <th className="px-1.5 py-1.5 text-right text-[10px] uppercase tracking-wider text-zinc-600">Subtotal</th>
                <th className="w-7    py-1.5" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const lineTotal = l.quantity * l.unit_price - l.discount_amount;
                return (
                  <tr key={`${l.product.id}-${i}`} className="border-b border-zinc-800 transition-colors hover:bg-zinc-800/30">
                    <td className="overflow-hidden whitespace-nowrap px-1.5 py-1 font-mono text-[11px] text-zinc-500">
                      {l.product.product_code}
                    </td>
                    <td className="overflow-hidden truncate px-1.5 py-1 text-xs text-zinc-200" title={l.product.name}>
                      {l.product.name}
                    </td>
                    <td className="px-1 py-1 text-center text-[11px] text-zinc-500">
                      {l.product.unit_symbol ?? "—"}
                    </td>
                    <td className="px-1 py-1">
                      <input
                        ref={(el) => { qtyRefs.current[i] = el; }}
                        type="number" min={0.0001} step="0.0001"
                        value={l.quantity}
                        disabled={disabled}
                        onChange={(e) => onUpdate(i, { quantity: Number(e.target.value) })}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onQuantityEnter?.();
                          }
                        }}
                        className={cellInputCls}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number" min={0} step="0.01"
                        value={l.unit_price}
                        disabled={disabled}
                        onChange={(e) => onUpdate(i, { unit_price: Number(e.target.value) })}
                        className={cellInputCls}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number" min={0} step="0.01"
                        value={l.discount_amount}
                        disabled={disabled}
                        onChange={(e) => onUpdate(i, { discount_amount: Number(e.target.value) })}
                        className={cellInputCls}
                      />
                    </td>
                    <td className="whitespace-nowrap px-1.5 py-1 text-right font-mono text-[11px] text-zinc-300">
                      ${fmt(lineTotal)}
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => onRemove(i)}
                        disabled={disabled}
                        title="Eliminar línea"
                        className="text-zinc-600 transition-colors hover:text-red-400 disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
});

ExportLinesTable.displayName = "ExportLinesTable";
