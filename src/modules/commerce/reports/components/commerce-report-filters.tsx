"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/reports — commerce-report-filters.tsx
//
// Barra de filtros del dashboard de reportes.
// Fila 1: períodos rápidos + desde/hasta + botón Consultar.
// Fila 2 (colapsable): cliente, proveedor, producto, tipo, límite.
//
// Los filtros de fecha aplican al dashboard gráfico Y a los
// listados detallados.
// Los filtros avanzados aplican SOLO a los listados detallados.
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { type QuickPeriod, getQuickPeriodRange } from "../utils/report-date-range";
import type { FilterOptionsResponse } from "@/app/api/reports/commerce/filter-options/route";

// ── Public state type — extended ────────────────────────────────

export interface ReportFilterState {
  date_from:    string;
  date_to:      string;
  // Advanced — apply to tabular reports only
  customer_id?:  string;
  supplier_id?:  string;
  product_id?:   string;
  product_type?: "PRODUCT" | "SERVICE" | "";
  limit?:        number;
}

interface Props {
  filters:  ReportFilterState;
  loading:  boolean;
  onChange: (f: ReportFilterState) => void;
  onApply:  () => void;
}

const QUICK_PERIODS: { key: QuickPeriod; label: string }[] = [
  { key: "today",   label: "Hoy" },
  { key: "week",    label: "Semana" },
  { key: "month",   label: "Mes" },
  { key: "quarter", label: "Trimestre" },
  { key: "year",    label: "Año" },
];

const LIMIT_OPTIONS = [100, 250, 500] as const;

// ── Helpers ─────────────────────────────────────────────────────

function countAdvancedActive(f: ReportFilterState): number {
  return [f.customer_id, f.supplier_id, f.product_id, f.product_type, f.limit]
    .filter(Boolean).length;
}

// ── Component ────────────────────────────────────────────────────

export function CommerceReportFilters({ filters, loading, onChange, onApply }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [options, setOptions]           = useState<FilterOptionsResponse | null>(null);
  const [loadingOpts, setLoadingOpts]   = useState(false);
  const [optsError, setOptsError]       = useState(false);

  const activeAdvanced = countAdvancedActive(filters);

  // Load filter options when panel is first opened
  useEffect(() => {
    if (!showAdvanced || options !== null || loadingOpts) return;
    setLoadingOpts(true);
    setOptsError(false);
    fetch("/api/reports/commerce/filter-options")
      .then((r) => r.json() as Promise<FilterOptionsResponse>)
      .then((data) => setOptions(data))
      .catch(() => setOptsError(true))
      .finally(() => setLoadingOpts(false));
  }, [showAdvanced, options, loadingOpts]);

  function applyQuick(period: QuickPeriod) {
    const range = getQuickPeriodRange(period);
    onChange({ ...filters, date_from: range.date_from, date_to: range.date_to });
  }

  function clearAdvanced() {
    onChange({
      date_from: filters.date_from,
      date_to:   filters.date_to,
    });
  }

  function setAdv<K extends keyof ReportFilterState>(key: K, value: ReportFilterState[K]) {
    onChange({ ...filters, [key]: value || undefined });
  }

  // ── Derived: list of products scoped to selected product_type ──
  const visibleProducts = options?.products
    ? filters.product_type
      ? options.products.filter((p) => p.product_type === filters.product_type)
      : options.products
    : [];

  return (
    <div className="space-y-3">

      {/* ── Row 1: dates + quick periods ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Quick period buttons */}
        <div className="flex gap-1">
          {QUICK_PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={loading}
              onClick={() => applyQuick(p.key)}
              className="px-3 py-1.5 text-xs font-medium rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-zinc-700 hidden sm:block" />

        {/* Date inputs */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">Desde</label>
          <input
            type="date"
            value={filters.date_from}
            disabled={loading}
            onChange={(e) => onChange({ ...filters, date_from: e.target.value })}
            className="h-8 px-2 text-xs rounded bg-zinc-800 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
          />
          <label className="text-xs text-zinc-500">Hasta</label>
          <input
            type="date"
            value={filters.date_to}
            disabled={loading}
            onChange={(e) => onChange({ ...filters, date_to: e.target.value })}
            className="h-8 px-2 text-xs rounded bg-zinc-800 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
          />
        </div>

        <button
          type="button"
          disabled={loading || !filters.date_from || !filters.date_to}
          onClick={onApply}
          className="h-8 px-4 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
        >
          {loading ? "Cargando…" : "Consultar"}
        </button>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className={`ml-auto flex items-center gap-1.5 h-8 px-3 text-xs rounded border transition-colors ${
            activeAdvanced > 0
              ? "border-blue-600 bg-blue-600/10 text-blue-400"
              : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Filtros avanzados
          {activeAdvanced > 0 && (
            <span className="flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-blue-600 text-white">
              {activeAdvanced}
            </span>
          )}
        </button>
      </div>

      {/* ── Row 2: advanced filters (collapsible) ── */}
      {showAdvanced && (
        <div className="border border-zinc-700/60 rounded-lg bg-zinc-800/40 p-3 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] text-zinc-500 leading-none">
              Filtros avanzados — aplican a los listados detallados
            </p>
            {activeAdvanced > 0 && (
              <button
                type="button"
                onClick={clearAdvanced}
                className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-rose-400 transition-colors"
              >
                <X className="w-3 h-3" /> Limpiar
              </button>
            )}
          </div>

          {/* Loading options */}
          {loadingOpts && (
            <p className="text-xs text-zinc-500">Cargando opciones…</p>
          )}
          {optsError && (
            <p className="text-xs text-rose-400">Error al cargar opciones.</p>
          )}

          {!loadingOpts && options && (
            <div className="flex flex-wrap gap-3">

              {/* Cliente */}
              <div className="flex flex-col gap-1 min-w-[180px]">
                <label className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">
                  Cliente
                </label>
                <select
                  value={filters.customer_id ?? ""}
                  onChange={(e) => setAdv("customer_id", e.target.value || undefined)}
                  className="h-8 px-2 text-xs rounded bg-zinc-800 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-500 min-w-0"
                >
                  <option value="">Todos los clientes</option>
                  {options.customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Proveedor */}
              <div className="flex flex-col gap-1 min-w-[180px]">
                <label className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">
                  Proveedor
                </label>
                <select
                  value={filters.supplier_id ?? ""}
                  onChange={(e) => setAdv("supplier_id", e.target.value || undefined)}
                  className="h-8 px-2 text-xs rounded bg-zinc-800 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-500 min-w-0"
                >
                  <option value="">Todos los proveedores</option>
                  {options.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Tipo primero — scopa los productos del select */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">
                  Tipo
                </label>
                <div className="flex h-8 rounded overflow-hidden border border-zinc-700">
                  {(["", "PRODUCT", "SERVICE"] as const).map((t) => {
                    const label = t === "" ? "Todos" : t === "PRODUCT" ? "Productos" : "Servicios";
                    const active = (filters.product_type ?? "") === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setAdv("product_type", t || undefined);
                          // Clear product_id when type changes (may be incompatible)
                          if (filters.product_id) setAdv("product_id", undefined);
                        }}
                        className={`px-3 text-xs font-medium transition-colors ${
                          active
                            ? "bg-blue-600 text-white"
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Producto / Servicio */}
              <div className="flex flex-col gap-1 min-w-[200px]">
                <label className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">
                  Producto / Servicio
                </label>
                <select
                  value={filters.product_id ?? ""}
                  onChange={(e) => setAdv("product_id", e.target.value || undefined)}
                  className="h-8 px-2 text-xs rounded bg-zinc-800 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-500 min-w-0"
                >
                  <option value="">Todos</option>
                  {visibleProducts.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Límite */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">
                  Límite filas
                </label>
                <div className="flex h-8 rounded overflow-hidden border border-zinc-700">
                  {LIMIT_OPTIONS.map((l) => {
                    const active = (filters.limit ?? 500) === l;
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setAdv("limit", l)}
                        className={`px-3 text-xs font-medium transition-colors ${
                          active
                            ? "bg-blue-600 text-white"
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                        }`}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
}
