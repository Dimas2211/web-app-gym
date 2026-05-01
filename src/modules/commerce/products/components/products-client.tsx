"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/products — products-client.tsx
//
// Orquestador principal del catálogo maestro de productos.
// Implementa la pantalla maestra según especificación §7, §9, §20.
//
// Búsqueda:    dos campos separados — por código y por nombre (§7)
// Filtros:     categoría, línea, sublínea, proveedor, marca, estado,
//              tipo, controla stock; bodega y nivel de stock visibles
//              como stubs deshabilitados (inventory Etapa 12) (§7)
// Ordenamiento: código, nombre, línea+nombre, línea+código,
//              proveedor+nombre, fecha ingreso; existencia como stub
// Grilla:      scroll vertical y horizontal, sin paginación visual,
//              selección de fila + celda activa, navegación por teclado
//              tipo VFP/ERP (§9). La fila seleccionada gobierna el panel
//              resumen (§19). Sin doble clic para editar.
//
// Flujo de edición:
//   IDLE → KEY_GUARD (clave) → EDIT_OPEN (formulario)
//   El botón "Editar producto" vive en ProductSummaryPanel.
//   No hay atajos directos ni doble clic.
//
// Carga inicial:  initialItems del servidor (sin fetch redundante)
// Actualizaciones: GET /api/products con pageSize=150 (una sola grilla)
// Resumen:     GET /api/products/[id] + inyección client-side de stubs
//
// TODO: cuando el catálogo supere ~500 productos, reemplazar carga
// única con virtualización (@tanstack/react-virtual) o scroll infinito
// (Intersection Observer + append de páginas). La API ya soporta
// paginación incremental; solo cambia el cliente.
// ─────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { Package, Plus } from "lucide-react";

import { ProductSearchBar } from "./product-search-bar";
import { ProductFilters } from "./product-filters";
import { ProductSortSelector } from "./product-sort-selector";
import { ProductsTable } from "./products-table";
import { ProductSummaryPanel, ProductCostsPricesStrip } from "./product-summary-panel";
import { ProductTraceabilityTabs } from "./product-traceability-tabs";
import { ProductStatusDialog } from "./product-status-dialog";
import { NewProductDialog } from "./new-product-dialog";
import { EditKeyGuardDialog } from "./edit-key-guard-dialog";
import { EditProductDialog } from "./edit-product-dialog";

import {
  PRODUCT_STOCK_STUB,
  PRODUCT_TRACEABILITY_STUBS,
} from "../types/product-summary.types";

import type { ProductListItem } from "../types/product.types";
import type {
  ProductFilters as ProductFiltersType,
  ProductSort,
} from "../types/product-filters.types";
import type { ProductSummary } from "../types/product-summary.types";
import type { CategoryLookupItem } from "../queries/lookups/get-categories-lookup";
import type { LineLookupItem } from "../queries/lookups/get-lines-lookup";
import type { SublineLookupItem } from "../queries/lookups/get-sublines-lookup";
import type { UnitLookupItem } from "../queries/lookups/get-units-lookup";
import type { TaxRateLookupItem } from "../queries/lookups/get-tax-rates-lookup";
import type { SupplierLookupItem } from "../queries/lookups/get-suppliers-lookup";

// ── Props ─────────────────────────────────────────────────────────

export interface ProductsClientProps {
  initialItems: ProductListItem[];
  initialTotal: number;
  categories: CategoryLookupItem[];
  allLines: LineLookupItem[];
  allSublines: SublineLookupItem[];
  units: UnitLookupItem[];
  taxRates: TaxRateLookupItem[];
  suppliers: SupplierLookupItem[];
  canManage: boolean;
}

// ── Constantes ────────────────────────────────────────────────────

const PAGE_SIZE = 150;

// ── Tipos locales ─────────────────────────────────────────────────

// Máquina de estados del flujo de edición.
// IDLE → KEY_GUARD (clic en "Editar producto")
// KEY_GUARD → EDIT_OPEN (clave correcta)
// KEY_GUARD → IDLE (cancelar)
// EDIT_OPEN → IDLE (guardar o cancelar)
// No existe transición directa IDLE → EDIT_OPEN.
type EditFlowState = "idle" | "key_guard" | "edit_open";

// ── Helper URL ────────────────────────────────────────────────────

function buildListUrl(filters: ProductFiltersType, sort: ProductSort): string {
  const params = new URLSearchParams();

  if (filters.search_code?.trim())  params.set("search_code",  filters.search_code.trim());
  if (filters.search_name?.trim())  params.set("search_name",  filters.search_name.trim());
  if (filters.status)               params.set("status",        filters.status);
  if (filters.product_type)         params.set("product_type",  filters.product_type);
  if (filters.category_id)          params.set("category_id",   filters.category_id);
  if (filters.line_id)              params.set("line_id",        filters.line_id);
  if (filters.subline_id)           params.set("subline_id",     filters.subline_id);
  if (filters.supplier_id)          params.set("supplier_id",    filters.supplier_id);
  if (filters.brand?.trim())        params.set("brand",          filters.brand.trim());
  if (filters.is_stockable !== undefined)
    params.set("is_stockable",   String(filters.is_stockable));
  if (filters.allow_purchase !== undefined)
    params.set("allow_purchase", String(filters.allow_purchase));
  if (filters.allow_sale !== undefined)
    params.set("allow_sale",     String(filters.allow_sale));

  params.set("sort_field",     sort.field);
  params.set("sort_direction", sort.direction);
  params.set("page",           "1");
  params.set("page_size",      String(PAGE_SIZE));

  return `/api/products?${params.toString()}`;
}

// ── Componente ────────────────────────────────────────────────────

export function ProductsClient({
  initialItems,
  initialTotal,
  categories,
  allLines,
  allSublines,
  units,
  taxRates,
  suppliers,
  canManage,
}: ProductsClientProps) {
  // ── Estado de lista ───────────────────────────────────────────
  const [items, setItems] = useState<ProductListItem[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [isLoadingList, setIsLoadingList] = useState(false);

  // ── Estado de filtros y sort ──────────────────────────────────
  const [filters, setFilters] = useState<ProductFiltersType>({});
  const [sort, setSort] = useState<ProductSort>({ field: "name", direction: "asc" });

  // ── Estado de selección + resumen ────────────────────────────
  const [selectedProduct, setSelectedProduct] = useState<ProductListItem | null>(null);
  const [summary, setSummary] = useState<ProductSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);

  // ── Estado de diálogos ────────────────────────────────────────
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);

  // ── Estado del flujo de edición ───────────────────────────────
  const [editFlow, setEditFlow] = useState<EditFlowState>("idle");

  // ── Fetch de lista ────────────────────────────────────────────
  // isFirstRender evita el fetch redundante en mount:
  // el servidor ya proveyó initialItems en page.tsx.
  const isFirstRender = useRef(true);

  const fetchList = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const url = buildListUrl(filters, sort);
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json() as { items: ProductListItem[]; total: number };
      const newItems = data.items ?? [];
      setItems(newItems);
      setTotal(data.total ?? 0);
      // Si el producto seleccionado ya no está en la nueva lista, limpiar la selección.
      // Patrón funcional: no añade selectedProduct como dependencia del useCallback.
      setSelectedProduct((prev) =>
        prev === null || newItems.some((item) => item.id === prev.id) ? prev : null
      );
    } finally {
      setIsLoadingList(false);
    }
  }, [filters, sort]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    fetchList();
  }, [fetchList]);

  // ── Fetch de resumen ──────────────────────────────────────────
  useEffect(() => {
    if (!selectedProduct) {
      setSummary(null);
      return;
    }

    let cancelled = false;
    setIsLoadingSummary(true);

    fetch(`/api/products/${selectedProduct.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((product) => {
        if (cancelled || !product) return;
        setSummary({
          ...product,
          stock: PRODUCT_STOCK_STUB,
          traceability: PRODUCT_TRACEABILITY_STUBS,
        });
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSummary(false);
      });

    return () => { cancelled = true; };
  }, [selectedProduct?.id, summaryRefreshKey]);

  // ── Handlers de lista ─────────────────────────────────────────

  function handleFiltersChange(next: ProductFiltersType) {
    setFilters(next);
  }

  function handleClearFilters() {
    setFilters({});
  }

  function handleSortChange(next: ProductSort) {
    setSort(next);
  }

  function handleNewProductSuccess() {
    fetchList();
  }

  function handleStatusChangeSuccess() {
    fetchList();
    setSummaryRefreshKey((k) => k + 1);
  }

  // ── Handlers del flujo de edición ────────────────────────────

  // El botón "Editar producto" (en ProductSummaryPanel) dispara esto.
  // Solo avanza a KEY_GUARD — nunca directamente a EDIT_OPEN.
  function handleRequestEdit() {
    setEditFlow("key_guard");
  }

  // Clave correcta → abrir formulario de edición
  function handleKeyGuardSuccess() {
    setEditFlow("edit_open");
  }

  // Cancelar en el portón de clave → volver a IDLE
  function handleKeyGuardCancel() {
    setEditFlow("idle");
  }

  // Éxito o cancelar en el formulario de edición → volver a IDLE
  function handleEditSuccess() {
    fetchList();
    setSummaryRefreshKey((k) => k + 1);
    setEditFlow("idle");
  }

  function handleEditClose() {
    setEditFlow("idle");
  }

  // ── Derivados ─────────────────────────────────────────────────

  const hasActiveFilters =
    !!filters.search_code?.trim() ||
    !!filters.search_name?.trim() ||
    !!filters.status ||
    !!filters.product_type ||
    !!filters.category_id ||
    !!filters.line_id ||
    !!filters.subline_id ||
    !!filters.supplier_id ||
    !!filters.brand?.trim() ||
    filters.is_stockable !== undefined ||
    filters.allow_purchase !== undefined ||
    filters.allow_sale !== undefined;

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-88px)] lg:overflow-hidden">

      {/* ── Controles superiores (fijos, no shrink) ────────────── */}
      <div className="shrink-0 flex flex-col gap-3">

        {/* ── Encabezado ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Package size={18} className="text-zinc-400" />
              <h1 className="text-xl font-bold text-zinc-800">Catálogo de productos</h1>
            </div>
            <p className="text-sm text-zinc-500 mt-0.5">
              {isLoadingList
                ? "Actualizando…"
                : `${total} producto${total !== 1 ? "s" : ""} en el catálogo`}
            </p>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={() => setShowNewDialog(true)}
              className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-lg
                         text-sm font-semibold hover:bg-zinc-800 transition-colors shrink-0"
            >
              <Plus size={15} />
              Nuevo producto
            </button>
          )}
        </div>

        {/* ── Barra de búsqueda + ordenamiento ─────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <ProductSearchBar
            value={filters.search_code ?? ""}
            onChange={(v) =>
              handleFiltersChange({ ...filters, search_code: v || undefined })
            }
            placeholder="Buscar por código…"
          />
          <ProductSearchBar
            value={filters.search_name ?? ""}
            onChange={(v) =>
              handleFiltersChange({ ...filters, search_name: v || undefined })
            }
            placeholder="Buscar por nombre…"
          />
          <ProductSortSelector sort={sort} onChange={handleSortChange} />
        </div>

        {/* ── Filtros ───────────────────────────────────────────── */}
        <ProductFilters
          filters={filters}
          categories={categories}
          allLines={allLines}
          allSublines={allSublines}
          suppliers={suppliers}
          onChange={handleFiltersChange}
          onClear={handleClearFilters}
          hasActiveFilters={hasActiveFilters}
        />

      </div>

      {/* ── Área de datos: layout ERP ─────────────────────────── */}
      <div className="flex flex-col gap-2 lg:flex-1 lg:min-h-0">

        {/* ── Fila central: columna izquierda + panel derecho ──── */}
        <div className="flex flex-col lg:flex-row gap-2 lg:flex-1 lg:min-h-0 min-w-0">

          {/* ── Columna izquierda: grilla + strip de costos + trazabilidad ──── */}
          <div className="flex flex-col gap-2 lg:flex-1 lg:min-h-0 min-w-0">

            {/* Grilla del catálogo */}
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col lg:flex-1 lg:min-h-0">
              <div className="h-[45vh] lg:h-auto lg:flex-1 lg:min-h-0 overflow-auto">
                <ProductsTable
                  items={items}
                  selectedId={selectedProduct?.id ?? null}
                  onSelect={setSelectedProduct}
                  sort={sort}
                  onSortChange={handleSortChange}
                  isLoading={isLoadingList}
                />
              </div>

              {/* Indicador de total */}
              <div className="shrink-0 px-4 py-2 border-t border-zinc-100 bg-zinc-50 text-xs text-zinc-400 text-right">
                {isLoadingList
                  ? "Actualizando lista…"
                  : `${items.length} de ${total} producto${total !== 1 ? "s" : ""}`}
                {total > PAGE_SIZE && !isLoadingList && (
                  <span className="ml-2 text-amber-500">
                    — mostrando los primeros {PAGE_SIZE}
                  </span>
                )}
              </div>
            </div>

            {/* Strip horizontal: costos y precios */}
            <div className="shrink-0 bg-white rounded-xl border border-zinc-200 shadow-sm">
              <ProductCostsPricesStrip summary={summary} />
            </div>

            {/* Trazabilidad: alineada con la grilla, no con el área total */}
            <div className="shrink-0 h-[200px] bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
              <ProductTraceabilityTabs summary={summary} />
            </div>

          </div>

          {/* ── Panel derecho: detalle + inventario ──────────────── */}
          <div className="lg:w-80 xl:w-96 shrink-0 bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
            <ProductSummaryPanel
              summary={summary}
              isLoading={isLoadingSummary}
              canManage={canManage}
              variant="panel"
              onRequestStatusChange={() => setShowStatusDialog(true)}
              onRequestEdit={handleRequestEdit}
            />
          </div>

        </div>

      </div>

      {/* ── Diálogos ──────────────────────────────────────────── */}

      {showNewDialog && (
        <NewProductDialog
          categories={categories}
          allLines={allLines}
          allSublines={allSublines}
          units={units}
          taxRates={taxRates}
          suppliers={suppliers}
          onClose={() => setShowNewDialog(false)}
          onSuccess={handleNewProductSuccess}
        />
      )}

      {showStatusDialog && summary && (
        <ProductStatusDialog
          product={summary}
          onClose={() => setShowStatusDialog(false)}
          onSuccess={handleStatusChangeSuccess}
        />
      )}

      {/* Portón de clave — primer paso obligatorio del flujo de edición */}
      {editFlow === "key_guard" && summary && (
        <EditKeyGuardDialog
          productName={summary.name}
          productCode={summary.product_code}
          onCancel={handleKeyGuardCancel}
          onSuccess={handleKeyGuardSuccess}
        />
      )}

      {/* Formulario de edición — solo accesible tras superar el portón */}
      {editFlow === "edit_open" && summary && (
        <EditProductDialog
          summary={summary}
          categories={categories}
          allLines={allLines}
          allSublines={allSublines}
          units={units}
          taxRates={taxRates}
          suppliers={suppliers}
          onClose={handleEditClose}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
