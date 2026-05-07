"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/products — products-table.tsx
//
// Grid principal del catálogo maestro.
// Columnas según especificación §10 (columnas base):
//   Código, Nombre, Tipo, Categoría, Línea, Sublínea, Marca,
//   Proveedor, Unidad, P.sin IVA, P.con IVA, Stock, Estado
//
// Características operativas:
//   - Solo lectura, sin edición inline, sin doble clic especial
//   - Fila seleccionada gobierna el panel resumen
//   - Celda activa con foco visual fuerte (ring sobre fila seleccionada)
//   - Navegación por teclado tipo VFP/ERP:
//       ArrowDown  → siguiente fila, clamp en última (sin wrap)
//       ArrowUp    → fila anterior, clamp en primera (sin wrap)
//       ArrowRight → siguiente columna, clamp en última
//       ArrowLeft  → columna anterior, clamp en primera
//       Home       → primera columna
//       End        → última columna
//   - Primer keypress inicializa activeCell en { 0, 0 } si es null
//   - Scroll automático vertical y horizontal (scrollIntoView nearest)
//   - P.con IVA calculado a partir de sale_price + tax_rate.rate
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { ProductListItem } from "../types/product.types";
import type { ProductSort, ProductSortField } from "../types/product-filters.types";
import {
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUS_COLORS,
  PRODUCT_TYPE_LABELS,
} from "../utils/product-status.utils";

// ── Props ─────────────────────────────────────────────────────────

interface ProductsTableProps {
  items: ProductListItem[];
  selectedId: string | null;
  onSelect: (product: ProductListItem) => void;
  sort: ProductSort;
  onSortChange: (sort: ProductSort) => void;
  isLoading?: boolean;
}

// ── Columnas ──────────────────────────────────────────────────────
// El índice de columna (colIndex) sigue este orden exacto.

const COLUMNS: {
  key: string;
  label: string;
  sortable: boolean;
  sortField?: ProductSortField;
  className?: string;
}[] = [
  { key: "product_code", label: "Código",    sortable: true,  sortField: "product_code",  className: "w-24 shrink-0" },
  { key: "name",         label: "Nombre",    sortable: true,  sortField: "name",          className: "min-w-[160px]" },
  { key: "product_type", label: "Tipo",      sortable: true,  sortField: "product_type",  className: "w-20 shrink-0" },
  { key: "category",     label: "Categoría", sortable: false,                             className: "w-32 shrink-0" },
  { key: "line",         label: "Línea",     sortable: true,  sortField: "line_name",     className: "w-28 shrink-0" },
  { key: "subline",      label: "Sublínea",  sortable: false,                             className: "w-28 shrink-0" },
  { key: "brand",        label: "Marca",     sortable: false,                             className: "w-24 shrink-0" },
  { key: "supplier",     label: "Proveedor", sortable: true,  sortField: "supplier_name", className: "w-36 shrink-0" },
  { key: "unit",         label: "Unidad",    sortable: false,                             className: "w-16 shrink-0" },
  { key: "sale_price",   label: "P. sin IVA",sortable: true,  sortField: "sale_price",   className: "w-24 shrink-0 text-right" },
  { key: "price_iva",    label: "P. con IVA",sortable: false,                             className: "w-24 shrink-0 text-right" },
  { key: "is_stockable", label: "Stock",     sortable: false,                             className: "w-14 shrink-0 text-center" },
  { key: "status",       label: "Estado",    sortable: true,  sortField: "status",        className: "w-32 shrink-0" },
];

const COL_COUNT = COLUMNS.length;

// ── Estilos de cabecera ───────────────────────────────────────────

const thCls =
  "sticky top-0 z-10 bg-zinc-50 px-3 py-2.5 text-left text-xs font-semibold " +
  "text-zinc-500 uppercase tracking-wide whitespace-nowrap select-none border-b border-zinc-200";

// ── Sub-componentes ───────────────────────────────────────────────

function SortIndicator({ field, sort }: { field: string; sort: ProductSort }) {
  if (sort.field !== field) return <span className="ml-1 text-zinc-300">↕</span>;
  return sort.direction === "asc"
    ? <ChevronUp size={13} className="inline ml-0.5 text-zinc-600" />
    : <ChevronDown size={13} className="inline ml-0.5 text-zinc-600" />;
}

function formatPrice(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-CL", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

// ── Tipo de celda activa ──────────────────────────────────────────

interface ActiveCell {
  rowIndex: number;
  colIndex: number;
}

// ── Componente principal ──────────────────────────────────────────

export function ProductsTable({
  items,
  selectedId,
  onSelect,
  sort,
  onSortChange,
  isLoading = false,
}: ProductsTableProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── Estado de celda activa ────────────────────────────────────
  // Local: no sube al padre. El padre solo conoce la fila seleccionada.
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);

  // Ref al <td> activo para scrollIntoView
  const activeCellRef = useRef<HTMLTableCellElement | null>(null);

  // ── Reset activeCell cuando cambia la lista (nuevo fetch) ─────
  useEffect(() => {
    setActiveCell(null);
  }, [items]);

  // ── Scroll automático al mover la celda activa ────────────────
  useEffect(() => {
    if (activeCellRef.current) {
      activeCellRef.current.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [activeCell]);

  // ── Manejo de teclado ─────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!items.length) return;

      const NAV_KEYS = [
        "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End",
      ];
      if (!NAV_KEYS.includes(e.key)) return;

      e.preventDefault();

      // Primera tecla: inicializar en celda (0, 0)
      if (activeCell === null) {
        setActiveCell({ rowIndex: 0, colIndex: 0 });
        onSelect(items[0]);
        return;
      }

      const { rowIndex, colIndex } = activeCell;

      switch (e.key) {
        case "ArrowDown": {
          // Clamp en última fila — sin wrap vertical
          const next = rowIndex < items.length - 1 ? rowIndex + 1 : rowIndex;
          if (next !== rowIndex) {
            setActiveCell({ rowIndex: next, colIndex });
            onSelect(items[next]);
          }
          break;
        }
        case "ArrowUp": {
          // Clamp en primera fila — sin wrap vertical
          const prev = rowIndex > 0 ? rowIndex - 1 : rowIndex;
          if (prev !== rowIndex) {
            setActiveCell({ rowIndex: prev, colIndex });
            onSelect(items[prev]);
          }
          break;
        }
        case "ArrowRight": {
          // Clamp en última columna
          const nextCol = colIndex < COL_COUNT - 1 ? colIndex + 1 : colIndex;
          setActiveCell({ rowIndex, colIndex: nextCol });
          break;
        }
        case "ArrowLeft": {
          // Clamp en primera columna
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

  // ── Manejo de click en celda ──────────────────────────────────

  function handleCellClick(
    rowIndex: number,
    colIndex: number,
    product: ProductListItem
  ) {
    setActiveCell({ rowIndex, colIndex });
    // Solo llamar onSelect si la fila cambia (evita re-fetch innecesario)
    if (product.id !== selectedId) {
      onSelect(product);
    }
  }

  // ── Helper: determina si una celda es la activa ───────────────

  function isActive(rowIndex: number, colIndex: number): boolean {
    return (
      activeCell?.rowIndex === rowIndex && activeCell?.colIndex === colIndex
    );
  }

  // ── Helper: className adicional para celda activa ─────────────

  function activeCellCls(rowIndex: number, colIndex: number): string {
    return isActive(rowIndex, colIndex)
      ? " ring-2 ring-inset ring-white/40"
      : "";
  }

  // ── Helper: ref condicional para scrollIntoView ───────────────

  function cellRef(
    rowIndex: number,
    colIndex: number
  ): React.RefCallback<HTMLTableCellElement> | null {
    if (!isActive(rowIndex, colIndex)) return null;
    return (el) => {
      activeCellRef.current = el;
    };
  }

  // ── Sort de columnas ──────────────────────────────────────────

  function handleColumnSort(field: ProductSortField) {
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
      aria-label="Catálogo de productos"
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

        <tbody className="[&>tr>td]:scroll-mt-10">
          {isLoading && (
            <tr>
              <td
                colSpan={COL_COUNT}
                className="px-4 py-8 text-center text-sm text-zinc-400"
              >
                Cargando…
              </td>
            </tr>
          )}

          {!isLoading && items.length === 0 && (
            <tr>
              <td
                colSpan={COL_COUNT}
                className="px-4 py-10 text-center text-sm text-zinc-400"
              >
                No hay productos que coincidan con los filtros.
              </td>
            </tr>
          )}

          {!isLoading &&
            items.map((product, rowIndex) => {
              const sel = product.id === selectedId;

              const priceWithTax =
                product.sale_price !== null && product.tax_rate
                  ? product.sale_price * (1 + product.tax_rate.rate / 100)
                  : null;

              return (
                <tr
                  key={product.id}
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
                    onClick={() => handleCellClick(rowIndex, 0, product)}
                    className={`px-3 py-2.5 font-mono text-xs whitespace-nowrap${activeCellCls(rowIndex, 0)}`}
                  >
                    {product.product_code}
                  </td>

                  {/* 1 — Nombre */}
                  <td
                    ref={cellRef(rowIndex, 1)}
                    onClick={() => handleCellClick(rowIndex, 1, product)}
                    className={`px-3 py-2.5 whitespace-nowrap${activeCellCls(rowIndex, 1)}`}
                  >
                    <span className="font-medium">{product.name}</span>
                  </td>

                  {/* 2 — Tipo */}
                  <td
                    ref={cellRef(rowIndex, 2)}
                    onClick={() => handleCellClick(rowIndex, 2, product)}
                    className={`px-3 py-2.5 whitespace-nowrap${activeCellCls(rowIndex, 2)}`}
                  >
                    <span className={`text-xs ${sel ? "text-zinc-300" : "text-zinc-500"}`}>
                      {PRODUCT_TYPE_LABELS[product.product_type] ?? product.product_type}
                    </span>
                  </td>

                  {/* 3 — Categoría */}
                  <td
                    ref={cellRef(rowIndex, 3)}
                    onClick={() => handleCellClick(rowIndex, 3, product)}
                    className={`px-3 py-2.5 whitespace-nowrap${activeCellCls(rowIndex, 3)}`}
                  >
                    <span className={`text-xs ${sel ? "text-zinc-300" : "text-zinc-500"}`}>
                      {product.category.name}
                    </span>
                  </td>

                  {/* 4 — Línea */}
                  <td
                    ref={cellRef(rowIndex, 4)}
                    onClick={() => handleCellClick(rowIndex, 4, product)}
                    className={`px-3 py-2.5 whitespace-nowrap${activeCellCls(rowIndex, 4)}`}
                  >
                    <span className={`text-xs ${sel ? "text-zinc-300" : "text-zinc-500"}`}>
                      {product.line?.name ?? "—"}
                    </span>
                  </td>

                  {/* 5 — Sublínea */}
                  <td
                    ref={cellRef(rowIndex, 5)}
                    onClick={() => handleCellClick(rowIndex, 5, product)}
                    className={`px-3 py-2.5 whitespace-nowrap${activeCellCls(rowIndex, 5)}`}
                  >
                    <span className={`text-xs ${sel ? "text-zinc-300" : "text-zinc-400"}`}>
                      {product.subline?.name ?? "—"}
                    </span>
                  </td>

                  {/* 6 — Marca */}
                  <td
                    ref={cellRef(rowIndex, 6)}
                    onClick={() => handleCellClick(rowIndex, 6, product)}
                    className={`px-3 py-2.5 whitespace-nowrap${activeCellCls(rowIndex, 6)}`}
                  >
                    <span className={`text-xs ${sel ? "text-zinc-300" : "text-zinc-500"}`}>
                      {product.brand ?? "—"}
                    </span>
                  </td>

                  {/* 7 — Proveedor */}
                  <td
                    ref={cellRef(rowIndex, 7)}
                    onClick={() => handleCellClick(rowIndex, 7, product)}
                    className={`px-3 py-2.5 whitespace-nowrap${activeCellCls(rowIndex, 7)}`}
                  >
                    <span className={`text-xs ${sel ? "text-zinc-300" : "text-zinc-500"}`}>
                      {product.supplier?.name ?? "—"}
                    </span>
                  </td>

                  {/* 8 — Unidad */}
                  <td
                    ref={cellRef(rowIndex, 8)}
                    onClick={() => handleCellClick(rowIndex, 8, product)}
                    className={`px-3 py-2.5 whitespace-nowrap${activeCellCls(rowIndex, 8)}`}
                  >
                    <span className={`text-xs ${sel ? "text-zinc-200" : "text-zinc-600"}`}>
                      {product.unit.symbol}
                    </span>
                  </td>

                  {/* 9 — P. sin IVA */}
                  <td
                    ref={cellRef(rowIndex, 9)}
                    onClick={() => handleCellClick(rowIndex, 9, product)}
                    className={`px-3 py-2.5 text-right whitespace-nowrap font-mono text-xs${activeCellCls(rowIndex, 9)}`}
                  >
                    {formatPrice(product.sale_price)}
                  </td>

                  {/* 10 — P. con IVA */}
                  <td
                    ref={cellRef(rowIndex, 10)}
                    onClick={() => handleCellClick(rowIndex, 10, product)}
                    className={`px-3 py-2.5 text-right whitespace-nowrap font-mono text-xs${activeCellCls(rowIndex, 10)}`}
                  >
                    <span className={sel ? "text-zinc-200" : ""}>
                      {formatPrice(priceWithTax)}
                    </span>
                  </td>

                  {/* 11 — Stock */}
                  <td
                    ref={cellRef(rowIndex, 11)}
                    onClick={() => handleCellClick(rowIndex, 11, product)}
                    className={`px-3 py-2.5 text-center${activeCellCls(rowIndex, 11)}`}
                  >
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        product.is_stockable
                          ? sel ? "bg-emerald-300" : "bg-emerald-500"
                          : sel ? "bg-zinc-500" : "bg-zinc-300"
                      }`}
                      title={product.is_stockable ? "Controla stock" : "Sin control de stock"}
                    />
                  </td>

                  {/* 12 — Estado */}
                  <td
                    ref={cellRef(rowIndex, 12)}
                    onClick={() => handleCellClick(rowIndex, 12, product)}
                    className={`px-3 py-2.5 whitespace-nowrap${activeCellCls(rowIndex, 12)}`}
                  >
                    {sel ? (
                      <span className="text-xs text-zinc-200">
                        {PRODUCT_STATUS_LABELS[product.status]}
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                          ${PRODUCT_STATUS_COLORS[product.status]}`}
                      >
                        {PRODUCT_STATUS_LABELS[product.status]}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
