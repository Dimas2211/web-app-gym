"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchases-table.tsx
//
// Grilla principal de encabezados de compra (Bloque C).
// Patrón idéntico a products-table y suppliers-table:
//   <table>/<thead sticky>/<tbody> con un único activeCellRef.
//
// Columnas: Forma pago · Tipo pago · Correlativo · Fecha · Proveedor ·
//           NRC · Serie · No.Doc · Gravada · IVA · Total · Estado
//
// Navegación tipo ERP:
//   ArrowDown/Up  → fila siguiente/anterior (clamp)
//   ArrowLeft/Right → columna anterior/siguiente (clamp)
//   Home/End → primera/última columna
//   Primer keypress → inicializa activeCell en { 0, 0 }
//
// Click en celda → selecciona fila Y columna exacta clickeada.
// Scroll → scrollIntoView({ nearest }) sobre el <td> activo (un solo call).
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { PurchaseListItem } from "../types/purchase.types";
import {
  PAYMENT_CONDITION_LABELS,
  CANCELLATION_TYPE_LABELS,
} from "../constants/purchase-document.constants";

// ── Sort ──────────────────────────────────────────────────────────

type SortKey = "purchase_code" | "purchase_date" | "supplier_name" | "total_amount" | "status";
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
  { key: "payment_condition", label: "Forma pago",  widthCls: "w-[110px]"  },
  { key: "cancellation_type", label: "Tipo pago",   widthCls: "w-[130px]"  },
  { key: "purchase_code",     label: "Correlativo", widthCls: "w-[90px]",  sortKey: "purchase_code" },
  { key: "purchase_date",     label: "Fecha",       widthCls: "w-[110px]", sortKey: "purchase_date" },
  { key: "supplier",          label: "Proveedor",   widthCls: "w-[260px]", sortKey: "supplier_name" },
  { key: "supplier_nrc",      label: "NRC",         widthCls: "w-[110px]"  },
  { key: "series",            label: "Serie",       widthCls: "w-[140px]"  },
  { key: "doc_number",        label: "No.Doc",      widthCls: "w-[120px]"  },
  { key: "subtotal",          label: "Gravada",     widthCls: "w-[110px]", align: "right" },
  { key: "tax_amount",        label: "IVA",         widthCls: "w-[100px]", align: "right" },
  { key: "total_amount",      label: "Total",       widthCls: "w-[110px]", sortKey: "total_amount", align: "right" },
  { key: "status",            label: "Estado",      widthCls: "w-[100px]", sortKey: "status" },
];

const COL_COUNT = COLUMNS.length;

// ── Status badge ──────────────────────────────────────────────────

const STATUS_CONFIG = {
  DRAFT:     { label: "Borrador",   cls: "bg-zinc-800 text-zinc-400 border border-zinc-700"                },
  CONFIRMED: { label: "Confirmada", cls: "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50" },
  CANCELLED: { label: "Anulada",    cls: "bg-red-900/50 text-red-400 border border-red-700/50"             },
} as const;

// ── Helpers de formato ────────────────────────────────────────────

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function paymentLabel(code: string | null): string {
  if (!code) return "—";
  return PAYMENT_CONDITION_LABELS[code] ?? code;
}

function cancellationLabel(code: string | null): string {
  if (!code) return "—";
  return CANCELLATION_TYPE_LABELS[code] ?? code;
}

// ── Props ─────────────────────────────────────────────────────────

interface PurchasesTableProps {
  items:      PurchaseListItem[];
  selectedId: string | null;
  onSelect:   (id: string) => void;
}

// ── Componente ────────────────────────────────────────────────────

export function PurchasesTable({ items, selectedId, onSelect }: PurchasesTableProps) {
  const wrapperRef    = useRef<HTMLDivElement>(null);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  // Un único ref apuntando al <td> activo — patrón idéntico a products/suppliers.
  const activeCellRef = useRef<HTMLTableCellElement | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("purchase_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── Sort client-side ──────────────────────────────────────────

  const sortedItems = useMemo<PurchaseListItem[]>(() => {
    return [...items].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "purchase_code": cmp = a.purchase_code.localeCompare(b.purchase_code); break;
        case "purchase_date": cmp = a.purchase_date.getTime() - b.purchase_date.getTime(); break;
        case "supplier_name": cmp = a.supplier_name.localeCompare(b.supplier_name); break;
        case "total_amount":  cmp = a.total_amount - b.total_amount; break;
        case "status":        cmp = a.status.localeCompare(b.status); break;
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

  // ── Reset activeCell cuando cambia la lista (nuevo fetch) ─────
  // Idéntico a products-table y suppliers-table.

  useEffect(() => {
    setActiveCell(null);
  }, [items]);

  // ── Scroll automático al moverse la celda activa ──────────────
  // Un único scrollIntoView sobre el <td> activo — igual que products/suppliers.

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

      // Primer keypress: inicializa en (0, 0)
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
  // Selecciona fila Y columna exacta — igual que products/suppliers.

  function handleCellClick(rowIndex: number, colIndex: number, item: PurchaseListItem) {
    setActiveCell({ rowIndex, colIndex });
    if (item.id !== selectedId) onSelect(item.id);
  }

  // ── Helpers de celda activa ───────────────────────────────────
  // Mismo patrón que products-table y suppliers-table.

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
      aria-label="Lista de compras"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="h-full overflow-auto focus:outline-none"
    >
      {sortedItems.length === 0 ? (
        <div className="flex h-16 items-center justify-center text-xs text-zinc-600">
          Sin documentos de compra en esta location
        </div>
      ) : (
        <table className="w-full min-w-[1490px] table-fixed text-xs border-collapse">

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
              const isSelected = item.id === selectedId;
              const badge      = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.DRAFT;

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
                  {/* 0 — Forma pago */}
                  <td
                    ref={cellRef(rowIndex, 0)}
                    onClick={() => handleCellClick(rowIndex, 0, item)}
                    className={`px-3 py-1.5 whitespace-nowrap${activeCellCls(rowIndex, 0)}`}
                  >
                    {paymentLabel(item.payment_condition)}
                  </td>

                  {/* 1 — Tipo pago */}
                  <td
                    ref={cellRef(rowIndex, 1)}
                    onClick={() => handleCellClick(rowIndex, 1, item)}
                    className={`px-3 py-1.5 whitespace-nowrap${activeCellCls(rowIndex, 1)}`}
                  >
                    {cancellationLabel(item.cancellation_type)}
                  </td>

                  {/* 2 — Correlativo */}
                  <td
                    ref={cellRef(rowIndex, 2)}
                    onClick={() => handleCellClick(rowIndex, 2, item)}
                    className={`px-3 py-1.5 whitespace-nowrap font-mono${activeCellCls(rowIndex, 2)}`}
                  >
                    {item.purchase_code}
                  </td>

                  {/* 3 — Fecha */}
                  <td
                    ref={cellRef(rowIndex, 3)}
                    onClick={() => handleCellClick(rowIndex, 3, item)}
                    className={`px-3 py-1.5 whitespace-nowrap${activeCellCls(rowIndex, 3)}`}
                  >
                    {item.purchase_date_label}
                  </td>

                  {/* 4 — Proveedor */}
                  <td
                    ref={cellRef(rowIndex, 4)}
                    onClick={() => handleCellClick(rowIndex, 4, item)}
                    className={`px-3 py-1.5 max-w-0 truncate${activeCellCls(rowIndex, 4)}`}
                  >
                    {item.supplier_name}
                  </td>

                  {/* 5 — NRC */}
                  <td
                    ref={cellRef(rowIndex, 5)}
                    onClick={() => handleCellClick(rowIndex, 5, item)}
                    className={`px-3 py-1.5 whitespace-nowrap font-mono${activeCellCls(rowIndex, 5)}`}
                  >
                    {item.supplier_nrc ?? "—"}
                  </td>

                  {/* 6 — Serie */}
                  <td
                    ref={cellRef(rowIndex, 6)}
                    onClick={() => handleCellClick(rowIndex, 6, item)}
                    className={`px-3 py-1.5 whitespace-nowrap font-mono${activeCellCls(rowIndex, 6)}`}
                  >
                    {item.document_series ?? "—"}
                  </td>

                  {/* 7 — No.Doc */}
                  <td
                    ref={cellRef(rowIndex, 7)}
                    onClick={() => handleCellClick(rowIndex, 7, item)}
                    className={`px-3 py-1.5 whitespace-nowrap font-mono${activeCellCls(rowIndex, 7)}`}
                  >
                    {item.document_number ?? "—"}
                  </td>

                  {/* 8 — Gravada */}
                  <td
                    ref={cellRef(rowIndex, 8)}
                    onClick={() => handleCellClick(rowIndex, 8, item)}
                    className={`px-3 py-1.5 whitespace-nowrap text-right font-mono${activeCellCls(rowIndex, 8)}`}
                  >
                    {formatMoney(item.subtotal)}
                  </td>

                  {/* 9 — IVA */}
                  <td
                    ref={cellRef(rowIndex, 9)}
                    onClick={() => handleCellClick(rowIndex, 9, item)}
                    className={`px-3 py-1.5 whitespace-nowrap text-right font-mono${activeCellCls(rowIndex, 9)}`}
                  >
                    {formatMoney(item.tax_amount)}
                  </td>

                  {/* 10 — Total */}
                  <td
                    ref={cellRef(rowIndex, 10)}
                    onClick={() => handleCellClick(rowIndex, 10, item)}
                    className={`px-3 py-1.5 whitespace-nowrap text-right font-mono${activeCellCls(rowIndex, 10)}`}
                  >
                    {formatMoney(item.total_amount)}
                  </td>

                  {/* 11 — Estado */}
                  <td
                    ref={cellRef(rowIndex, 11)}
                    onClick={() => handleCellClick(rowIndex, 11, item)}
                    className={`px-3 py-1.5 whitespace-nowrap${activeCellCls(rowIndex, 11)}`}
                  >
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
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
