"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/reports — commerce-reports-client.tsx
//
// Orquestador del dashboard de reportes comerciales.
// Carga datos desde /api/reports/commerce/dashboard.
// Filtra por fecha y periodo rápido. Todo client-side después
// de la carga inicial del SSR (que solo provee la shell).
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, FileText } from "lucide-react";

import type { CommerceDashboardData } from "../types/commerce-report.types";
import type { KpiReportPalette } from "../utils/kpi-report-palettes";
import { getRandomKpiReportPalette, getDefaultKpiReportPalette } from "../utils/kpi-report-palettes";
import { getDefaultDateRange } from "../utils/report-date-range";

import { CommerceReportFilters, type ReportFilterState } from "./commerce-report-filters";
import { CommerceKpiCards }           from "./commerce-kpi-cards";
import { SalesPeriodChart }           from "./sales-period-chart";
import { PurchasesPeriodChart }       from "./purchases-period-chart";
import { TopProductsChart }           from "./top-products-chart";
import { TopServicesChart }           from "./top-services-chart";
import { ServiceSalesPieChart }       from "./service-sales-pie-chart";
import { ProductVsServiceChart }      from "./product-vs-service-chart";
import { PurchasesBySupplierChart }   from "./purchases-by-supplier-chart";
import { CommerceReportDetailTable }  from "./commerce-report-detail-table";
import { CommerceTabularReports }     from "./commerce-tabular-reports";
import { exportExecutiveKpiPdf }      from "../utils/export-kpi-report-pdf";

// ── Section wrapper ───────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

// ── Main client component ─────────────────────────────────────────

export function CommerceReportsClient() {
  const defaultRange = getDefaultDateRange();

  const [filters, setFilters] = useState<ReportFilterState>({
    date_from: defaultRange.date_from,
    date_to:   defaultRange.date_to,
  });
  const [data,          setData]          = useState<CommerceDashboardData | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [exportingKpi,  setExportingKpi]  = useState(false);
  const [exportKpiErr,  setExportKpiErr]  = useState<string | null>(null);

  // Paleta elegida una sola vez al montar el componente (client-side).
  // useRef evita re-renders; useEffect garantiza que Math.random solo corre
  // en cliente y no durante SSR, previniendo hydration mismatch.
  const paletteRef = useRef<KpiReportPalette>(getDefaultKpiReportPalette());
  useEffect(() => {
    paletteRef.current = getRandomKpiReportPalette();
  }, []);

  const fetchData = useCallback(async (f: ReportFilterState) => {
    if (!f.date_from || !f.date_to) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date_from: f.date_from, date_to: f.date_to });
      const res = await fetch(`/api/reports/commerce/dashboard?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Error al cargar el reporte");
      }
      setData(await res.json() as CommerceDashboardData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga inicial al montar
  useEffect(() => {
    fetchData(filters);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleApply() {
    fetchData(filters);
  }

  function handleExportKpi() {
    if (!data) return;
    setExportKpiErr(null);
    setExportingKpi(true);
    setTimeout(() => {
      try {
        exportExecutiveKpiPdf(
          data,
          { date_from: filters.date_from, date_to: filters.date_to },
          paletteRef.current,
        );
      } catch (e) {
        setExportKpiErr(e instanceof Error ? e.message : "Error al exportar");
      } finally {
        setExportingKpi(false);
      }
    }, 50);
  }

  return (
    <div className="space-y-6">
      {/* Barra de filtros */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <CommerceReportFilters
          filters={filters}
          loading={loading}
          onChange={setFilters}
          onApply={handleApply}
        />
      </div>

      {/* Estado de carga */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Cargando reporte…</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-lg border border-rose-800 bg-rose-900/20 p-4 text-sm text-rose-400">
          {error}
        </div>
      )}

      {/* Sin location activa */}
      {!loading && !error && !data && (
        <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
          Selecciona un período y presiona Consultar.
        </div>
      )}

      {/* Dashboard */}
      {!loading && data && (
        <div className="space-y-6">

          {/* Barra de acciones del dashboard */}
          <div className="flex items-center justify-end gap-2">
            {exportKpiErr && (
              <span className="text-[11px] text-rose-400">{exportKpiErr}</span>
            )}
            <button
              type="button"
              disabled={exportingKpi}
              onClick={handleExportKpi}
              title="Exportar reporte ejecutivo con KPIs y gráficas"
              className="h-7 px-3 text-xs font-medium rounded transition-colors flex items-center gap-1.5 bg-rose-900/60 text-rose-300 hover:bg-rose-800/60 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {exportingKpi
                ? <><Loader2 className="w-3 h-3 animate-spin" />Exportando…</>
                : <><FileText className="w-3 h-3" />PDF Ejecutivo</>
              }
            </button>
          </div>

          {/* KPIs */}
          <CommerceKpiCards summary={data.summary} />

          {/* Ventas y compras por período */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="Ventas por día">
              <SalesPeriodChart data={data.sales_by_period} />
            </Section>
            <Section title="Compras por día">
              <PurchasesPeriodChart data={data.purchases_by_period} />
            </Section>
          </div>

          {/* Top productos y servicios con toggle monto/cantidad */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="Top productos vendidos">
              <TopProductsChart
                byAmount={data.top_products_by_amount}
                byQty={data.top_products_by_qty}
              />
            </Section>
            <Section title="Top servicios vendidos">
              <TopServicesChart
                byAmount={data.top_services_by_amount}
                byQty={data.top_services_by_qty}
              />
            </Section>
          </div>

          {/* Comparativo y distribución */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="Productos vs Servicios">
              <ProductVsServiceChart data={data.product_vs_service} />
            </Section>
            <Section title="Distribución de servicios vendidos">
              <ServiceSalesPieChart data={data.service_distribution} />
            </Section>
          </div>

          {/* Compras por proveedor */}
          <Section title="Compras por proveedor">
            <PurchasesBySupplierChart data={data.purchases_by_supplier} />
          </Section>

          {/* Tabla de detalle diario */}
          <Section title="Detalle por día">
            <CommerceReportDetailTable
              sales={data.sales_by_period}
              purchases={data.purchases_by_period}
            />
          </Section>

          {/* Listados detallados — segunda capa tabular */}
          <CommerceTabularReports filters={filters} />

        </div>
      )}
    </div>
  );
}
