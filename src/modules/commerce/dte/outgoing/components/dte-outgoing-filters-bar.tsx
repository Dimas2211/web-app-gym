"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — dte-outgoing-filters-bar.tsx
//
// Barra de filtros de la vista global DTE emitidos.
// Actualiza URL/searchParams usando useRouter — patrón del proyecto.
// ─────────────────────────────────────────────────────────────────

import type { KeyboardEvent } from "react";

// ── Tipos exportados ──────────────────────────────────────────────

export interface DteOutgoingFilterState {
  search:      string;
  dteType:     string;
  status:      string;
  environment: string;
  dateFrom:    string;
  dateTo:      string;
}

export const EMPTY_DTE_OUTGOING_FILTERS: DteOutgoingFilterState = {
  search:      "",
  dteType:     "",
  status:      "",
  environment: "",
  dateFrom:    "",
  dateTo:      "",
};

// ── Props ─────────────────────────────────────────────────────────

interface DteOutgoingFiltersBarProps {
  filters:  DteOutgoingFilterState;
  total:    number;
  onChange: (patch: Partial<DteOutgoingFilterState>) => void;
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

export function DteOutgoingFiltersBar({
  filters,
  total,
  onChange,
  onApply,
  onClear,
}: DteOutgoingFiltersBarProps) {
  const hasFilters =
    !!filters.search ||
    !!filters.dteType ||
    !!filters.status ||
    !!filters.environment ||
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

        {/* Búsqueda general */}
        <div>
          <label className={labelCls}>Búsqueda</label>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="N° control, código generación, venta…"
            className={`${inputCls} w-56`}
          />
        </div>

        {/* Tipo DTE */}
        <div>
          <label className={labelCls}>Tipo DTE</label>
          <select
            value={filters.dteType}
            onChange={(e) => onChange({ dteType: e.target.value })}
            onKeyDown={handleKeyDown}
            className={`${inputCls} w-24`}
          >
            <option value="">Todos</option>
            <option value="01">FE — 01</option>
            <option value="03">CCFE — 03</option>
            <option value="05">NC — 05</option>
          </select>
        </div>

        {/* Estado fiscal */}
        <div>
          <label className={labelCls}>Estado fiscal</label>
          <select
            value={filters.status}
            onChange={(e) => onChange({ status: e.target.value })}
            onKeyDown={handleKeyDown}
            className={`${inputCls} w-36`}
          >
            <option value="">Todos</option>
            <option value="PENDING_GENERATION">Pendiente</option>
            <option value="GENERATED">Generado</option>
            <option value="SCHEMA_VALIDATED">Validado</option>
            <option value="SIGNED">Firmado</option>
            <option value="SENT">Enviado</option>
            <option value="ACCEPTED">Aceptado</option>
            <option value="REJECTED">Rechazado</option>
            <option value="OBSERVED">Observado</option>
            <option value="INVALIDATION_PENDING">Inv. pendiente</option>
            <option value="INVALIDATED">Invalidado</option>
            <option value="CONTINGENCY_PENDING">Contingencia</option>
            <option value="NOT_REQUIRED">No requerido</option>
          </select>
        </div>

        {/* Ambiente */}
        <div>
          <label className={labelCls}>Ambiente</label>
          <select
            value={filters.environment}
            onChange={(e) => onChange({ environment: e.target.value })}
            onKeyDown={handleKeyDown}
            className={`${inputCls} w-28`}
          >
            <option value="">Todos</option>
            <option value="TEST">TEST</option>
            <option value="PRODUCTION">PRODUCCIÓN</option>
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

        {/* Aplicar */}
        <button
          onClick={onApply}
          className="h-6 px-2 text-xs font-medium text-zinc-100 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded transition-colors self-end"
        >
          Buscar
        </button>

        {/* Limpiar */}
        {hasFilters && (
          <button
            onClick={onClear}
            className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700 hover:border-zinc-500 rounded transition-colors self-end"
          >
            Limpiar
          </button>
        )}

        {/* Contador */}
        <span className="ml-auto text-xs text-zinc-500 self-end pb-0.5">
          {total} {total === 1 ? "DTE" : "DTE"}
        </span>

      </div>
    </div>
  );
}
