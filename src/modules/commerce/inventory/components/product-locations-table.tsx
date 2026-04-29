"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/inventory — product-locations-table.tsx
//
// Grid principal del stock operativo por location.
// Columnas: Código, Nombre, Categoría, Línea, Unidad,
//           Stock actual, Mín., Reorden, Almacén, Estante/Pos.,
//           Activo, Alerta, Actualización
//
// Hereda la lógica operativa validada en products-table.tsx:
//   - Solo lectura, sin edición inline
//   - Fila seleccionada gobierna el panel lateral
//   - Navegación por teclado tipo ERP (ArrowUp/Down/Left/Right, Home, End)
//   - Scroll vertical + horizontal, cabecera sticky
//   - Alta densidad informativa, sin paginación visual
//   - Primer keypress inicializa celda activa en { 0, 0 }
//   - Scroll automático (scrollIntoView nearest)
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { ProductLocationItem, StockAlertLevel } from "../types/inventory.types";
import type {
  ProductLocationSortField,
  SortDirection,
} from "../types/inventory-filters.types";

// ── Props ─────────────────────────────────────────────────────────

export interface ProductLocationSort {
  field: ProductLocationSortField;
  direction: SortDirection;
}

interface ProductLocationsTableProps {
  items: ProductLocationItem[];
  selectedId: string | null;
  onSelect: (item: ProductLocationItem) => void;
  sort: ProductLocationSort;
  onSortChange: (sort: ProductLocationSort) => void;
  isLoading?: boolean;
}

// ── Columnas ──────────────────────────────────────────────────────

const COLUMNS: {
  key: string;
  label: string;
  sortable: boolean;
  sortField?: ProductLocationSortField;
  className?: string;
}[] = [
  { key: "product_code",     label: "Código",     sortable: true,  sortField: "product_code",  className: "w-24 shrink-0" },
  { key: "product_name",     label: "Nombre",     sortable: true,  sortField: "product_name",  className: "min-w-[160px]" },
  { key: "category_name",    label: "Categoría",  sortable: false,                             className: "w-32 shrink-0" },
  { key: "line_name",        label: "Línea",      sortable: false,                             className: "w-28 shrink-0" },
  { key: "unit_symbol",      label: "Unidad",     sortable: false,                             className: "w-16 shrink-0 text-center" },
  { key: "current_stock",    label: "Stock",      sortable: true,  sortField: "current_stock", className: "w-24 shrink-0 text-right" },
  { key: "min_stock",        label: "Mín.",       sortable: true,  sortField: "min_stock",     className: "w-20 shrink-0 text-right" },
  { key: "reorder_quantity", label: "Reorden",    sortable: false,                             className: "w-20 shrink-0 text-right" },
  { key: "warehouse",        label: "Almacén",    sortable: true,  sortField: "warehouse",     className: "w-28 shrink-0" },
  { key: "shelf_position",   label: "Estante/Pos.",sortable: false,                            className: "w-28 shrink-0" },
  { key: "stock_alert",      label: "Alerta",     sortable: false,                             className: "w-20 shrink-0 text-center" },
  { key: "is_active",        label: "Activo",     sortable: false,                             className: "w-16 shrink-0 text-center" },
  { key: "updated_at",       label: "Actualización", sortable: true, sortField: "updated_at",  className: "w-36 shrink-0" },
];

const COL_COUNT = COLUMNS.length;

// ── Badges de alerta de stock ─────────────────────────────────────

const ALERT_BADGE: Record<StockAlertLevel, { label: string; cls: string; selCls: string }> = {
  OK:    { label: "OK",    cls: "bg-emerald-100 text-emerald-700", selCls: "bg-emerald-700 text-emerald-100" },
  LOW:   { label: "Bajo",  cls: "bg-amber-100 text-amber-700",    selCls: "bg-amber-700 text-amber-100"    },
  EMPTY: { label: "Vacío", cls: "bg-red-100 text-red-700",        selCls: "bg-red-700 text-red-100"        },
};

// ── Estilos de cabecera ───────────────────────────────────────────

const thCls =
  "sticky top-0 z-10 bg-zinc-50 px-3 py-2.5 text-left text-xs font-semibold " +
  "text-zinc-500 uppercase tracking-wide whitespace-nowrap select-none border-b border-zinc-200";

// ── Helpers de formato ────────────────────────────────────────────

function formatStock(value: number): string {
  return new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
}

// ── Sub-componente: indicador de sort ────────────────────────────

function SortIndicator({
  field,
  sort,
}: {
  field: ProductLocationSortField;
  sort: ProductLocationSort;
}) {
  if (sort.field !== field) return <span className="ml-1 text-zinc-300">↕</span>;
  return sort.direction === "asc"
    ? <ChevronUp size={13} className="inline ml-0.5 text-zinc-600" />
    : <ChevronDown size={13} className="inline ml-0.5 text-zinc-600" />;
}

// ── Tipo de celda activa ──────────────────────────────────────────

interface ActiveCell {
  rowIndex: number;
  colIndex: number;
}

// ── Componente principal ──────────────────────────────────────────

export function ProductLocationsTable({
  items,
  selectedId,
  onSelect,
  sort,
  onSortChange,
  isLoading = false,
}: ProductLocationsTableProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const activeCellRef = useRef<HTMLTableCellElement | null>(null);

  // Reset celda activa cuando cambia la lista (nuevo fetch / filtros)
  useEffect(() => {
    setActiveCell(null);
  }, [items]);

  // Scroll automático al mover la celda activa
  useEffect(() => {
    if (activeCellRef.current) {
      activeCellRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeCell]);

  // ── Teclado ───────────────────────────────────────────────────

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
        case "Home": {
          setActiveCell({ rowIndex, colIndex: 0 });
          break;
        }
        case "End": {
          setActiveCell({ rowIndex, colIndex: COL_COUNT - 1 });
          break;
        }
      }
    },
    [items, activeCell, onSelect]
  );

  // ── Click en celda ────────────────────────────────────────────

  function handleCellClick(rowIndex: number, colIndex: number, item: ProductLocationItem) {
    setActiveCell({ rowIndex, colIndex });
    if (item.id !== selectedId) {
      onSelect(item);
    }
  }

  // ── Helpers de celda activa ───────────────────────────────────

  function isActive(rowIndex: number, colIndex: number): boolean {
    return activeCell?.rowIndex === rowIndex && activeCell?.colIndex === colIndex;
  }

  function activeCellCls(rowIndex: number, colIndex: number): string {
    return isActive(rowIndex, colIndex) ? " ring-2 ring-inset ring-white/40" : "";
  }

  function cellRef(rowIndex: number, colIndex: number): React.RefCallback<HTMLTableCellElement> | null {
    if (!isActive(rowIndex, colIndex)) return null;
    return (el) => { activeCellRef.current = el; };
  }

  // ── Sort de columnas ──────────────────────────────────────────

  function handleColumnSort(field: ProductLocationSortField) {
    if (sort.field === field) {
      onSortChange({ field, direction: sort.direction === "asc" ? "desc" : "asc" });
    } else {
      onSortChange({ field, direction: "asc" });
    }
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div
      ref={wrapperRef}
      role="grid"
      aria-label="Stock de inventario por ubicación"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="h-full overflow-auto focus:outline-none focus:ring-2 focus:ring-inset focus:ring-zinc-300 rounded-lg"
    >
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`${thCls} ${col.className ?? ""} ${
                  col.sortable ? "cursor-pointer hover:bg-zinc-100" : ""
                }`}
                onClick={
                  col.sortable && col.sortField
                    ? () => handleColumnSort(col.sortField!)
                    : undefined
                }
              >
                {col.label}
                {col.sortable && col.sortField && (
                  <SortIndicator field={col.sortField} sort={sort} />
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {isLoading && (
            <tr>
              <td colSpan={COL_COUNT} className="px-4 py-8 text-center text-sm text-zinc-400">
                Cargando…
              </td>
            </tr>
          )}

          {!isLoading && items.length === 0 && (
            <tr>
              <td colSpan={COL_COUNT} className="px-4 py-10 text-center text-sm text-zinc-400">
                No hay registros de inventario que coincidan con los filtros.
              </td>
            </tr>
          )}

          {!isLoading &&
            items.map((item, rowIndex) => {
              const sel = item.id === selectedId;
              const alert = ALERT_BADGE[item.stock_alert];

              return (
                <tr
                  key={item.id}
                  role="row"
                  aria-selected={sel}
                  className={`border-b border-zinc-100 transition-colors cursor-pointer
                    ${sel
                      ? "bg-zinc-900 text-white"
                      : "hover:bg-zinc-50 text-zinc-700"
                    }`}
                >
                  {/* 0 — Código */}
                  <td
                    ref={cellRef(rowIndex, 0)}
                    onClick={() => handleCellClick(rowIndex, 0, item)}
                    className={`px-3 py-2 font-mono text-xs whitespace-nowrap${activeCellCls(rowIndex, 0)}`}
                  >
                    {item.product_code}
                  </td>

                  {/* 1 — Nombre */}
                  <td
                    ref={cellRef(rowIndex, 1)}
                    onClick={() => handleCellClick(rowIndex, 1, item)}
                    className={`px-3 py-2 whitespace-nowrap${activeCellCls(rowIndex, 1)}`}
                  >
                    <span className="font-medium">{item.product_name}</span>
                  </td>

                  {/* 2 — Categoría */}
                  <td
                    ref={cellRef(rowIndex, 2)}
                    onClick={() => handleCellClick(rowIndex, 2, item)}
                    className={`px-3 py-2 whitespace-nowrap${activeCellCls(rowIndex, 2)}`}
                  >
                    <span className={`text-xs ${sel ? "text-zinc-300" : "text-zinc-500"}`}>
                      {item.category_name}
                    </span>
                  </td>

                  {/* 3 — Línea */}
                  <td
                    ref={cellRef(rowIndex, 3)}
                    onClick={() => handleCellClick(rowIndex, 3, item)}
                    className={`px-3 py-2 whitespace-nowrap${activeCellCls(rowIndex, 3)}`}
                  >
                    <span className={`text-xs ${sel ? "text-zinc-300" : "text-zinc-500"}`}>
                      {item.line_name ?? "—"}
                    </span>
                  </td>

                  {/* 4 — Unidad */}
                  <td
                    ref={cellRef(rowIndex, 4)}
                    onClick={() => handleCellClick(rowIndex, 4, item)}
                    className={`px-3 py-2 text-center whitespace-nowrap${activeCellCls(rowIndex, 4)}`}
                  >
                    <span className={`text-xs ${sel ? "text-zinc-200" : "text-zinc-600"}`}>
                      {item.unit_symbol}
                    </span>
                  </td>

                  {/* 5 — Stock actual */}
                  <td
                    ref={cellRef(rowIndex, 5)}
                    onClick={() => handleCellClick(rowIndex, 5, item)}
                    className={`px-3 py-2 text-right whitespace-nowrap font-mono text-xs${activeCellCls(rowIndex, 5)}`}
                  >
                    <span className={
                      item.stock_alert === "EMPTY"
                        ? sel ? "text-red-300" : "text-red-600 font-semibold"
                        : item.stock_alert === "LOW"
                        ? sel ? "text-amber-300" : "text-amber-600 font-semibold"
                        : ""
                    }>
                      {formatStock(item.current_stock)}
                    </span>
                  </td>

                  {/* 6 — Mínimo */}
                  <td
                    ref={cellRef(rowIndex, 6)}
                    onClick={() => handleCellClick(rowIndex, 6, item)}
                    className={`px-3 py-2 text-right whitespace-nowrap font-mono text-xs${activeCellCls(rowIndex, 6)}`}
                  >
                    <span className={sel ? "text-zinc-300" : "text-zinc-500"}>
                      {formatStock(item.min_stock)}
                    </span>
                  </td>

                  {/* 7 — Reorden */}
                  <td
                    ref={cellRef(rowIndex, 7)}
                    onClick={() => handleCellClick(rowIndex, 7, item)}
                    className={`px-3 py-2 text-right whitespace-nowrap font-mono text-xs${activeCellCls(rowIndex, 7)}`}
                  >
                    <span className={sel ? "text-zinc-300" : "text-zinc-500"}>
                      {formatStock(item.reorder_quantity)}
                    </span>
                  </td>

                  {/* 8 — Almacén */}
                  <td
                    ref={cellRef(rowIndex, 8)}
                    onClick={() => handleCellClick(rowIndex, 8, item)}
                    className={`px-3 py-2 whitespace-nowrap${activeCellCls(rowIndex, 8)}`}
                  >
                    <span className={`text-xs ${sel ? "text-zinc-300" : "text-zinc-500"}`}>
                      {item.warehouse ?? "—"}
                    </span>
                  </td>

                  {/* 9 — Estante / Posición */}
                  <td
                    ref={cellRef(rowIndex, 9)}
                    onClick={() => handleCellClick(rowIndex, 9, item)}
                    className={`px-3 py-2 whitespace-nowrap${activeCellCls(rowIndex, 9)}`}
                  >
                    <span className={`text-xs ${sel ? "text-zinc-300" : "text-zinc-400"}`}>
                      {[item.shelf, item.position].filter(Boolean).join(" / ") || "—"}
                    </span>
                  </td>

                  {/* 10 — Alerta */}
                  <td
                    ref={cellRef(rowIndex, 10)}
                    onClick={() => handleCellClick(rowIndex, 10, item)}
                    className={`px-3 py-2 text-center whitespace-nowrap${activeCellCls(rowIndex, 10)}`}
                  >
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium
                        ${sel ? alert.selCls : alert.cls}`}
                    >
                      {alert.label}
                    </span>
                  </td>

                  {/* 11 — Activo */}
                  <td
                    ref={cellRef(rowIndex, 11)}
                    onClick={() => handleCellClick(rowIndex, 11, item)}
                    className={`px-3 py-2 text-center${activeCellCls(rowIndex, 11)}`}
                  >
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        item.is_active
                          ? sel ? "bg-emerald-300" : "bg-emerald-500"
                          : sel ? "bg-zinc-500" : "bg-zinc-300"
                      }`}
                      title={item.is_active ? "Activo" : "Inactivo"}
                    />
                  </td>

                  {/* 12 — Actualización */}
                  <td
                    ref={cellRef(rowIndex, 12)}
                    onClick={() => handleCellClick(rowIndex, 12, item)}
                    className={`px-3 py-2 whitespace-nowrap font-mono text-xs${activeCellCls(rowIndex, 12)}`}
                  >
                    <span className={sel ? "text-zinc-300" : "text-zinc-400"}>
                      {item.updated_at_label}
                    </span>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
