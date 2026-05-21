"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — dte-outgoing-client.tsx
//
// Orquestador visual de la vista global DTE emitidos.
//
// Layout de 3 zonas fijas (sin scroll de página):
//   A — barra de filtros
//   B — grilla principal (scroll interno)
//   C — zona inferior: placeholder detalle (Fase 4)
//
// Los filtros actualizan URL/searchParams con router.push.
// La recarga de datos la hace Next.js al cambiar la URL (Server Component).
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { DteOutgoingGlobalResult, DteOutgoingGlobalListItem } from "../types";
import type { DteOutgoingFiltersOutput } from "../schemas";
import { DteOutgoingTable } from "./dte-outgoing-table";
import {
  DteOutgoingFiltersBar,
  type DteOutgoingFilterState,
  EMPTY_DTE_OUTGOING_FILTERS,
} from "./dte-outgoing-filters-bar";

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
    pushFilters(filters, 1);
  }

  function handleClear() {
    const cleared = EMPTY_DTE_OUTGOING_FILTERS;
    setFilters(cleared);
    setCurrentPage(1);
    setSelectedId(null);
    pushFilters(cleared, 1);
  }

  function handlePageChange(newPage: number) {
    setCurrentPage(newPage);
    setSelectedId(null);
    pushFilters(filters, newPage);
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

      {/* Indicador de carga durante transición */}
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
          onSelect={setSelectedId}
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

      {/* ── Zona C: Placeholder detalle (Fase 4) ─────────── */}
      <div className="flex-none border-t border-zinc-800 bg-zinc-900/50 px-4 py-3">
        {selectedItem ? (
          <div className="flex items-center gap-3">
            <div className="text-xs text-zinc-400">
              <span className="font-semibold text-zinc-300">
                DTE seleccionado:
              </span>
              {" "}
              <span className="font-mono">{selectedItem.control_number ?? selectedItem.generation_code ?? selectedItem.id}</span>
              {" · "}
              <span className="text-zinc-500">{selectedItem.dte_type_code}</span>
              {" · "}
              <span className="text-zinc-500">{selectedItem.dte_status}</span>
            </div>
            <span className="ml-auto text-[10px] text-zinc-600 italic">
              Seleccione un DTE para revisar el detalle fiscal — disponible en Fase 4
            </span>
          </div>
        ) : (
          <p className="text-xs text-zinc-600 italic">
            Seleccione un DTE para revisar el detalle fiscal en la siguiente fase.
          </p>
        )}
      </div>

    </div>
  );
}
