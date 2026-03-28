"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { downloadXlsx } from "@/lib/reports/xlsx-export";
import { downloadPdf } from "@/lib/reports/pdf-export";
import { captureChartAsPng } from "@/lib/reports/chart-capture";
import { VerticalBarChart } from "@/components/reports/ReportBarChart";
import type { RevenueByBranchResponse } from "@/modules/reports/types";

type Branch = { id: string; name: string };

type Props = {
  branches: Branch[];
  isSuperAdmin: boolean;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(value);
}

function shortCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function RevenueByBranchReport({ branches, isSuperAdmin }: Props) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [branchId, setBranchId] = useState("");
  const [data, setData] = useState<RevenueByBranchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
  const chartRef = useRef<SVGSVGElement>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (branchId) params.set("branchId", branchId);

    try {
      const res = await fetch(
        `/api/reports/memberships/revenue-by-branch?${params}`
      );
      if (!res.ok) throw new Error("Error al cargar el reporte");
      const json: RevenueByBranchResponse = await res.json();
      setData(json);
      // Auto-expand when single branch or few branches
      if (json.items.length <= 3) {
        setExpandedBranches(new Set(json.items.map((i) => i.branchId)));
      } else {
        setExpandedBranches(new Set());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, branchId]);

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleBranch = (branchId: string) => {
    setExpandedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) next.delete(branchId);
      else next.add(branchId);
      return next;
    });
  };

  const expandAll = () => {
    if (data) setExpandedBranches(new Set(data.items.map((i) => i.branchId)));
  };

  const collapseAll = () => setExpandedBranches(new Set());

  const activeFilters = {
    Desde: dateFrom || "Todos",
    Hasta: dateTo || "Todos",
    Sucursal: branches.find((b) => b.id === branchId)?.name ?? "Todas",
  };

  const handleExportXlsx = () => {
    if (!data) return;

    // Sheet 1: resumen por sucursal
    const summaryRows = data.items.map((i) => [
      i.branchName,
      i.membershipsSold,
      i.netRevenue,
      i.averageTicket,
    ]);

    // Sheet 2: desglose por sucursal + plan
    const detailRows: (string | number)[][] = [];
    for (const branch of data.items) {
      for (const plan of branch.planBreakdown) {
        detailRows.push([
          branch.branchName,
          plan.planName,
          plan.membershipsSold,
          plan.netRevenue,
          plan.averageTicket,
        ]);
      }
    }

    downloadXlsx("ingresos_por_sucursal", [
      {
        name: "Resumen por sucursal",
        headers: ["Sucursal", "Membresías vendidas", "Ingresos netos", "Ticket promedio"],
        rows: summaryRows,
      },
      {
        name: "Desglose por plan",
        headers: ["Sucursal", "Plan / Tipo", "Membresías vendidas", "Ingresos netos", "Ticket promedio"],
        rows: detailRows,
      },
    ]);
  };

  const handleExportPdf = async () => {
    if (!data) return;
    const chartImage =
      data.items.length >= 2 && chartRef.current
        ? await captureChartAsPng(chartRef.current)
        : null;

    // Build expanded table rows: branch row + plan sub-rows
    const rows: (string | number)[][] = [];
    for (const item of data.items) {
      rows.push([
        item.branchName,
        item.membershipsSold,
        formatCurrency(item.netRevenue),
        formatCurrency(item.averageTicket),
        "",
      ]);
      for (const plan of item.planBreakdown) {
        rows.push([
          `  └ ${plan.planName}`,
          plan.membershipsSold,
          formatCurrency(plan.netRevenue),
          formatCurrency(plan.averageTicket),
          `${item.membershipsSold > 0 ? Math.round((plan.membershipsSold / item.membershipsSold) * 100) : 0}%`,
        ]);
      }
    }

    downloadPdf({
      title: "Ingresos por sucursal — Membresías",
      filters: activeFilters,
      kpis: [
        { label: "Ingresos totales", value: formatCurrency(data.summary.netRevenue) },
        { label: "Membresías vendidas", value: data.summary.membershipsSold.toLocaleString("es-MX") },
        { label: "Ticket promedio", value: formatCurrency(data.summary.averageTicket) },
        { label: "Sucursal top", value: data.summary.topBranch?.branchName ?? "—" },
      ],
      chartImage: chartImage ?? undefined,
      headers: ["Sucursal / Plan", "Membresías", "Ingresos netos", "Ticket promedio", "% del total"],
      rows,
      filename: "ingresos_por_sucursal",
    });
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    fetchReport();
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <form
        onSubmit={handleSubmit}
        className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-wrap gap-3 items-end"
      >
        <div className="flex flex-col gap-1">
          <label className="text-zinc-400 text-xs">Desde</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 min-w-[160px]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-zinc-400 text-xs">Hasta</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 min-w-[160px]"
          />
        </div>

        {isSuperAdmin && branches.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-zinc-400 text-xs">Sucursal</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 min-w-[200px]"
            >
              <option value="">Todas las sucursales</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-zinc-700 text-white text-sm rounded hover:bg-zinc-600 disabled:opacity-50 transition-colors"
        >
          {loading ? "Cargando..." : "Aplicar filtros"}
        </button>

        {(dateFrom || dateTo || branchId) && (
          <button
            type="button"
            onClick={() => { setDateFrom(""); setDateTo(""); setBranchId(""); }}
            className="px-4 py-2 text-zinc-400 text-sm rounded hover:text-white transition-colors"
          >
            Limpiar
          </button>
        )}

        <div className="ml-auto">
          <ExportButtons onExportXlsx={handleExportXlsx} onExportPdf={handleExportPdf} disabled={!data || loading} />
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg p-4">
          {error}
        </div>
      )}

      {/* Skeleton carga inicial */}
      {loading && !data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse h-24" />
          ))}
        </div>
      )}

      {/* Contenido */}
      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Ingresos totales" value={formatCurrency(data.summary.netRevenue)} />
            <SummaryCard label="Membresías vendidas" value={data.summary.membershipsSold.toLocaleString("es-MX")} />
            <SummaryCard label="Ticket promedio" value={formatCurrency(data.summary.averageTicket)} />
            <SummaryCard
              label="Sucursal top"
              value={data.summary.topBranch?.branchName ?? "—"}
              sub={data.summary.topBranch ? formatCurrency(data.summary.topBranch.revenue) : undefined}
            />
          </div>

          {/* Gráfico — solo cuando hay 2+ sucursales */}
          {data.items.length >= 2 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <VerticalBarChart
                svgRef={chartRef}
                title="Ingresos netos por sucursal"
                data={data.items.map((i) => ({
                  label: i.branchName,
                  value: i.netRevenue,
                }))}
                defaultColor="#3b82f6"
                valueFormatter={shortCurrency}
              />
            </div>
          )}

          {/* Tabla con desglose por plan */}
          {data.items.length === 0 ? (
            <div className="text-center text-zinc-500 py-12 bg-zinc-900 border border-zinc-800 rounded-lg">
              Sin datos para el período seleccionado.
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              {/* Controles expandir/colapsar */}
              <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-3">
                <span className="text-zinc-400 text-xs">Desglose por tipo de membresía:</span>
                <button
                  onClick={expandAll}
                  className="text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  Expandir todo
                </button>
                <span className="text-zinc-700 text-xs">·</span>
                <button
                  onClick={collapseAll}
                  className="text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  Colapsar todo
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left text-zinc-400 font-medium px-4 py-3">Sucursal / Plan</th>
                      <th className="text-right text-zinc-400 font-medium px-4 py-3">Membresías</th>
                      <th className="text-right text-zinc-400 font-medium px-4 py-3">Ingresos netos</th>
                      <th className="text-right text-zinc-400 font-medium px-4 py-3">Ticket promedio</th>
                      <th className="text-right text-zinc-400 font-medium px-4 py-3">% ingreso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => {
                      const isExpanded = expandedBranches.has(item.branchId);
                      const hasPlans = item.planBreakdown.length > 0;
                      return (
                        <Fragment key={item.branchId}>
                          {/* Fila de sucursal */}
                          <tr
                            className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors cursor-pointer"
                            onClick={() => hasPlans && toggleBranch(item.branchId)}
                          >
                            <td className="px-4 py-3 text-white font-medium">
                              <span className="flex items-center gap-2">
                                {hasPlans && (
                                  <span className="text-zinc-500 text-xs w-3 inline-block select-none">
                                    {isExpanded ? "▼" : "▶"}
                                  </span>
                                )}
                                {item.branchName}
                                {hasPlans && (
                                  <span className="text-zinc-600 text-xs ml-1">
                                    ({item.planBreakdown.length} {item.planBreakdown.length === 1 ? "tipo" : "tipos"})
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-zinc-300">
                              {item.membershipsSold.toLocaleString("es-MX")}
                            </td>
                            <td className="px-4 py-3 text-right text-zinc-300 font-semibold">
                              {formatCurrency(item.netRevenue)}
                            </td>
                            <td className="px-4 py-3 text-right text-zinc-400">
                              {formatCurrency(item.averageTicket)}
                            </td>
                            <td className="px-4 py-3 text-right text-zinc-400">
                              {data.summary.netRevenue > 0
                                ? `${Math.round((item.netRevenue / data.summary.netRevenue) * 100)}%`
                                : "—"}
                            </td>
                          </tr>
                          {/* Filas de plan (expandidas) */}
                          {isExpanded &&
                            item.planBreakdown.map((plan) => (
                              <tr
                                key={`${item.branchId}-${plan.planId}`}
                                className="border-b border-zinc-800/60 bg-zinc-800/20 hover:bg-zinc-800/40 transition-colors"
                              >
                                <td className="px-4 py-2 text-zinc-300 pl-10">
                                  <span className="text-zinc-600 mr-2">└</span>
                                  {plan.planName}
                                </td>
                                <td className="px-4 py-2 text-right text-zinc-400 text-xs">
                                  {plan.membershipsSold.toLocaleString("es-MX")}
                                </td>
                                <td className="px-4 py-2 text-right text-zinc-400 text-xs">
                                  {formatCurrency(plan.netRevenue)}
                                </td>
                                <td className="px-4 py-2 text-right text-zinc-500 text-xs">
                                  {formatCurrency(plan.averageTicket)}
                                </td>
                                <td className="px-4 py-2 text-right text-zinc-500 text-xs">
                                  {item.membershipsSold > 0
                                    ? `${Math.round((plan.membershipsSold / item.membershipsSold) * 100)}%`
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  {data.items.length > 1 && (
                    <tfoot>
                      <tr className="border-t-2 border-zinc-700 bg-zinc-800/60">
                        <td className="px-4 py-3 text-zinc-300 font-semibold">Total</td>
                        <td className="px-4 py-3 text-right text-zinc-300 font-semibold">
                          {data.summary.membershipsSold.toLocaleString("es-MX")}
                        </td>
                        <td className="px-4 py-3 text-right text-white font-bold">
                          {formatCurrency(data.summary.netRevenue)}
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-300 font-semibold">
                          {formatCurrency(data.summary.averageTicket)}
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-400">100%</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <p className="text-zinc-400 text-xs mb-1">{label}</p>
      <p className="text-white font-semibold text-lg leading-tight truncate">{value}</p>
      {sub && <p className="text-zinc-400 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}
