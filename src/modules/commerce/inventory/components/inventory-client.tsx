"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/inventory — inventory-client.tsx
//
// Orquestador principal del módulo de inventario.
// Ensamblaje de: grilla de stock, panel lateral, dialogs operativos.
//
// Responsabilidades:
//   - Mantener lista de ProductLocations con filtros y sort
//   - Selección de fila → fetch de detalle → InventorySummaryPanel
//   - Abrir/cerrar InventoryMovementDialog
//   - Abrir/cerrar ProductLocationStatusDialog
//   - Refetch lista + refresh detalle tras operaciones exitosas
//   - Limpiar selección si la fila seleccionada desaparece tras un refetch
//
// Carga inicial: initialItems del servidor (sin fetch redundante en mount)
// Actualizaciones: GET /api/inventory/product-locations con page_size=150
// Detalle: GET /api/inventory/product-locations/[id]
//
// Layout: grid principal (flex-1) | panel lateral (w-80) — pantalla dividida
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { Boxes, Filter } from "lucide-react";

import { ProductLocationsTable }        from "./product-locations-table";
import { InventorySummaryPanel }        from "./inventory-summary-panel";
import { InventoryMovementDialog }      from "./inventory-movement-dialog";
import { ProductLocationStatusDialog }  from "./product-location-status-dialog";

import type { ProductLocationItem, StockAlertLevel } from "../types/inventory.types";
import type { ProductLocationDetail }                from "../types/inventory.types";
import type { ProductLocationSort }                  from "./product-locations-table";

// ── Props ─────────────────────────────────────────────────────────

export interface InventoryClientProps {
  initialItems: ProductLocationItem[];
  initialTotal: number;
  canManage: boolean;
}

// ── Constantes ────────────────────────────────────────────────────

const PAGE_SIZE = 150;

// ── Tipos de filtros locales ──────────────────────────────────────

interface InventoryFilters {
  search_code?: string;
  search_name?: string;
  is_active?:   boolean;        // undefined = todos
  stock_alert?: StockAlertLevel;
}

// ── Helper: construir URL de lista ───────────────────────────────

function buildListUrl(filters: InventoryFilters, sort: ProductLocationSort): string {
  const params = new URLSearchParams();

  if (filters.search_code)     params.set("search_code",    filters.search_code);
  if (filters.search_name)     params.set("search_name",    filters.search_name);
  if (filters.is_active !== undefined)
    params.set("is_active", String(filters.is_active));
  if (filters.stock_alert)     params.set("stock_alert",    filters.stock_alert);

  params.set("sort_field",     sort.field);
  params.set("sort_direction", sort.direction);
  params.set("page_size",      String(PAGE_SIZE));

  return `/api/inventory/product-locations?${params.toString()}`;
}

// ── Componente ────────────────────────────────────────────────────

export function InventoryClient({
  initialItems,
  initialTotal,
  canManage,
}: InventoryClientProps) {

  // ── Lista ─────────────────────────────────────────────────────
  const [items, setItems]             = useState<ProductLocationItem[]>(initialItems);
  const [total, setTotal]             = useState(initialTotal);
  const [isLoadingList, setIsLoadingList] = useState(false);

  // ── Inputs de búsqueda — estado inmediato del input ───────────
  // Se debouncea a 400 ms antes de actualizar filters.
  const [codeInput, setCodeInput] = useState("");
  const [nameInput, setNameInput] = useState("");

  // ── Filtros aplicados (debounced para búsqueda, inmediatos para el resto) ──
  const [filters, setFilters] = useState<InventoryFilters>({
    is_active: true, // default: solo registros activos
  });

  // ── Sort ──────────────────────────────────────────────────────
  const [sort, setSort] = useState<ProductLocationSort>({
    field:     "product_code",
    direction: "asc",
  });

  // ── Selección ─────────────────────────────────────────────────
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [detail, setDetail]           = useState<ProductLocationDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  // Ref para evitar que selectedId forme parte de las deps de fetchList
  // (cambiar la fila seleccionada no debe disparar un refetch del listado)
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // ── Dialogs ───────────────────────────────────────────────────
  const [showMovementDialog, setShowMovementDialog]   = useState(false);
  const [showStatusDialog,   setShowStatusDialog]     = useState(false);

  // ── Derivados ─────────────────────────────────────────────────

  // Fila seleccionada actual — tomada desde la lista para tener siempre
  // el current_stock más reciente tras un refetch.
  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

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

      const data = await res.json() as { items: ProductLocationItem[]; total: number };
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);

      // Si la fila seleccionada ya no está en la nueva lista (por filtro
      // o porque fue eliminada físicamente), limpiar selección y panel.
      const current = selectedIdRef.current;
      if (current && !(data.items ?? []).find((i) => i.id === current)) {
        setSelectedId(null);
        setDetail(null);
      }
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

  // ── Debounce de búsqueda ──────────────────────────────────────
  // Solo los campos de texto se debouncea; is_active y stock_alert
  // actualizan los filtros directamente.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({
        ...f,
        search_code: codeInput.trim() || undefined,
        search_name: nameInput.trim() || undefined,
      }));
    }, 400);
    return () => clearTimeout(t);
  }, [codeInput, nameInput]);

  // ── Fetch de detalle ──────────────────────────────────────────
  // Se dispara al cambiar la selección o tras operaciones exitosas.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setIsLoadingDetail(true);

    fetch(`/api/inventory/product-locations/${selectedId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProductLocationDetail | null) => {
        if (cancelled) return;
        setDetail(data);
      })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setIsLoadingDetail(false); });

    return () => { cancelled = true; };
  }, [selectedId, detailRefreshKey]);

  // ── Handlers ──────────────────────────────────────────────────

  function handleSelect(item: ProductLocationItem) {
    setSelectedId(item.id);
  }

  // Tras cualquier operación exitosa: refrescar lista y detalle.
  // El mismo handler sirve para movimiento y cambio de estado.
  function handleOperationSuccess() {
    fetchList();
    setDetailRefreshKey((k) => k + 1);
  }

  function handleFilterActiveChange(next: "all" | "active" | "inactive") {
    setFilters((f) => ({
      ...f,
      is_active:
        next === "active"   ? true  :
        next === "inactive" ? false : undefined,
    }));
  }

  function handleFilterAlertChange(next: StockAlertLevel | "") {
    setFilters((f) => ({
      ...f,
      stock_alert: next || undefined,
    }));
  }

  // ── Derivados para UI ─────────────────────────────────────────

  const activeFilterValue: "all" | "active" | "inactive" =
    filters.is_active === true  ? "active"   :
    filters.is_active === false ? "inactive" : "all";

  const hasActiveFilters =
    !!codeInput.trim() ||
    !!nameInput.trim() ||
    filters.is_active !== true ||
    !!filters.stock_alert;

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 h-full">

      {/* ── Encabezado ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Boxes size={18} className="text-zinc-400" />
            <h1 className="text-xl font-bold text-zinc-800">Inventario</h1>
          </div>
          <p className="text-sm text-zinc-500 mt-0.5">
            {isLoadingList
              ? "Actualizando…"
              : `${total} registro${total !== 1 ? "s" : ""} en esta ubicación`}
          </p>
        </div>
      </div>

      {/* ── Toolbar: búsqueda + filtros ───────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">

        {/* Búsqueda por código */}
        <input
          type="text"
          placeholder="Buscar por código…"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          className="border border-zinc-300 rounded-lg px-3 py-1.5 text-sm
                     focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent
                     text-zinc-800 w-44"
        />

        {/* Búsqueda por nombre */}
        <input
          type="text"
          placeholder="Buscar por nombre…"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          className="border border-zinc-300 rounded-lg px-3 py-1.5 text-sm
                     focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent
                     text-zinc-800 w-52"
        />

        {/* Filtro de estado */}
        <div className="flex rounded-lg border border-zinc-300 overflow-hidden shrink-0">
          {(["active", "all", "inactive"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => handleFilterActiveChange(v)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors
                ${activeFilterValue === v
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-600 hover:bg-zinc-50"
                } ${v === "all" ? "border-l border-r border-zinc-300" : ""}`}
            >
              {v === "active" ? "Activos" : v === "inactive" ? "Inactivos" : "Todos"}
            </button>
          ))}
        </div>

        {/* Filtro de alerta de stock */}
        <select
          value={filters.stock_alert ?? ""}
          onChange={(e) => handleFilterAlertChange(e.target.value as StockAlertLevel | "")}
          className="border border-zinc-300 rounded-lg px-3 py-1.5 text-sm text-zinc-700
                     focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white shrink-0"
        >
          <option value="">Alerta: todas</option>
          <option value="OK">Alerta: OK</option>
          <option value="LOW">Alerta: stock bajo</option>
          <option value="EMPTY">Alerta: sin stock</option>
        </select>

        {/* Indicador de filtros activos */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            <Filter size={12} />
            <button
              type="button"
              onClick={() => {
                setCodeInput("");
                setNameInput("");
                setFilters({ is_active: true });
              }}
              className="text-zinc-500 hover:text-zinc-700 underline underline-offset-2"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* ── Área principal: grilla + panel lateral ────────────── */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Grilla de stock */}
        <div className="flex-1 min-w-0 bg-white rounded-xl border border-zinc-200 shadow-sm flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">
            <ProductLocationsTable
              items={items}
              selectedId={selectedId}
              onSelect={handleSelect}
              sort={sort}
              onSortChange={setSort}
              isLoading={isLoadingList}
            />
          </div>

          {/* Footer de recuento */}
          <div className="px-4 py-2 border-t border-zinc-100 bg-zinc-50 text-xs text-zinc-400 text-right shrink-0">
            {isLoadingList
              ? "Actualizando lista…"
              : `${items.length} de ${total} registro${total !== 1 ? "s" : ""}`
            }
            {total > PAGE_SIZE && !isLoadingList && (
              <span className="ml-2 text-amber-500">
                — mostrando los primeros {PAGE_SIZE}
              </span>
            )}
          </div>
        </div>

        {/* Panel lateral de detalle */}
        <div className="w-80 shrink-0 bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
          <InventorySummaryPanel
            detail={detail}
            isLoading={isLoadingDetail}
            canManage={canManage}
            onRequestMovement={() => setShowMovementDialog(true)}
            onRequestStatusChange={() => setShowStatusDialog(true)}
          />
        </div>
      </div>

      {/* ── Dialogs ───────────────────────────────────────────── */}

      {/* Registrar movimiento — requiere fila seleccionada y activa */}
      {showMovementDialog && selectedItem && (
        <InventoryMovementDialog
          productLocation={selectedItem}
          onClose={() => setShowMovementDialog(false)}
          onSuccess={handleOperationSuccess}
        />
      )}

      {/* Activar / desactivar registro */}
      {showStatusDialog && selectedItem && (
        <ProductLocationStatusDialog
          productLocation={selectedItem}
          onClose={() => setShowStatusDialog(false)}
          onSuccess={handleOperationSuccess}
        />
      )}
    </div>
  );
}
