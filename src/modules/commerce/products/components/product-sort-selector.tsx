"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/products — product-sort-selector.tsx
//
// Selector de campo + dirección de ordenamiento.
// Implementa todos los ordenamientos definidos en la especificación
// funcional (§7 especificacion_pantalla_maestra_productos.md):
//
//   Implementados:
//     código, nombre, línea+nombre, línea+código,
//     proveedor+nombre, fecha de ingreso
//
//   Stub visible (Etapa 12 — commerce/inventory):
//     existencia (stock actual)
// ─────────────────────────────────────────────────────────────────

import { ArrowDownUp } from "lucide-react";
import type { ProductSort, ProductSortField, SortDirection } from "../types/product-filters.types";

interface ProductSortSelectorProps {
  sort: ProductSort;
  onChange: (sort: ProductSort) => void;
}

const SORT_FIELD_LABELS: Record<ProductSortField, string> = {
  product_code:  "Código",
  name:          "Nombre",
  line_name:     "Línea + Nombre",
  line_code:     "Línea + Código",
  supplier_name: "Proveedor + Nombre",
  created_at:    "Fecha de ingreso",
  // Los siguientes quedan por consistencia de tipo pero el select los omite:
  status:        "Estado",
  product_type:  "Tipo",
  sale_price:    "Precio venta",
};

// Orden de aparición en el selector (per especificación §7)
const SORT_FIELDS_ORDERED: ProductSortField[] = [
  "product_code",
  "name",
  "line_name",
  "line_code",
  "supplier_name",
  "created_at",
];

const inputCls =
  "border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white " +
  "focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent text-zinc-700";

export function ProductSortSelector({ sort, onChange }: ProductSortSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <ArrowDownUp size={14} className="text-zinc-400 shrink-0" />

      <select
        value={sort.field}
        onChange={(e) => onChange({ ...sort, field: e.target.value as ProductSortField })}
        className={inputCls}
      >
        {SORT_FIELDS_ORDERED.map((f) => (
          <option key={f} value={f}>
            {SORT_FIELD_LABELS[f]}
          </option>
        ))}
        {/* Stub: existencia requiere commerce/inventory (Etapa 12) */}
        <option value="__stock__" disabled className="text-zinc-400">
          Existencia (Etapa 12)
        </option>
      </select>

      <select
        value={sort.direction}
        onChange={(e) => onChange({ ...sort, direction: e.target.value as SortDirection })}
        className={inputCls}
      >
        <option value="asc">Asc ↑</option>
        <option value="desc">Desc ↓</option>
      </select>
    </div>
  );
}
