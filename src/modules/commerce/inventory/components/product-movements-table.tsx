"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/inventory — product-movements-table.tsx
//
// Tabla de movimientos de UN producto (Kardex operativo). Única
// representación en pantalla compartida por:
//   - Commerce → Consultas y reportes → Movimientos por producto
//   - Commerce → Productos → pestaña Movimientos (variant "compact")
//
// Las filas pasan por toMovementExportRow — el mismo normalizador que
// Excel y PDF — para que pantalla y archivos muestren idénticos datos.
// Solo lectura.
// ─────────────────────────────────────────────────────────────────

import type { InventoryMovementItem } from "../types/inventory-movement.types";
import {
  MOVEMENT_REPORT_COLUMNS,
  formatMovementCost,
  formatMovementQty,
  toMovementExportRow,
} from "../utils/export-inventory-movement-report";

interface ProductMovementsTableProps {
  items: InventoryMovementItem[];
  variant?: "full" | "compact";
  emptyMessage?: string;
}

const NUMERIC_COLS = new Set([5, 6, 7, 8, 9]);

export function ProductMovementsTable({
  items,
  variant = "full",
  emptyMessage = "No hay movimientos para los filtros seleccionados.",
}: ProductMovementsTableProps) {
  const compact = variant === "compact";
  const cell = compact ? "px-3 py-1.5" : "px-3 py-2";
  const dash = <span className="text-zinc-300">—</span>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className={compact
            ? "border-b border-zinc-100 text-zinc-400 font-medium"
            : "border-b border-zinc-200 bg-zinc-50 text-zinc-500 font-semibold uppercase tracking-wide text-[10px]"}>
            {MOVEMENT_REPORT_COLUMNS.map((label, i) => (
              <th
                key={label}
                className={`${cell} whitespace-nowrap ${NUMERIC_COLS.has(i) ? "text-right" : "text-left"}`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={MOVEMENT_REPORT_COLUMNS.length} className="px-4 py-10 text-center text-sm text-zinc-400">
                {emptyMessage}
              </td>
            </tr>
          )}
          {items.map((item) => {
            const r = toMovementExportRow(item);
            const additive = item.movement_direction === "ADDITIVE";
            return (
              <tr key={item.id} className="border-b border-zinc-50 hover:bg-zinc-50 text-zinc-600">
                <td className={`${cell} whitespace-nowrap font-mono text-zinc-500`}>{r.date}</td>
                <td className={`${cell} whitespace-nowrap text-zinc-700`}>{r.type}</td>
                <td className={`${cell} whitespace-nowrap`}>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${additive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                    {r.direction}
                  </span>
                </td>
                <td className={`${cell} whitespace-nowrap font-mono`} title={r.document ?? "Sin documento"}>
                  {r.document ?? dash}
                </td>
                <td className={`${cell} whitespace-nowrap font-mono text-zinc-500`}>{r.correlative ?? dash}</td>
                <td className={`${cell} text-right whitespace-nowrap font-mono text-green-700`}>
                  {r.qty_in === null ? dash : formatMovementQty(r.qty_in)}
                </td>
                <td className={`${cell} text-right whitespace-nowrap font-mono text-red-600`}>
                  {r.qty_out === null ? dash : formatMovementQty(r.qty_out)}
                </td>
                <td className={`${cell} text-right whitespace-nowrap font-mono text-zinc-500`}>{formatMovementQty(r.stock_before)}</td>
                <td className={`${cell} text-right whitespace-nowrap font-mono font-medium text-zinc-800`}>{formatMovementQty(r.resulting_stock)}</td>
                <td className={`${cell} text-right whitespace-nowrap font-mono text-zinc-500`}>
                  {r.unit_cost === null ? dash : formatMovementCost(r.unit_cost)}
                </td>
                <td className={`${cell} whitespace-nowrap text-zinc-500`}>{r.user ?? dash}</td>
                <td className={`${cell} text-zinc-500 max-w-[220px] truncate`} title={r.notes ?? undefined}>
                  {r.notes ?? dash}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
