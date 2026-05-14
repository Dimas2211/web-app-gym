"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/customers — customers-table.tsx
//
// Grilla principal del maestro de clientes.
//
// Columnas: Código, Nombre, Razón social, NIT, NRC, DUI,
//           Tipo contrib., Teléfono, Correo, Estado
//
// Navegación tipo ERP:
//   ArrowDown / ArrowUp → fila siguiente/anterior
//   ArrowLeft / ArrowRight → columna siguiente/anterior
//   Home / End → primera / última columna
//
// Ordenamiento: clic en cabecera de columnas sortables.
// Selección: fila activa con fondo zinc-900.
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { Users } from "lucide-react";
import type { CustomerListItem, CustomerTaxpayerType } from "../types/customer.types";

// ── Mapas de presentación ─────────────────────────────────────────

const TAXPAYER_LABELS: Record<CustomerTaxpayerType, string> = {
  FINAL_CONSUMER:      "Consumidor final",
  REGISTERED_TAXPAYER: "Contribuyente",
  EXCLUDED_SUBJECT:    "Excluido",
};

const STATUS_CONFIG = {
  active:   { label: "Activo",   cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  inactive: { label: "Inactivo", cls: "bg-zinc-100 text-zinc-500 border border-zinc-200"         },
} as const;

// ── Tipos de columna y sort ───────────────────────────────────────

export type CustomerSortField = "customer_code" | "name" | "created_at";
export type SortDirection = "asc" | "desc";
export interface CustomerSort { field: CustomerSortField; direction: SortDirection; }

type ColDef = { field: CustomerSortField | null; label: string; widthCls: string; };

const COLUMNS: ColDef[] = [
  { field: "customer_code", label: "Código",        widthCls: "w-24"          },
  { field: "name",          label: "Nombre",         widthCls: "min-w-[200px]" },
  { field: null,            label: "Razón social",   widthCls: "min-w-[160px]" },
  { field: null,            label: "NIT",            widthCls: "w-36"          },
  { field: null,            label: "NRC",            widthCls: "w-28"          },
  { field: null,            label: "DUI",            widthCls: "w-28"          },
  { field: null,            label: "Tipo contrib.",  widthCls: "w-36"          },
  { field: null,            label: "Teléfono",       widthCls: "w-28"          },
  { field: null,            label: "Correo",         widthCls: "min-w-[160px]" },
  { field: null,            label: "Estado",         widthCls: "w-24"          },
];

const COL_COUNT = COLUMNS.length;

interface ActiveCell { rowIndex: number; colIndex: number; }

// ── Props ─────────────────────────────────────────────────────────

interface CustomersTableProps {
  items:        CustomerListItem[];
  selectedId:   string | null;
  onSelect:     (item: CustomerListItem) => void;
  sort:         CustomerSort;
  onSortChange: (sort: CustomerSort) => void;
  isLoading:    boolean;
}

// ── Componente ────────────────────────────────────────────────────

export function CustomersTable({
  items,
  selectedId,
  onSelect,
  sort,
  onSortChange,
  isLoading,
}: CustomersTableProps) {
  const wrapperRef    = useRef<HTMLDivElement>(null);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const activeCellRef = useRef<HTMLTableCellElement | null>(null);

  useEffect(() => { setActiveCell(null); }, [items]);

  useEffect(() => {
    if (activeCellRef.current) {
      activeCellRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeCell]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!items.length) return;
      const NAV_KEYS = ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"];
      if (!NAV_KEYS.includes(e.key)) return;
      e.preventDefault();

      if (activeCell === null) {
        setActiveCell({ rowIndex: 0, colIndex: 0 });
        onSelect(items[0]);
        return;
      }

      const { rowIndex, colIndex } = activeCell;
      switch (e.key) {
        case "ArrowDown": {
          const next = rowIndex < items.length - 1 ? rowIndex + 1 : rowIndex;
          if (next !== rowIndex) { setActiveCell({ rowIndex: next, colIndex }); onSelect(items[next]); }
          break;
        }
        case "ArrowUp": {
          const prev = rowIndex > 0 ? rowIndex - 1 : rowIndex;
          if (prev !== rowIndex) { setActiveCell({ rowIndex: prev, colIndex }); onSelect(items[prev]); }
          break;
        }
        case "ArrowRight": setActiveCell({ rowIndex, colIndex: Math.min(colIndex + 1, COL_COUNT - 1) }); break;
        case "ArrowLeft":  setActiveCell({ rowIndex, colIndex: Math.max(colIndex - 1, 0) }); break;
        case "Home":       setActiveCell({ rowIndex, colIndex: 0 }); break;
        case "End":        setActiveCell({ rowIndex, colIndex: COL_COUNT - 1 }); break;
      }
    },
    [items, activeCell, onSelect],
  );

  function handleCellClick(rowIndex: number, colIndex: number, item: CustomerListItem) {
    setActiveCell({ rowIndex, colIndex });
    if (item.id !== selectedId) onSelect(item);
  }

  function isActive(r: number, c: number) { return activeCell?.rowIndex === r && activeCell?.colIndex === c; }
  function activeCellCls(r: number, c: number) { return isActive(r, c) ? " ring-2 ring-inset ring-white/40" : ""; }
  function cellRef(r: number, c: number): React.RefCallback<HTMLTableCellElement> | null {
    if (!isActive(r, c)) return null;
    return (el) => { activeCellRef.current = el; };
  }

  function handleHeaderClick(field: CustomerSortField | null) {
    if (!field) return;
    onSortChange({ field, direction: sort.field === field && sort.direction === "asc" ? "desc" : "asc" });
  }

  const dash = <span className="opacity-30">—</span>;

  return (
    <div
      ref={wrapperRef}
      role="grid"
      aria-label="Maestro de clientes"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="h-full overflow-auto focus:outline-none focus:ring-2 focus:ring-inset focus:ring-zinc-300 rounded-lg"
    >
      {items.length === 0 && isLoading && (
        <div className="flex flex-col items-center justify-center h-full py-12 text-zinc-400">
          <p className="text-sm">Cargando clientes…</p>
        </div>
      )}

      {items.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center h-full py-12 text-zinc-400">
          <Users size={32} className="mb-2 opacity-25" />
          <p className="text-sm">No se encontraron clientes</p>
        </div>
      )}

      {items.length > 0 && (
        <table className="w-full min-w-[1000px] text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-zinc-50 border-b border-zinc-200">
              {COLUMNS.map(({ field, label, widthCls }) => (
                <th
                  key={label}
                  onClick={() => handleHeaderClick(field)}
                  className={`px-3 py-2.5 text-left text-xs font-semibold text-zinc-400
                              uppercase tracking-wide whitespace-nowrap ${widthCls}
                              ${field ? "cursor-pointer hover:text-zinc-600 select-none" : ""}`}
                >
                  {label}
                  {field && sort.field === field && (
                    <span className="ml-1 opacity-60">{sort.direction === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className={isLoading ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
            {items.map((item, rowIndex) => {
              const isSelected = item.id === selectedId;
              const statusCfg  = STATUS_CONFIG[item.status];
              const taxpayerLabel = item.taxpayer_type ? TAXPAYER_LABELS[item.taxpayer_type] : null;

              return (
                <tr
                  key={item.id}
                  role="row"
                  aria-selected={isSelected}
                  className={`border-b border-zinc-100 cursor-pointer transition-colors
                    ${isSelected
                      ? "bg-zinc-900 text-white"
                      : "hover:bg-zinc-50 text-zinc-700"}`}
                >
                  {/* 0 — Código */}
                  <td
                    ref={cellRef(rowIndex, 0)}
                    onClick={() => handleCellClick(rowIndex, 0, item)}
                    className={`px-3 py-2 whitespace-nowrap font-mono text-xs${activeCellCls(rowIndex, 0)}`}
                  >
                    {item.customer_code}
                  </td>

                  {/* 1 — Nombre */}
                  <td
                    ref={cellRef(rowIndex, 1)}
                    onClick={() => handleCellClick(rowIndex, 1, item)}
                    className={`px-3 py-2 font-medium max-w-[240px] truncate${activeCellCls(rowIndex, 1)}`}
                    title={item.name}
                  >
                    {item.name}
                  </td>

                  {/* 2 — Razón social */}
                  <td
                    ref={cellRef(rowIndex, 2)}
                    onClick={() => handleCellClick(rowIndex, 2, item)}
                    className={`px-3 py-2 text-xs max-w-[200px] truncate${activeCellCls(rowIndex, 2)}`}
                    title={item.legal_name ?? undefined}
                  >
                    {item.legal_name ?? dash}
                  </td>

                  {/* 3 — NIT */}
                  <td
                    ref={cellRef(rowIndex, 3)}
                    onClick={() => handleCellClick(rowIndex, 3, item)}
                    className={`px-3 py-2 whitespace-nowrap font-mono text-xs${activeCellCls(rowIndex, 3)}`}
                  >
                    {item.nit ?? dash}
                  </td>

                  {/* 4 — NRC */}
                  <td
                    ref={cellRef(rowIndex, 4)}
                    onClick={() => handleCellClick(rowIndex, 4, item)}
                    className={`px-3 py-2 whitespace-nowrap font-mono text-xs${activeCellCls(rowIndex, 4)}`}
                  >
                    {item.nrc ?? dash}
                  </td>

                  {/* 5 — DUI */}
                  <td
                    ref={cellRef(rowIndex, 5)}
                    onClick={() => handleCellClick(rowIndex, 5, item)}
                    className={`px-3 py-2 whitespace-nowrap font-mono text-xs${activeCellCls(rowIndex, 5)}`}
                  >
                    {item.dui ?? dash}
                  </td>

                  {/* 6 — Tipo contrib. */}
                  <td
                    ref={cellRef(rowIndex, 6)}
                    onClick={() => handleCellClick(rowIndex, 6, item)}
                    className={`px-3 py-2 whitespace-nowrap text-xs${activeCellCls(rowIndex, 6)}`}
                  >
                    {taxpayerLabel ?? dash}
                  </td>

                  {/* 7 — Teléfono */}
                  <td
                    ref={cellRef(rowIndex, 7)}
                    onClick={() => handleCellClick(rowIndex, 7, item)}
                    className={`px-3 py-2 whitespace-nowrap text-xs${activeCellCls(rowIndex, 7)}`}
                  >
                    {item.phone ?? dash}
                  </td>

                  {/* 8 — Correo */}
                  <td
                    ref={cellRef(rowIndex, 8)}
                    onClick={() => handleCellClick(rowIndex, 8, item)}
                    className={`px-3 py-2 text-xs max-w-[180px] truncate${activeCellCls(rowIndex, 8)}`}
                    title={item.email ?? undefined}
                  >
                    {item.email ?? dash}
                  </td>

                  {/* 9 — Estado */}
                  <td
                    ref={cellRef(rowIndex, 9)}
                    onClick={() => handleCellClick(rowIndex, 9, item)}
                    className={`px-3 py-2 whitespace-nowrap${activeCellCls(rowIndex, 9)}`}
                  >
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                        ${isSelected
                          ? "bg-white/20 text-white border border-white/30"
                          : statusCfg.cls}`}
                    >
                      {statusCfg.label}
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
