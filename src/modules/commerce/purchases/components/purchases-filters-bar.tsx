"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchases-filters-bar.tsx
import Link from "next/link";
import type { KeyboardEvent } from "react";
//
// Barra operativa de filtros — todos funcionales.
//
// Filtros activos:
//   Proveedor (nombre, NRC o NIT) · Correlativo · Nº documento · Estado · Desde · Hasta
//
// Stubs eliminados: Nº fiscal / NRC separado / Tipo doc.
//   - NRC y NIT ya se buscan dentro del campo "Proveedor".
//   - Tipo doc no tiene soporte en la query actual.
// ─────────────────────────────────────────────────────────────────

// ── Tipos exportados ──────────────────────────────────────────────

export interface FilterState {
  supplierSearch:        string;
  purchaseCodeSearch:    string;
  documentNumberSearch:  string;
  status:    string;
  dateFrom:  string;
  dateTo:    string;
}

export const EMPTY_FILTERS: FilterState = {
  supplierSearch:       "",
  purchaseCodeSearch:   "",
  documentNumberSearch: "",
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
    !!filters.documentNumberSearch ||
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
    <div className="flex-none border-b border-zinc-800 bg-zinc-900 px-3 py-2">
      <div className="flex items-end gap-2 flex-wrap">

        {/* Proveedor — busca por nombre, NRC o NIT */}
        <div>
          <label className={labelCls}>Proveedor</label>
          <input
            type="text"
            value={filters.supplierSearch}
            onChange={(e) => onChange({ supplierSearch: e.target.value })}
            onKeyDown={handleFilterKeyDown}
            placeholder="Nombre, NRC o NIT…"
            className={`${realInputCls} w-44`}
          />
        </div>

        {/* Correlativo — busca por purchase_code interno */}
        <div>
          <label className={labelCls}>Correlativo</label>
          <input
            type="text"
            value={filters.purchaseCodeSearch}
            onChange={(e) => onChange({ purchaseCodeSearch: e.target.value })}
            onKeyDown={handleFilterKeyDown}
            placeholder="Código interno…"
            className={`${realInputCls} w-32`}
          />
        </div>

        {/* Nº documento — busca por document_number (nº del comprobante del proveedor) */}
        <div>
          <label className={labelCls}>Nº documento</label>
          <input
            type="text"
            value={filters.documentNumberSearch}
            onChange={(e) => onChange({ documentNumberSearch: e.target.value })}
            onKeyDown={handleFilterKeyDown}
            placeholder="0001-000001…"
            className={`${realInputCls} w-32`}
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

        {/* Importar DTE */}
        <Link
          href="/dashboard/purchases/import"
          className="h-6 px-2 text-xs font-medium text-blue-300 hover:text-blue-100 border border-blue-800/60 hover:border-blue-600 rounded transition-colors self-end flex items-center"
        >
          Importar DTE
        </Link>

        {/* Contador */}
        <span className="ml-auto text-xs text-zinc-500 self-end pb-0.5">
          {total} {total === 1 ? "documento" : "documentos"}
        </span>

      </div>
    </div>
  );
}
