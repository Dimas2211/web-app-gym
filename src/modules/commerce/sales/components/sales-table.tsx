"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — sales-table.tsx
//
// Grilla principal de encabezados de venta (Bloque C).
//
// Columnas: Código · Fecha · Cliente · Estado · Estado pago ·
//           Líneas · Subtotal · IVA · Total · Creación
//
// Navegación tipo ERP:
//   ArrowDown/Up  → fila siguiente/anterior (clamp)
//   ArrowLeft/Right → columna anterior/siguiente (clamp)
//   Home/End → primera/última columna
//   Click en celda → selecciona fila Y columna exacta
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { SaleListItem, SaleStatus, SalePaymentStatus } from "../types/sale.types";
import { getDteShortCode } from "../utils/dte-type-labels";

// ── Sort ──────────────────────────────────────────────────────────

type SortKey = "sale_code" | "sale_date" | "customer_name" | "total_amount" | "status" | "created_at";

type SortDir = "asc" | "desc";

// ── Active cell ───────────────────────────────────────────────────

interface ActiveCell {
  rowIndex: number;
  colIndex: number;
}

// ── Column definitions ────────────────────────────────────────────

interface ColDef {
  key:      string;
  label:    string;
  widthCls: string;
  sortKey?: SortKey;
  align?:   "right";
}

const COLUMNS: ColDef[] = [
  { key: "sale_code",      label: "Código",       widthCls: "w-36",      sortKey: "sale_code"    },
  { key: "sale_date",      label: "Fecha",        widthCls: "w-24",      sortKey: "sale_date"    },
  { key: "customer",       label: "Cliente",      widthCls: "w-[180px]", sortKey: "customer_name"},
  { key: "status",         label: "Estado",       widthCls: "w-24",      sortKey: "status"       },
  { key: "dte_type",       label: "Tipo DTE",     widthCls: "w-40"                               },
  { key: "payment_status", label: "Estado pago",  widthCls: "w-24"                               },
  { key: "item_count",     label: "Líneas",       widthCls: "w-14",      align: "right"          },
  { key: "subtotal",       label: "Subtotal",     widthCls: "w-24",      align: "right"          },
  { key: "tax_amount",     label: "IVA",          widthCls: "w-20",      align: "right"          },
  { key: "total_amount",   label: "Total",        widthCls: "w-24",      sortKey: "total_amount", align: "right" },
  { key: "created_at",     label: "Creación",     widthCls: "w-24",      sortKey: "created_at"   },
];

const COL_COUNT = COLUMNS.length; // 11

// ── Badges ────────────────────────────────────────────────────────

const SALE_STATUS_CONFIG: Record<SaleStatus, { label: string; cls: string }> = {
  DRAFT:     { label: "Borrador",   cls: "bg-zinc-800 text-zinc-400 border border-zinc-700"                },
  CONFIRMED: { label: "Confirmada", cls: "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50" },
  CANCELLED: { label: "Anulada",    cls: "bg-red-900/50 text-red-400 border border-red-700/50"             },
};

const PAYMENT_STATUS_CONFIG: Record<SalePaymentStatus, { label: string; cls: string }> = {
  UNPAID:   { label: "Sin pago",  cls: "bg-zinc-800 text-zinc-500 border border-zinc-700"               },
  PARTIAL:  { label: "Parcial",   cls: "bg-amber-900/50 text-amber-300 border border-amber-700/50"      },
  PAID:     { label: "Pagado",    cls: "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50" },
  REFUNDED: { label: "Devuelto",  cls: "bg-purple-900/50 text-purple-300 border border-purple-700/50"   },
};

// ── Helpers ───────────────────────────────────────────────────────

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

// ── Props ─────────────────────────────────────────────────────────

interface SalesTableProps {
  items:      SaleListItem[];
  selectedId: string | null;
  onSelect:   (id: string) => void;
}

// ── Componente ────────────────────────────────────────────────────

export function SalesTable({ items, selectedId, onSelect }: SalesTableProps) {
  const wrapperRef    = useRef<HTMLDivElement>(null);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const activeCellRef = useRef<HTMLTableCellElement | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("sale_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── Sort client-side ──────────────────────────────────────────

  const sortedItems = useMemo<SaleListItem[]>(() => {
    return [...items].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "sale_code":
          cmp = a.sale_code.localeCompare(b.sale_code); break;
        case "sale_date":
          cmp = new Date(a.sale_date).getTime() - new Date(b.sale_date).getTime(); break;
        case "customer_name":
          cmp = (a.customer_name ?? "").localeCompare(b.customer_name ?? ""); break;
        case "total_amount":
          cmp = a.total_amount - b.total_amount; break;
        case "status":
          cmp = a.status.localeCompare(b.status); break;
        case "created_at":
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [items, sortKey, sortDir]);

  function handleSortClick(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setActiveCell(null);
  }

  // ── Reset activeCell cuando cambia la lista ───────────────────

  useEffect(() => {
    setActiveCell(null);
  }, [items]);

  // ── Scroll automático al moverse la celda activa ──────────────

  useEffect(() => {
    if (activeCellRef.current) {
      activeCellRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeCell]);

  // ── Teclado ───────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!sortedItems.length) return;
      const NAV_KEYS = ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"];
      if (!NAV_KEYS.includes(e.key)) return;
      e.preventDefault();

      if (activeCell === null) {
        setActiveCell({ rowIndex: 0, colIndex: 0 });
        onSelect(sortedItems[0].id);
        return;
      }

      const { rowIndex, colIndex } = activeCell;

      switch (e.key) {
        case "ArrowDown": {
          const next = rowIndex < sortedItems.length - 1 ? rowIndex + 1 : rowIndex;
          if (next !== rowIndex) {
            setActiveCell({ rowIndex: next, colIndex });
            onSelect(sortedItems[next].id);
          }
          break;
        }
        case "ArrowUp": {
          const prev = rowIndex > 0 ? rowIndex - 1 : rowIndex;
          if (prev !== rowIndex) {
            setActiveCell({ rowIndex: prev, colIndex });
            onSelect(sortedItems[prev].id);
          }
          break;
        }
        case "ArrowRight": {
          const nextCol = colIndex < COL_COUNT - 1 ? colIndex + 1 : colIndex;
          setActiveCell({ rowIndex, colIndex: nextCol });
          break;
        }
        case "ArrowLeft": {
          const prevCol = colIndex > 0 ? colIndex - 1 : colIndex;
          setActiveCell({ rowIndex, colIndex: prevCol });
          break;
        }
        case "Home":
          setActiveCell({ rowIndex, colIndex: 0 });
          break;
        case "End":
          setActiveCell({ rowIndex, colIndex: COL_COUNT - 1 });
          break;
      }
    },
    [activeCell, sortedItems, onSelect],
  );

  // ── Click en celda ────────────────────────────────────────────

  function handleCellClick(rowIndex: number, colIndex: number, item: SaleListItem) {
    setActiveCell({ rowIndex, colIndex });
    if (item.id !== selectedId) onSelect(item.id);
  }

  // ── Helpers de celda activa ───────────────────────────────────

  function isActive(rowIndex: number, colIndex: number): boolean {
    return activeCell?.rowIndex === rowIndex && activeCell?.colIndex === colIndex;
  }

  function activeCellCls(rowIndex: number, colIndex: number): string {
    return isActive(rowIndex, colIndex) ? " ring-2 ring-inset ring-white/40" : "";
  }

  function cellRef(
    rowIndex: number,
    colIndex: number,
  ): React.RefCallback<HTMLTableCellElement> | null {
    if (!isActive(rowIndex, colIndex)) return null;
    return (el) => { activeCellRef.current = el; };
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div
      ref={wrapperRef}
      role="grid"
      aria-label="Lista de ventas"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="h-full overflow-auto focus:outline-none"
    >
      {sortedItems.length === 0 ? (
        <div className="flex h-16 items-center justify-center text-xs text-zinc-600">
          Sin ventas en esta location
        </div>
      ) : (
        <table className="w-full min-w-[1200px] text-xs border-collapse">

          {/* ── Encabezado sticky ───────────────────────── */}
          <thead className="sticky top-0 z-10">
            <tr className="bg-zinc-900 border-b border-zinc-800">
              {COLUMNS.map((col) => {
                const isSorted = col.sortKey && sortKey === col.sortKey;
                return (
                  <th
                    key={col.key}
                    onClick={() => col.sortKey && handleSortClick(col.sortKey)}
                    className={[
                      "px-3 h-7 text-[10px] font-semibold uppercase tracking-wide",
                      "whitespace-nowrap select-none",
                      col.align === "right" ? "text-right" : "text-left",
                      col.widthCls,
                      col.sortKey
                        ? "cursor-pointer hover:text-zinc-300"
                        : "cursor-default",
                      isSorted ? "text-zinc-300" : "text-zinc-500",
                    ].join(" ")}
                  >
                    {col.label}
                    {isSorted && (
                      sortDir === "asc"
                        ? <ChevronUp   className="inline h-2.5 w-2.5 ml-0.5 shrink-0" />
                        : <ChevronDown className="inline h-2.5 w-2.5 ml-0.5 shrink-0" />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* ── Filas ───────────────────────────────────── */}
          <tbody className="[&>tr>td]:scroll-mt-7">
            {sortedItems.map((item, rowIndex) => {
              const isSelected   = item.id === selectedId;
              const statusBadge  = SALE_STATUS_CONFIG[item.status]            ?? SALE_STATUS_CONFIG.DRAFT;
              const payBadge     = PAYMENT_STATUS_CONFIG[item.payment_status]  ?? PAYMENT_STATUS_CONFIG.UNPAID;

              return (
                <tr
                  key={item.id}
                  role="row"
                  aria-selected={isSelected}
                  className={[
                    "border-b border-zinc-800/40 cursor-pointer",
                    isSelected
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-300 hover:bg-zinc-800/50",
                  ].join(" ")}
                >
                  {/* 0 — Código venta */}
                  <td
                    ref={cellRef(rowIndex, 0)}
                    onClick={() => handleCellClick(rowIndex, 0, item)}
                    className={`px-3 py-1.5 whitespace-nowrap font-mono${activeCellCls(rowIndex, 0)}`}
                  >
                    {item.sale_code}
                  </td>

                  {/* 1 — Fecha */}
                  <td
                    ref={cellRef(rowIndex, 1)}
                    onClick={() => handleCellClick(rowIndex, 1, item)}
                    className={`px-3 py-1.5 whitespace-nowrap${activeCellCls(rowIndex, 1)}`}
                  >
                    {item.sale_date_label}
                  </td>

                  {/* 2 — Cliente */}
                  <td
                    ref={cellRef(rowIndex, 2)}
                    onClick={() => handleCellClick(rowIndex, 2, item)}
                    className={`px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate${activeCellCls(rowIndex, 2)}`}
                  >
                    {item.customer_name ?? <span className="text-zinc-500">Consumidor final</span>}
                  </td>

                  {/* 3 — Estado venta */}
                  <td
                    ref={cellRef(rowIndex, 3)}
                    onClick={() => handleCellClick(rowIndex, 3, item)}
                    className={`px-3 py-1.5 whitespace-nowrap${activeCellCls(rowIndex, 3)}`}
                  >
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusBadge.cls}`}>
                      {statusBadge.label}
                    </span>
                  </td>

                  {/* 4 — Tipo DTE */}
                  <td
                    ref={cellRef(rowIndex, 4)}
                    onClick={() => handleCellClick(rowIndex, 4, item)}
                    className={`px-3 py-1.5 whitespace-nowrap${activeCellCls(rowIndex, 4)}`}
                  >
                    <span className="font-mono font-semibold text-zinc-200">
                      {getDteShortCode(item.primary_dte_type_code)}
                    </span>
                  </td>

                  {/* 5 — Estado pago */}
                  <td
                    ref={cellRef(rowIndex, 5)}
                    onClick={() => handleCellClick(rowIndex, 5, item)}
                    className={`px-3 py-1.5 whitespace-nowrap${activeCellCls(rowIndex, 5)}`}
                  >
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${payBadge.cls}`}>
                      {payBadge.label}
                    </span>
                  </td>

                  {/* 6 — Líneas */}
                  <td
                    ref={cellRef(rowIndex, 6)}
                    onClick={() => handleCellClick(rowIndex, 6, item)}
                    className={`px-3 py-1.5 whitespace-nowrap text-right${activeCellCls(rowIndex, 6)}`}
                  >
                    {item.item_count}
                  </td>

                  {/* 7 — Subtotal */}
                  <td
                    ref={cellRef(rowIndex, 7)}
                    onClick={() => handleCellClick(rowIndex, 7, item)}
                    className={`px-3 py-1.5 whitespace-nowrap text-right font-mono${activeCellCls(rowIndex, 7)}`}
                  >
                    {formatMoney(item.subtotal)}
                  </td>

                  {/* 8 — IVA */}
                  <td
                    ref={cellRef(rowIndex, 8)}
                    onClick={() => handleCellClick(rowIndex, 8, item)}
                    className={`px-3 py-1.5 whitespace-nowrap text-right font-mono${activeCellCls(rowIndex, 8)}`}
                  >
                    {formatMoney(item.tax_amount)}
                  </td>

                  {/* 9 — Total */}
                  <td
                    ref={cellRef(rowIndex, 9)}
                    onClick={() => handleCellClick(rowIndex, 9, item)}
                    className={`px-3 py-1.5 whitespace-nowrap text-right font-mono${activeCellCls(rowIndex, 9)}`}
                  >
                    {formatMoney(item.total_amount)}
                  </td>

                  {/* 10 — Creación */}
                  <td
                    ref={cellRef(rowIndex, 10)}
                    onClick={() => handleCellClick(rowIndex, 10, item)}
                    className={`px-3 py-1.5 whitespace-nowrap${activeCellCls(rowIndex, 10)}`}
                  >
                    {item.created_at_label}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
