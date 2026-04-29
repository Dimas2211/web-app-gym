"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchases-filters-bar.tsx
import Link from "next/link";
import type { KeyboardEvent } from "react";
//
// Bloque A — barra operativa de filtros.
//
// Fila 1 (reales): Proveedor · Correlativo · Estado · Desde · Hasta · Limpiar · N docs
// Fila 2 (stubs):  Nº fiscal · NRC · Tipo doc.  (deshabilitados, estructura ERP)
// ─────────────────────────────────────────────────────────────────

// ── Tipos exportados ──────────────────────────────────────────────

export interface FilterState {
  supplierSearch:    string;
  purchaseCodeSearch: string;
  status:    string;
  dateFrom:  string;
  dateTo:    string;
}

export const EMPTY_FILTERS: FilterState = {
  supplierSearch:    "",
  purchaseCodeSearch: "",
  status:   "",
  dateFrom: "",
  dateTo:   "",
};

// ── Props ─────────────────────────────────────────────────────────

interface PurchasesFiltersBarProps {
  filters:  FilterState;
  total:    number;
  onChange: (patch: Partial<FilterState>) => void;
  onApply:  () => void;
  onClear:  () => void;
}

// ── Estilos internos ──────────────────────────────────────────────

const labelCls = "block text-[9px] font-semibold uppercase tracking-wider text-zinc-600 mb-0.5 select-none";

const realInputCls = [
  "h-6 rounded px-2 text-xs",
  "bg-zinc-800 border border-zinc-700",
  "text-zinc-100 placeholder:text-zinc-600",
  "focus:outline-none focus:border-zinc-500",
].join(" ");

const stubInputCls = [
  "h-6 rounded px-2 text-xs",
  "bg-zinc-900 border border-zinc-800",
  "text-zinc-700 placeholder:text-zinc-700",
  "cursor-not-allowed",
].join(" ");

// ── Componente ────────────────────────────────────────────────────

export function PurchasesFiltersBar({
  filters,
  total,
  onChange,
  onApply,
  onClear,
}: PurchasesFiltersBarProps) {
  const hasFilters =
    !!filters.supplierSearch ||
    !!filters.purchaseCodeSearch ||
    !!filters.status ||
    !!filters.dateFrom ||
    !!filters.dateTo;

  function handleFilterKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      onApply();
    }
  }

  return (
    <div className="flex-none border-b border-zinc-800 bg-zinc-900 px-3 py-2 space-y-1.5">

      {/* ── Fila 1: filtros reales ──────────────────────────────── */}
      <div className="flex items-end gap-2 flex-wrap">

        {/* Proveedor */}
        <div>
          <label className={labelCls}>Proveedor</label>
          <input
            type="text"
            value={filters.supplierSearch}
            onChange={(e) => onChange({ supplierSearch: e.target.value })}
            onKeyDown={handleFilterKeyDown}
            placeholder="Nombre de proveedor…"
            className={`${realInputCls} w-44`}
          />
        </div>

        {/* Correlativo */}
        <div>
          <label className={labelCls}>Correlativo</label>
          <input
            type="text"
            value={filters.purchaseCodeSearch}
            onChange={(e) => onChange({ purchaseCodeSearch: e.target.value })}
            onKeyDown={handleFilterKeyDown}
            placeholder="Código de compra…"
            className={`${realInputCls} w-36`}
          />
        </div>

        {/* Estado */}
        <div>
          <label className={labelCls}>Estado</label>
          <select
            value={filters.status}
            onChange={(e) => onChange({ status: e.target.value })}
            onKeyDown={handleFilterKeyDown}
            className={`${realInputCls} w-28`}
          >
            <option value="">Todos</option>
            <option value="DRAFT">Borrador</option>
            <option value="CONFIRMED">Confirmada</option>
            <option value="CANCELLED">Anulada</option>
          </select>
        </div>

        {/* Desde */}
        <div>
          <label className={labelCls}>Desde</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onChange({ dateFrom: e.target.value })}
            onKeyDown={handleFilterKeyDown}
            className={`${realInputCls} w-34`}
          />
        </div>

        {/* Hasta */}
        <div>
          <label className={labelCls}>Hasta</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onChange({ dateTo: e.target.value })}
            onKeyDown={handleFilterKeyDown}
            className={`${realInputCls} w-34`}
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

        {/* Nueva compra */}
        <Link
          href="/dashboard/purchases/new"
          className="h-6 px-2 text-xs font-medium text-zinc-100 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded transition-colors self-end flex items-center"
        >
          + Nueva compra
        </Link>

        {/* Contador */}
        <span className="ml-auto text-xs text-zinc-500 self-end pb-0.5">
          {total} {total === 1 ? "documento" : "documentos"}
        </span>

      </div>

      {/* ── Fila 2: stubs honestos ──────────────────────────────── */}
      <div className="flex items-end gap-2">

        <div>
          <label className={`${labelCls} text-zinc-700`}>Nº fiscal</label>
          <input
            type="text"
            disabled
            placeholder="—"
            className={`${stubInputCls} w-32`}
          />
        </div>

        <div>
          <label className={`${labelCls} text-zinc-700`}>NRC</label>
          <input
            type="text"
            disabled
            placeholder="—"
            className={`${stubInputCls} w-24`}
          />
        </div>

        <div>
          <label className={`${labelCls} text-zinc-700`}>Tipo doc.</label>
          <select disabled className={`${stubInputCls} w-28`}>
            <option>—</option>
          </select>
        </div>

      </div>

    </div>
  );
}
