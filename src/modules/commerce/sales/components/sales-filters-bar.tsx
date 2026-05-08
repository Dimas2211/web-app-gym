"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — sales-filters-bar.tsx
//
// Barra operativa de filtros de ventas (Bloque A).
//
// Filtros: search · status · payment_status · date_from · date_to
// ─────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { KeyboardEvent } from "react";

// ── Tipos exportados ──────────────────────────────────────────────

export interface SaleFilterState {
  search:         string;
  status:         string;
  payment_status: string;
  dateFrom:       string;
  dateTo:         string;
}

export const EMPTY_SALE_FILTERS: SaleFilterState = {
  search:         "",
  status:         "",
  payment_status: "",
  dateFrom:       "",
  dateTo:         "",
};

// ── Props ─────────────────────────────────────────────────────────

interface SalesFiltersBarProps {
  filters:  SaleFilterState;
  total:    number;
  onChange: (patch: Partial<SaleFilterState>) => void;
  onApply:  () => void;
  onClear:  () => void;
}

// ── Estilos internos ──────────────────────────────────────────────

const labelCls = "block text-[9px] font-semibold uppercase tracking-wider text-zinc-600 mb-0.5 select-none";

const inputCls = [
  "h-6 rounded px-2 text-xs",
  "bg-zinc-800 border border-zinc-700",
  "text-zinc-100 placeholder:text-zinc-600",
  "focus:outline-none focus:border-zinc-500",
].join(" ");

// ── Componente ────────────────────────────────────────────────────

export function SalesFiltersBar({
  filters,
  total,
  onChange,
  onApply,
  onClear,
}: SalesFiltersBarProps) {
  const hasFilters =
    !!filters.search ||
    !!filters.status ||
    !!filters.payment_status ||
    !!filters.dateFrom ||
    !!filters.dateTo;

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      onApply();
    }
  }

  return (
    <div className="flex-none border-b border-zinc-800 bg-zinc-900 px-3 py-2">
      <div className="flex items-end gap-2 flex-wrap">

        {/* Búsqueda — sale_code o cliente */}
        <div>
          <label className={labelCls}>Búsqueda</label>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="Código o cliente…"
            className={`${inputCls} w-44`}
          />
        </div>

        {/* Estado venta */}
        <div>
          <label className={labelCls}>Estado</label>
          <select
            value={filters.status}
            onChange={(e) => onChange({ status: e.target.value })}
            onKeyDown={handleKeyDown}
            className={`${inputCls} w-28`}
          >
            <option value="">Todos</option>
            <option value="DRAFT">Borrador</option>
            <option value="CONFIRMED">Confirmada</option>
            <option value="CANCELLED">Anulada</option>
          </select>
        </div>

        {/* Estado pago */}
        <div>
          <label className={labelCls}>Estado pago</label>
          <select
            value={filters.payment_status}
            onChange={(e) => onChange({ payment_status: e.target.value })}
            onKeyDown={handleKeyDown}
            className={`${inputCls} w-28`}
          >
            <option value="">Todos</option>
            <option value="UNPAID">Sin pago</option>
            <option value="PARTIAL">Parcial</option>
            <option value="PAID">Pagado</option>
            <option value="REFUNDED">Devuelto</option>
          </select>
        </div>

        {/* Desde */}
        <div>
          <label className={labelCls}>Desde</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onChange({ dateFrom: e.target.value })}
            onKeyDown={handleKeyDown}
            className={`${inputCls} w-34`}
          />
        </div>

        {/* Hasta */}
        <div>
          <label className={labelCls}>Hasta</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onChange({ dateTo: e.target.value })}
            onKeyDown={handleKeyDown}
            className={`${inputCls} w-34`}
          />
        </div>

        {/* Limpiar */}
        {hasFilters && (
          <button
            onClick={onClear}
            className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700 hover:border-zinc-500 rounded transition-colors self-end"
          >
            Limpiar
          </button>
        )}

        {/* Nueva venta */}
        <Link
          href="/dashboard/sales/new"
          className="h-6 px-2 text-xs font-medium text-zinc-100 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded transition-colors self-end flex items-center"
        >
          + Nueva venta
        </Link>

        {/* Contador */}
        <span className="ml-auto text-xs text-zinc-500 self-end pb-0.5">
          {total} {total === 1 ? "venta" : "ventas"}
        </span>

      </div>
    </div>
  );
}
