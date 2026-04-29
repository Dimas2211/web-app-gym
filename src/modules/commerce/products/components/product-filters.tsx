"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/products — product-filters.tsx
//
// Filtros del catálogo maestro. Componente controlado: recibe el
// estado de filtros del padre y notifica cambios.
//
// Filtros implementados (§7 especificación):
//   Categoría, línea, sublínea → cascada client-side
//   Proveedor → select desde lookup
//   Marca → texto libre
//   Estado, tipo, controla stock
//
// Filtros con stub visible (dependientes de commerce/inventory Etapa 12):
//   Bodega → disabled, label explícita
//   Nivel de stock → disabled, label explícita
//
// Lines y sublines se filtran client-side desde props completos.
// ─────────────────────────────────────────────────────────────────

import type { ProductFilters } from "../types/product-filters.types";
import type { CategoryLookupItem } from "../queries/lookups/get-categories-lookup";
import type { LineLookupItem } from "../queries/lookups/get-lines-lookup";
import type { SublineLookupItem } from "../queries/lookups/get-sublines-lookup";
import type { SupplierLookupItem } from "../queries/lookups/get-suppliers-lookup";
import { PRODUCT_STATUS_LABELS } from "../utils/product-status.utils";
import type { ProductStatus, ProductType } from "../types/product.types";
import { Filter, X } from "lucide-react";

interface ProductFiltersProps {
  filters: ProductFilters;
  categories: CategoryLookupItem[];
  allLines: LineLookupItem[];
  allSublines: SublineLookupItem[];
  suppliers: SupplierLookupItem[];
  onChange: (filters: ProductFilters) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
}

const inputCls =
  "border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white " +
  "focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent " +
  "text-zinc-700";

const stubInputCls =
  "border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-zinc-50 " +
  "text-zinc-400 cursor-not-allowed opacity-60";

const PRODUCT_STATUSES: ProductStatus[] = [
  "ACTIVE", "INACTIVE", "DISCONTINUED", "BLOCKED_PURCHASE", "BLOCKED_SALE",
];

const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  PRODUCT: "Producto físico",
  SERVICE: "Servicio",
};

export function ProductFilters({
  filters,
  categories,
  allLines,
  allSublines,
  suppliers,
  onChange,
  onClear,
  hasActiveFilters,
}: ProductFiltersProps) {
  const filteredLines = filters.category_id
    ? allLines.filter((l) => l.category_id === filters.category_id)
    : allLines;

  const filteredSublines = filters.line_id
    ? allSublines.filter((s) => s.line_id === filters.line_id)
    : [];

  function set(key: keyof ProductFilters, value: string | boolean | undefined) {
    const next = { ...filters, [key]: value || undefined };
    // Limpiar dependencias en cascada
    if (key === "category_id") {
      delete next.line_id;
      delete next.subline_id;
    }
    if (key === "line_id") {
      delete next.subline_id;
    }
    onChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter size={14} className="text-zinc-400 shrink-0" />

      {/* Estado */}
      <select
        value={filters.status ?? ""}
        onChange={(e) => set("status", e.target.value as ProductStatus)}
        className={inputCls}
      >
        <option value="">Todos los estados</option>
        {PRODUCT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {PRODUCT_STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      {/* Tipo */}
      <select
        value={filters.product_type ?? ""}
        onChange={(e) => set("product_type", e.target.value as ProductType)}
        className={inputCls}
      >
        <option value="">Todos los tipos</option>
        {(Object.keys(PRODUCT_TYPE_LABELS) as ProductType[]).map((t) => (
          <option key={t} value={t}>
            {PRODUCT_TYPE_LABELS[t]}
          </option>
        ))}
      </select>

      {/* Categoría */}
      {categories.length > 0 && (
        <select
          value={filters.category_id ?? ""}
          onChange={(e) => set("category_id", e.target.value)}
          className={inputCls}
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {/* Línea — visible si hay categoría seleccionada con líneas */}
      {filters.category_id && filteredLines.length > 0 && (
        <select
          value={filters.line_id ?? ""}
          onChange={(e) => set("line_id", e.target.value)}
          className={inputCls}
        >
          <option value="">Todas las líneas</option>
          {filteredLines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}

      {/* Sublínea — visible si hay línea seleccionada con sublíneas */}
      {filters.line_id && filteredSublines.length > 0 && (
        <select
          value={filters.subline_id ?? ""}
          onChange={(e) => set("subline_id", e.target.value)}
          className={inputCls}
        >
          <option value="">Todas las sublíneas</option>
          {filteredSublines.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      {/* Proveedor */}
      {suppliers.length > 0 && (
        <select
          value={filters.supplier_id ?? ""}
          onChange={(e) => set("supplier_id", e.target.value)}
          className={inputCls}
        >
          <option value="">Todos los proveedores</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      {/* Marca — texto libre */}
      <input
        type="text"
        value={filters.brand ?? ""}
        onChange={(e) => set("brand", e.target.value || undefined)}
        placeholder="Marca…"
        className={`${inputCls} w-28`}
      />

      {/* Controla stock */}
      <select
        value={
          filters.is_stockable === undefined
            ? ""
            : filters.is_stockable
            ? "true"
            : "false"
        }
        onChange={(e) =>
          set(
            "is_stockable",
            e.target.value === "" ? undefined : e.target.value === "true"
          )
        }
        className={inputCls}
      >
        <option value="">Stock: todos</option>
        <option value="true">Controla stock</option>
        <option value="false">Sin control</option>
      </select>

      {/* ── Filtros dependientes de commerce/inventory (Etapa 12) ── */}
      {/* Visibles y deshabilitados: expresan el contrato funcional completo */}

      {/* Bodega */}
      <div className="relative" title="Disponible en Etapa 12 — commerce/inventory">
        <select disabled className={stubInputCls}>
          <option>Bodega (Etapa 12)</option>
        </select>
      </div>

      {/* Nivel de stock */}
      <div className="relative" title="Disponible en Etapa 12 — commerce/inventory">
        <select disabled className={stubInputCls}>
          <option>Nivel de stock (Etapa 12)</option>
        </select>
      </div>

      {/* Limpiar filtros */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800
                     px-2 py-1.5 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
        >
          <X size={12} />
          Limpiar
        </button>
      )}
    </div>
  );
}
