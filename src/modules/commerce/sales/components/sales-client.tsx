"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — sales-client.tsx
//
// Orquestador visual de la pantalla de consulta de ventas.
//
// Layout de 4 zonas fijas (sin scroll de página):
//   A — barra operativa (filtros)
//   B — resumen documental de la venta seleccionada
//   C — grilla de encabezados de venta (scroll interno)
//   D — grilla de líneas de la venta seleccionada (scroll interno)
//
// Estado centralizado:
//   selectedId     — id de la venta activa en grilla C
//   selectedDetail — detalle completo cargado al seleccionar
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import type { SaleListItem, SaleDetail } from "../types/sale.types";
import { SalesTable } from "./sales-table";
import { SaleItemsPanel } from "./sale-items-panel";
import { SaleSummaryPanel } from "./sale-summary-panel";
import {
  SalesFiltersBar,
  type SaleFilterState,
  EMPTY_SALE_FILTERS,
} from "./sales-filters-bar";

// ── Props ─────────────────────────────────────────────────────────

export interface SalesClientProps {
  initialItems: SaleListItem[];
  initialTotal: number;
}

// ── Normalización de fechas desde API (JSON → Date) ───────────────

type ApiSaleListItem = Omit<SaleListItem, "sale_date" | "created_at"> & {
  sale_date:  string | Date;
  created_at: string | Date;
};

function normalizeListItem(item: ApiSaleListItem): SaleListItem {
  return {
    ...item,
    sale_date:  item.sale_date  instanceof Date ? item.sale_date  : new Date(item.sale_date),
    created_at: item.created_at instanceof Date ? item.created_at : new Date(item.created_at),
  };
}

// ── Componente ────────────────────────────────────────────────────

export function SalesClient({ initialItems, initialTotal }: SalesClientProps) {
  const [items,   setItems]   = useState<SaleListItem[]>(initialItems);
  const [total,   setTotal]   = useState<number>(initialTotal);
  const [filters, setFilters] = useState<SaleFilterState>(EMPTY_SALE_FILTERS);

  const [selectedId,     setSelectedId]     = useState<string | null>(
    () => initialItems[0]?.id ?? null,
  );
  const [selectedDetail, setSelectedDetail] = useState<SaleDetail | null>(null);
  const [detailLoading,  setDetailLoading]  = useState(false);

  const filtersRef   = useRef<SaleFilterState>(EMPTY_SALE_FILTERS);
  filtersRef.current = filters;
  const listAbortRef = useRef<AbortController | null>(null);
  const filtersMount = useRef(true);

  // ── Fetch de lista ──────────────────────────────────────────────

  const fetchList = useCallback((nextFilters?: SaleFilterState) => {
    const f = nextFilters ?? filtersRef.current;
    filtersRef.current = f;

    listAbortRef.current?.abort();
    const ctrl = new AbortController();
    listAbortRef.current = ctrl;

    const params = new URLSearchParams({ page_size: "100" });
    if (f.search)         params.set("search",         f.search);
    if (f.status)         params.set("status",         f.status);
    if (f.payment_status) params.set("payment_status", f.payment_status);
    if (f.dateFrom)       params.set("date_from",      f.dateFrom);
    if (f.dateTo)         params.set("date_to",        f.dateTo);

    fetch(`/api/sales?${params}`, {
      signal:      ctrl.signal,
      cache:       "no-store",
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((envelope) => {
        const data = envelope.data ?? envelope;
        const newItems: SaleListItem[] = (data.items as ApiSaleListItem[]).map(normalizeListItem);
        setItems(newItems);
        setTotal(data.total);
        setSelectedId((prev) => {
          if (prev && newItems.some((i) => i.id === prev)) return prev;
          return newItems[0]?.id ?? null;
        });
      })
      .catch(() => {});
  }, []);

  // Debounce 350ms para cambios de filtro de texto
  useEffect(() => {
    if (filtersMount.current) { filtersMount.current = false; return; }
    const id = setTimeout(() => fetchList(filters), 350);
    return () => clearTimeout(id);
  }, [filters, fetchList]);

  // ── Fetch de detalle al seleccionar fila ────────────────────────

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      setDetailLoading(false);
      return;
    }

    setSelectedDetail(null);
    setDetailLoading(true);
    const ctrl = new AbortController();

    fetch(`/api/sales/${selectedId}`, {
      signal:      ctrl.signal,
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((envelope) => {
        setSelectedDetail(envelope.data as SaleDetail);
      })
      .catch(() => {})
      .finally(() => setDetailLoading(false));

    return () => ctrl.abort();
  }, [selectedId]);

  // ── Handlers de filtros ─────────────────────────────────────────

  function handleFilterChange(patch: Partial<SaleFilterState>) {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      filtersRef.current = next;
      return next;
    });
  }

  function handleFilterApply() {
    fetchList(filtersRef.current);
  }

  function handleFilterClear() {
    filtersRef.current = EMPTY_SALE_FILTERS;
    setFilters(EMPTY_SALE_FILTERS);
    fetchList(EMPTY_SALE_FILTERS);
  }

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="-mx-4 sm:-mx-6 -my-8 flex flex-col bg-zinc-950 h-[calc(100vh-3.5rem)] overflow-hidden">

      {/* ── A: Barra operativa ───────────────────────────────────── */}
      <SalesFiltersBar
        filters={filters}
        total={total}
        onChange={handleFilterChange}
        onApply={handleFilterApply}
        onClear={handleFilterClear}
      />

      {/* ── B: Resumen documental ─────────────────────────────────── */}
      <SaleSummaryPanel
        item={selectedItem}
        detail={selectedDetail}
        loading={detailLoading && !selectedDetail}
      />

      {/* ── C: Grilla principal de encabezados ───────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden bg-zinc-950">
        <SalesTable
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* ── D: Grilla de líneas del documento seleccionado ───────── */}
      <div className="flex-none h-44 border-t border-zinc-800 bg-zinc-950 overflow-hidden">
        <SaleItemsPanel
          selectedId={selectedId}
          detail={selectedDetail}
        />
      </div>

    </div>
  );
}
