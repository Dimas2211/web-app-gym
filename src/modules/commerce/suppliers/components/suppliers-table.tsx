"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — suppliers-table.tsx
//
// Grilla principal del maestro de proveedores.
//
// Columnas: Código, Cód. cuenta, Nombre, Tipo contrib., NIT, NRC,
//           Teléfono, Estado
//
// Navegación tipo ERP (igual que products-table):
//   ArrowDown / ArrowUp → fila anterior/siguiente (clamp, sin wrap)
//   ArrowLeft / ArrowRight → columna anterior/siguiente (clamp)
//   Home → primera columna  |  End → última columna
//   Primer keypress inicializa activeCell en { 0, 0 }
//   Scroll automático (scrollIntoView nearest)
//
// Ordenamiento: clic en cabecera de columnas sortables.
// Selección: fila activa con fondo zinc-900; badge adapta color.
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { Building2 } from "lucide-react";
import type { SupplierListItem, TaxpayerType } from "../types/supplier.types";
import type { SupplierSort, SupplierSortField } from "../types/supplier-filters.types";

// ── Mapas de presentación ─────────────────────────────────────────

const TAXPAYER_LABELS: Record<TaxpayerType, string> = {
  LARGE_TAXPAYER: "Gran contrib.",
  SMALL_TAXPAYER: "Pequeño contrib.",
  NON_TAXPAYER:   "No contrib.",
  FOREIGN:        "Extranjero",
};

const STATUS_CONFIG = {
  active:   { label: "Activo",   cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  inactive: { label: "Inactivo", cls: "bg-zinc-100 text-zinc-500 border border-zinc-200"         },
} as const;

// ── Definición de columnas ────────────────────────────────────────

type ColDef = {
  field:    SupplierSortField | null;
  label:    string;
  widthCls: string;
};

const COLUMNS: ColDef[] = [
  { field: "supplier_code", label: "Código",        widthCls: "w-28"          },
  { field: null,            label: "Cód. cuenta",   widthCls: "w-28"          },
  { field: "name",          label: "Nombre",        widthCls: "min-w-[200px]" },
  { field: "taxpayer_type", label: "Tipo contrib.", widthCls: "w-40"          },
  { field: null,            label: "NIT",           widthCls: "w-36"          },
  { field: null,            label: "NRC",           widthCls: "w-28"          },
  { field: null,            label: "Teléfono",      widthCls: "w-32"          },
  { field: "status",        label: "Estado",        widthCls: "w-24"          },
];

const COL_COUNT = COLUMNS.length;

// ── Tipo de celda activa ──────────────────────────────────────────

interface ActiveCell {
  rowIndex: number;
  colIndex: number;
}

// ── Props ─────────────────────────────────────────────────────────

interface SuppliersTableProps {
  items:        SupplierListItem[];
  selectedId:   string | null;
  onSelect:     (item: SupplierListItem) => void;
  sort:         SupplierSort;
  onSortChange: (sort: SupplierSort) => void;
  isLoading:    boolean;
}

// ── Componente ────────────────────────────────────────────────────

export function SuppliersTable({
  items,
  selectedId,
  onSelect,
  sort,
  onSortChange,
  isLoading,
}: SuppliersTableProps) {
  const wrapperRef    = useRef<HTMLDivElement>(null);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const activeCellRef = useRef<HTMLTableCellElement | null>(null);

  // Reset activeCell cuando cambia la lista (nuevo fetch)
  useEffect(() => {
    setActiveCell(null);
  }, [items]);

  // Scroll automático al mover la celda activa
  useEffect(() => {
    if (activeCellRef.current) {
      activeCellRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeCell]);

  // ── Manejo de teclado ─────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!items.length) return;
      const NAV_KEYS = ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"];
      if (!NAV_KEYS.includes(e.key)) return;
      e.preventDefault();

      // Primera tecla: inicializar en (0, 0)
      if (activeCell === null) {
        setActiveCell({ rowIndex: 0, colIndex: 0 });
        onSelect(items[0]);
        return;
      }

      const { rowIndex, colIndex } = activeCell;

      switch (e.key) {
        case "ArrowDown": {
          const next = rowIndex < items.length - 1 ? rowIndex + 1 : rowIndex;
          if (next !== rowIndex) {
            setActiveCell({ rowIndex: next, colIndex });
            onSelect(items[next]);
          }
          break;
        }
        case "ArrowUp": {
          const prev = rowIndex > 0 ? rowIndex - 1 : rowIndex;
          if (prev !== rowIndex) {
            setActiveCell({ rowIndex: prev, colIndex });
            onSelect(items[prev]);
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
    [items, activeCell, onSelect],
  );

  // ── Click en celda ─────────────────────────────────────────────

  function handleCellClick(rowIndex: number, colIndex: number, item: SupplierListItem) {
    setActiveCell({ rowIndex, colIndex });
    if (item.id !== selectedId) onSelect(item);
  }

  // ── Helpers de celda activa ────────────────────────────────────

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

  // ── Sort de columnas ───────────────────────────────────────────

  function handleHeaderClick(field: SupplierSortField | null) {
    if (!field) return;
    onSortChange({
      field,
      direction: sort.field === field && sort.direction === "asc" ? "desc" : "asc",
    });
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div
      ref={wrapperRef}
      role="grid"
      aria-label="Maestro de proveedores"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="h-full overflow-auto focus:outline-none focus:ring-2 focus:ring-inset focus:ring-zinc-300 rounded-lg"
    >
      {/* Loading inicial: sin datos previos */}
      {items.length === 0 && isLoading && (
        <div className="flex flex-col items-center justify-center h-full py-12 text-zinc-400">
          <p className="text-sm">Cargando proveedores…</p>
        </div>
      )}

      {/* Estado vacío: sin resultados y sin carga en curso */}
      {items.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center h-full py-12 text-zinc-400">
          <Building2 size={32} className="mb-2 opacity-25" />
          <p className="text-sm">No se encontraron proveedores</p>
        </div>
      )}

      {items.length > 0 && (
        <table className="w-full min-w-[820px] text-sm border-collapse">
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
                    <span className="ml-1 opacity-60">
                      {sort.direction === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          {/* opacity-50 mientras refresca con datos previos */}
          <tbody className={isLoading ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
            {items.map((item, rowIndex) => {
              const isSelected = item.id === selectedId;
              const statusCfg  = STATUS_CONFIG[item.status];

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
                    {item.supplier_code}
                  </td>

                  {/* 1 — Cód. cuenta */}
                  <td
                    ref={cellRef(rowIndex, 1)}
                    onClick={() => handleCellClick(rowIndex, 1, item)}
                    className={`px-3 py-2 whitespace-nowrap font-mono text-xs${activeCellCls(rowIndex, 1)}`}
                  >
                    {item.account_code ?? <span className="opacity-30">—</span>}
                  </td>

                  {/* 2 — Nombre */}
                  <td
                    ref={cellRef(rowIndex, 2)}
                    onClick={() => handleCellClick(rowIndex, 2, item)}
                    className={`px-3 py-2 whitespace-nowrap font-medium max-w-[280px] truncate${activeCellCls(rowIndex, 2)}`}
                  >
                    {item.name}
                  </td>

                  {/* 3 — Tipo contrib. */}
                  <td
                    ref={cellRef(rowIndex, 3)}
                    onClick={() => handleCellClick(rowIndex, 3, item)}
                    className={`px-3 py-2 whitespace-nowrap text-xs${activeCellCls(rowIndex, 3)}`}
                  >
                    {TAXPAYER_LABELS[item.taxpayer_type]}
                  </td>

                  {/* 4 — NIT */}
                  <td
                    ref={cellRef(rowIndex, 4)}
                    onClick={() => handleCellClick(rowIndex, 4, item)}
                    className={`px-3 py-2 whitespace-nowrap font-mono text-xs${activeCellCls(rowIndex, 4)}`}
                  >
                    {item.nit ?? <span className="opacity-30">—</span>}
                  </td>

                  {/* 5 — NRC */}
                  <td
                    ref={cellRef(rowIndex, 5)}
                    onClick={() => handleCellClick(rowIndex, 5, item)}
                    className={`px-3 py-2 whitespace-nowrap font-mono text-xs${activeCellCls(rowIndex, 5)}`}
                  >
                    {item.nrc ?? <span className="opacity-30">—</span>}
                  </td>

                  {/* 6 — Teléfono */}
                  <td
                    ref={cellRef(rowIndex, 6)}
                    onClick={() => handleCellClick(rowIndex, 6, item)}
                    className={`px-3 py-2 whitespace-nowrap text-xs${activeCellCls(rowIndex, 6)}`}
                  >
                    {item.phone ?? <span className="opacity-30">—</span>}
                  </td>

                  {/* 7 — Estado */}
                  <td
                    ref={cellRef(rowIndex, 7)}
                    onClick={() => handleCellClick(rowIndex, 7, item)}
                    className={`px-3 py-2 whitespace-nowrap${activeCellCls(rowIndex, 7)}`}
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
