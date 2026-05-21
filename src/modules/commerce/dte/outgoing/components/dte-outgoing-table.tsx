"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — dte-outgoing-table.tsx
//
// Grilla principal de DTE emitidos (vista global fiscal).
//
// Columnas: Fecha emisión · Tipo DTE · N° Control · Código generación
//           · Receptor · Estado fiscal · Sello recibido · Ambiente
//           · Venta relacionada · Delivery externo · Última actualización
//
// Navegación tipo ERP: ArrowUp/Down/Left/Right · Home/End
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { DteOutgoingGlobalListItem } from "../types";
import {
  dteStatusLabel,
  dteStatusCls,
  dteTypeLabel,
  envLabel,
  envCls,
} from "../utils/dte-status.utils";
import type { DteExternalDeliveryStatus } from "../types";

// ── Sort ──────────────────────────────────────────────────────────

type SortKey =
  | "issued_at"
  | "dte_type_code"
  | "control_number"
  | "dte_status"
  | "accepted_at"
  | "updated_at";

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
  align?:   "right" | "center";
}

const COLUMNS: ColDef[] = [
  { key: "issued_at",          label: "Fecha emisión",      widthCls: "w-32",      sortKey: "issued_at"     },
  { key: "dte_type_code",      label: "Tipo DTE",           widthCls: "w-20",      sortKey: "dte_type_code" },
  { key: "control_number",     label: "N° Control",         widthCls: "w-52",      sortKey: "control_number"},
  { key: "generation_code",    label: "Cód. Generación",    widthCls: "w-40"                                },
  { key: "receptor_name",      label: "Receptor",           widthCls: "w-[180px]"                           },
  { key: "dte_status",         label: "Estado fiscal",      widthCls: "w-32",      sortKey: "dte_status"    },
  { key: "reception_stamp",    label: "Sello recibido",     widthCls: "w-20",      align: "center"          },
  { key: "environment",        label: "Ambiente",           widthCls: "w-24",      align: "center"          },
  { key: "sale_code",          label: "Venta",              widthCls: "w-28"                                },
  { key: "external_delivery",  label: "Delivery ext.",      widthCls: "w-24",      align: "center"          },
  { key: "updated_at",         label: "Actualización",      widthCls: "w-32",      sortKey: "updated_at"    },
];

const COL_COUNT = COLUMNS.length;

// ── Helpers de formato ────────────────────────────────────────────

function formatDate(d: Date | null | string | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("es-SV", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatDateTime(d: Date | null | string | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("es-SV", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function truncateCode(code: string | null, len = 12): string {
  if (!code) return "—";
  return code.length > len ? `…${code.slice(-len)}` : code;
}

// ── Badge de delivery externo ─────────────────────────────────────

function DeliveryBadge({ status }: { status: DteExternalDeliveryStatus }) {
  if (status === "DELIVERED") {
    return <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">Entregado</span>;
  }
  if (status === "ERROR") {
    return <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-red-900/50 text-red-400 border border-red-700/50">Error</span>;
  }
  if (status === "PENDING") {
    return <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-zinc-800 text-zinc-500 border border-zinc-700">Pendiente</span>;
  }
  return <span className="text-zinc-600 text-[9px]">—</span>;
}

// ── Badge de sello recibido ───────────────────────────────────────

function StampBadge({ stamp }: { stamp: string | null }) {
  if (stamp) {
    return <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">Sí</span>;
  }
  return <span className="text-zinc-600 text-[9px]">—</span>;
}

// ── Props ─────────────────────────────────────────────────────────

interface DteOutgoingTableProps {
  items:      DteOutgoingGlobalListItem[];
  selectedId: string | null;
  onSelect:   (id: string) => void;
}

// ── Componente ────────────────────────────────────────────────────

export function DteOutgoingTable({ items, selectedId, onSelect }: DteOutgoingTableProps) {
  const wrapperRef    = useRef<HTMLDivElement>(null);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const activeCellRef = useRef<HTMLTableCellElement | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("issued_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── Sort client-side ──────────────────────────────────────────

  const sortedItems = [...items].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "issued_at":
        cmp = (a.issued_at ? new Date(a.issued_at).getTime() : 0) -
              (b.issued_at ? new Date(b.issued_at).getTime() : 0);
        break;
      case "dte_type_code":
        cmp = a.dte_type_code.localeCompare(b.dte_type_code);
        break;
      case "control_number":
        cmp = (a.control_number ?? "").localeCompare(b.control_number ?? "");
        break;
      case "dte_status":
        cmp = a.dte_status.localeCompare(b.dte_status);
        break;
      case "accepted_at":
        cmp = (a.accepted_at ? new Date(a.accepted_at).getTime() : 0) -
              (b.accepted_at ? new Date(b.accepted_at).getTime() : 0);
        break;
      case "updated_at":
        cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

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

  // ── Scroll automático al celda activa ────────────────────────

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

  function handleCellClick(rowIndex: number, colIndex: number, item: DteOutgoingGlobalListItem) {
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
      aria-label="Lista de DTE emitidos"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="h-full overflow-auto focus:outline-none"
    >
      {sortedItems.length === 0 ? (
        <div className="flex h-16 items-center justify-center text-xs text-zinc-600">
          Sin DTE emitidos con los filtros actuales
        </div>
      ) : (
        <table className="w-full min-w-[1400px] text-xs border-collapse">

          {/* ── Encabezado sticky ─────────────────────────── */}
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
                      col.align === "right"  ? "text-right"  :
                      col.align === "center" ? "text-center" : "text-left",
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

          {/* ── Filas ─────────────────────────────────────── */}
          <tbody className="[&>tr>td]:scroll-mt-7">
            {sortedItems.map((item, rowIndex) => {
              const isSelected = item.id === selectedId;

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
                  {/* 0 — Fecha emisión */}
                  <td
                    ref={cellRef(rowIndex, 0)}
                    onClick={() => handleCellClick(rowIndex, 0, item)}
                    className={`px-3 py-1.5 whitespace-nowrap font-mono${activeCellCls(rowIndex, 0)}`}
                  >
                    {formatDate(item.issued_at)}
                  </td>

                  {/* 1 — Tipo DTE */}
                  <td
                    ref={cellRef(rowIndex, 1)}
                    onClick={() => handleCellClick(rowIndex, 1, item)}
                    className={`px-3 py-1.5 whitespace-nowrap${activeCellCls(rowIndex, 1)}`}
                  >
                    <span className="font-mono font-semibold text-zinc-200">
                      {dteTypeLabel(item.dte_type_code)}
                    </span>
                    <span className="ml-1 text-zinc-600 text-[9px]">{item.dte_type_code}</span>
                  </td>

                  {/* 2 — N° Control */}
                  <td
                    ref={cellRef(rowIndex, 2)}
                    onClick={() => handleCellClick(rowIndex, 2, item)}
                    title={item.control_number ?? undefined}
                    className={`px-3 py-1.5 whitespace-nowrap font-mono text-[10px]${activeCellCls(rowIndex, 2)}`}
                  >
                    {item.control_number
                      ? <span className="text-zinc-300">{truncateCode(item.control_number, 20)}</span>
                      : <span className="text-zinc-600">—</span>
                    }
                  </td>

                  {/* 3 — Código generación */}
                  <td
                    ref={cellRef(rowIndex, 3)}
                    onClick={() => handleCellClick(rowIndex, 3, item)}
                    title={item.generation_code ?? undefined}
                    className={`px-3 py-1.5 whitespace-nowrap font-mono text-[10px]${activeCellCls(rowIndex, 3)}`}
                  >
                    {item.generation_code
                      ? <span className="text-zinc-400">{truncateCode(item.generation_code, 12)}</span>
                      : <span className="text-zinc-600">—</span>
                    }
                  </td>

                  {/* 4 — Receptor */}
                  <td
                    ref={cellRef(rowIndex, 4)}
                    onClick={() => handleCellClick(rowIndex, 4, item)}
                    className={`px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate${activeCellCls(rowIndex, 4)}`}
                  >
                    {item.receptor_name
                      ? item.receptor_name
                      : <span className="text-zinc-500">Consumidor final</span>
                    }
                  </td>

                  {/* 5 — Estado fiscal */}
                  <td
                    ref={cellRef(rowIndex, 5)}
                    onClick={() => handleCellClick(rowIndex, 5, item)}
                    className={`px-3 py-1.5 whitespace-nowrap${activeCellCls(rowIndex, 5)}`}
                  >
                    <span className={`text-[10px] font-semibold ${dteStatusCls(item.dte_status)}`}>
                      {dteStatusLabel(item.dte_status)}
                    </span>
                  </td>

                  {/* 6 — Sello recibido */}
                  <td
                    ref={cellRef(rowIndex, 6)}
                    onClick={() => handleCellClick(rowIndex, 6, item)}
                    className={`px-3 py-1.5 whitespace-nowrap text-center${activeCellCls(rowIndex, 6)}`}
                  >
                    <StampBadge stamp={item.reception_stamp} />
                  </td>

                  {/* 7 — Ambiente */}
                  <td
                    ref={cellRef(rowIndex, 7)}
                    onClick={() => handleCellClick(rowIndex, 7, item)}
                    className={`px-3 py-1.5 whitespace-nowrap text-center${activeCellCls(rowIndex, 7)}`}
                  >
                    <span className={`text-[10px] font-semibold ${envCls(item.environment)}`}>
                      {envLabel(item.environment)}
                    </span>
                  </td>

                  {/* 8 — Venta relacionada */}
                  <td
                    ref={cellRef(rowIndex, 8)}
                    onClick={() => handleCellClick(rowIndex, 8, item)}
                    className={`px-3 py-1.5 whitespace-nowrap font-mono text-[10px]${activeCellCls(rowIndex, 8)}`}
                  >
                    {item.sale_code
                      ? <span className="text-zinc-300">{item.sale_code}</span>
                      : <span className="text-zinc-600">—</span>
                    }
                  </td>

                  {/* 9 — Delivery externo */}
                  <td
                    ref={cellRef(rowIndex, 9)}
                    onClick={() => handleCellClick(rowIndex, 9, item)}
                    className={`px-3 py-1.5 whitespace-nowrap text-center${activeCellCls(rowIndex, 9)}`}
                  >
                    <DeliveryBadge status={item.external_delivery_status} />
                  </td>

                  {/* 10 — Última actualización */}
                  <td
                    ref={cellRef(rowIndex, 10)}
                    onClick={() => handleCellClick(rowIndex, 10, item)}
                    className={`px-3 py-1.5 whitespace-nowrap font-mono text-[10px]${activeCellCls(rowIndex, 10)}`}
                  >
                    {formatDateTime(item.updated_at)}
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
