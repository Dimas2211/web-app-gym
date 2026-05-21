"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — dte-outgoing-client.tsx
//
// Orquestador visual de la vista global DTE emitidos.
//
// Layout de 3 zonas fijas (sin scroll de página):
//   A — barra de filtros
//   B — grilla principal (scroll interno)
//   C — panel de detalle fiscal (scroll interno, Fase 4)
//
// Los filtros actualizan URL/searchParams con router.push.
// La recarga de datos la hace Next.js al cambiar la URL (Server Component).
// El detalle se carga vía fetch al API route con AbortController.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { DteOutgoingGlobalResult, DteOutgoingGlobalListItem, DteOutgoingDetail } from "../types";
import type { DteOutgoingFiltersOutput } from "../schemas";
import { DteOutgoingTable } from "./dte-outgoing-table";
import {
  DteOutgoingFiltersBar,
  type DteOutgoingFilterState,
  EMPTY_DTE_OUTGOING_FILTERS,
} from "./dte-outgoing-filters-bar";
import { DteOutgoingDetailPanel } from "./dte-outgoing-detail-panel";

// ── Props ─────────────────────────────────────────────────────────

export interface DteOutgoingClientProps {
  initialResult:  DteOutgoingGlobalResult;
  initialFilters: DteOutgoingFiltersOutput;
}

// ── Helpers ───────────────────────────────────────────────────────

function filtersToState(f: DteOutgoingFiltersOutput): DteOutgoingFilterState {
  return {
    search:      f.search      ?? "",
    dteType:     f.dteType     !== "ALL" ? (f.dteType ?? "")     : "",
    status:      f.status      !== "ALL" ? (f.status  ?? "")     : "",
    environment: f.environment !== "ALL" ? (f.environment ?? "") : "",
    dateFrom:    f.dateFrom    ?? "",
    dateTo:      f.dateTo      ?? "",
  };
}

function stateToSearchParams(
  state: DteOutgoingFilterState,
  page: number,
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.search)      params.set("search",      state.search);
  if (state.dteType)     params.set("dteType",     state.dteType);
  if (state.status)      params.set("status",      state.status);
  if (state.environment) params.set("environment", state.environment);
  if (state.dateFrom)    params.set("dateFrom",    state.dateFrom);
  if (state.dateTo)      params.set("dateTo",      state.dateTo);
  if (page > 1)          params.set("page",        String(page));
  return params;
}

// ── Componente ────────────────────────────────────────────────────

export function DteOutgoingClient({
  initialResult,
  initialFilters,
}: DteOutgoingClientProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [filters, setFilters] = useState<DteOutgoingFilterState>(
    filtersToState(initialFilters),
  );
  const [currentPage, setCurrentPage] = useState<number>(initialResult.page);

  const [selectedId, setSelectedId] = useState<string | null>(
    () => initialResult.items[0]?.id ?? null,
  );

  const selectedItem: DteOutgoingGlobalListItem | undefined =
    initialResult.items.find((i) => i.id === selectedId);

  // ── Estado del detalle ────────────────────────────────────────

  const [detail, setDetail]           = useState<DteOutgoingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Ref para cancelar fetch si el usuario cambia de fila rápido
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch del detalle ────────────────────────────────────────

  useEffect(() => {
    // Cancelar fetch anterior si existe
    if (abortRef.current) {
      abortRef.current.abort();
    }

    if (!selectedId) {
      setDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setDetailLoading(true);
    setDetailError(null);

    fetch(`/api/dte/outgoing/${selectedId}`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error ?? `Error ${res.status}`);
        }
        return json.data as DteOutgoingDetail;
      })
      .then((data) => {
        setDetail(data);
        setDetailLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Error al cargar el detalle";
        setDetailError(msg);
        setDetailLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [selectedId]);

  // ── Limpiar detalle al cambiar de página o filtros ───────────

  function clearDetail() {
    setDetail(null);
    setDetailLoading(false);
    setDetailError(null);
  }

  // ── Navegación ────────────────────────────────────────────────

  function pushFilters(state: DteOutgoingFilterState, page: number) {
    const params = stateToSearchParams(state, page);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function handleFiltersChange(patch: Partial<DteOutgoingFilterState>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function handleApply() {
    setCurrentPage(1);
    setSelectedId(null);
    clearDetail();
    pushFilters(filters, 1);
  }

  function handleClear() {
    const cleared = EMPTY_DTE_OUTGOING_FILTERS;
    setFilters(cleared);
    setCurrentPage(1);
    setSelectedId(null);
    clearDetail();
    pushFilters(cleared, 1);
  }

  function handlePageChange(newPage: number) {
    setCurrentPage(newPage);
    setSelectedId(null);
    clearDetail();
    pushFilters(filters, newPage);
  }

  function handleSelect(id: string) {
    if (id !== selectedId) {
      setSelectedId(id);
    }
  }

  // ── Paginación ────────────────────────────────────────────────

  const totalPages = Math.ceil(initialResult.total / initialResult.pageSize);
  const hasPrev    = currentPage > 1;
  const hasNext    = currentPage < totalPages;

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-200">

      {/* ── Zona A: Barra de filtros ──────────────────────── */}
      <DteOutgoingFiltersBar
        filters={filters}
        total={initialResult.total}
        onChange={handleFiltersChange}
        onApply={handleApply}
        onClear={handleClear}
      />

      {/* Indicador de carga durante transición de filtros/página */}
      {isPending && (
        <div className="flex-none flex items-center gap-1.5 px-3 py-1 border-b border-zinc-800 bg-zinc-900 text-xs text-zinc-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Cargando…
        </div>
      )}

      {/* ── Zona B: Grilla principal ──────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <DteOutgoingTable
          items={initialResult.items}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </div>

      {/* ── Paginación ────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex-none flex items-center gap-3 px-3 py-1.5 border-t border-zinc-800 bg-zinc-900 text-xs text-zinc-500">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={!hasPrev || isPending}
            className="px-2 py-0.5 rounded border border-zinc-700 hover:border-zinc-500 hover:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Anterior
          </button>
          <span>
            Página {currentPage} de {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={!hasNext || isPending}
            className="px-2 py-0.5 rounded border border-zinc-700 hover:border-zinc-500 hover:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Siguiente →
          </button>
        </div>
      )}

      {/* ── Zona C: Panel de detalle fiscal ───────────────── */}
      <div className="flex-none border-t border-zinc-800 bg-zinc-900/40">
        {/* Encabezado del panel */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800/60">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Detalle fiscal
          </span>
          {selectedItem && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="font-mono text-[10px] text-zinc-400">
                {selectedItem.control_number ?? selectedItem.generation_code ?? selectedItem.id}
              </span>
              <span className="text-zinc-700">·</span>
              <span className="text-[10px] text-zinc-500">{selectedItem.dte_type_code}</span>
            </>
          )}
          {detailLoading && (
            <Loader2 className="ml-auto h-3 w-3 animate-spin text-zinc-500" />
          )}
        </div>

        {/* Cuerpo del panel — altura fija con scroll interno */}
        <div className="h-[42vh] overflow-y-auto">
          <DteOutgoingDetailPanel
            detail={detail}
            loading={detailLoading}
            error={detailError}
          />
        </div>
      </div>

    </div>
  );
}
