"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { downloadXlsx } from "@/lib/reports/xlsx-export";
import { downloadPdf } from "@/lib/reports/pdf-export";
import { captureChartAsPng } from "@/lib/reports/chart-capture";
import { HorizontalBarChart } from "@/components/reports/ReportBarChart";
import type { ActiveMembershipsByBranchResponse } from "@/modules/reports/types";

type Branch = { id: string; name: string };
type Props = { branches: Branch[]; isSuperAdmin: boolean };

function formatCurrency(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(v);
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <p className="text-zinc-400 text-xs mb-1">{label}</p>
      <p className="text-white font-semibold text-lg leading-tight">{value}</p>
      {sub && <p className="text-zinc-400 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

export function ActiveMembershipsByBranchReport({ branches, isSuperAdmin }: Props) {
  const [branchId, setBranchId] = useState("");
  const [data, setData] = useState<ActiveMembershipsByBranchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
  const chartRef = useRef<SVGSVGElement>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (branchId) params.set("branchId", branchId);
    try {
      const res = await fetch(`/api/reports/memberships/active-by-branch?${params}`);
      if (!res.ok) throw new Error("Error al cargar el reporte");
      const json: ActiveMembershipsByBranchResponse = await res.json();
      setData(json);
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
  }, [branchId]);

  useEffect(() => { fetchReport(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleBranch = (id: string) => {
    setExpandedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (data) setExpandedBranches(new Set(data.items.map((i) => i.branchId)));
  };
  const collapseAll = () => setExpandedBranches(new Set());

  const activeFilters = {
    Sucursal: branches.find((b) => b.id === branchId)?.name ?? "Todas",
  };

  const handleExportXlsx = () => {
    if (!data) return;

    const summaryRows = data.items.map((i) => [i.branchName, i.activeCount, i.totalValue]);

    const detailRows: (string | number)[][] = [];
    for (const branch of data.items) {
      for (const plan of branch.planBreakdown) {
        detailRows.push([branch.branchName, plan.planName, plan.activeCount, plan.totalValue]);
      }
    }

    downloadXlsx("membresias_activas_por_sucursal", [
      {
        name: "Resumen por sucursal",
        headers: ["Sucursal", "Membresías activas", "Valor total"],
        rows: summaryRows,
      },
      {
        name: "Desglose por plan",
        headers: ["Sucursal", "Plan / Tipo", "Membresías activas", "Valor total"],
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

    const rows: (string | number)[][] = [];
    for (const item of data.items) {
      rows.push([
        item.branchName,
        item.activeCount,
        formatCurrency(item.totalValue),
        data.summary.totalActive > 0
          ? `${Math.round((item.activeCount / data.summary.totalActive) * 100)}%`
          : "—",
      ]);
      for (const plan of item.planBreakdown) {
        rows.push([
          `  └ ${plan.planName}`,
          plan.activeCount,
          formatCurrency(plan.totalValue),
          item.activeCount > 0
            ? `${Math.round((plan.activeCount / item.activeCount) * 100)}%`
            : "—",
        ]);
      }
    }

    downloadPdf({
      title: "Membresías activas por sucursal",
      filters: activeFilters,
      kpis: [
        { label: "Total activas", value: data.summary.totalActive.toLocaleString("es-MX") },
        { label: "Sucursales", value: String(data.summary.branchesWithActive) },
        { label: "Valor total", value: formatCurrency(data.summary.totalValue) },
      ],
      chartImage: chartImage ?? undefined,
      headers: ["Sucursal / Plan", "Membresías activas", "Valor total", "% del total"],
      rows,
      filename: "membresias_activas_por_sucursal",
    });
  };

  const maxCount = data ? Math.max(...data.items.map((i) => i.activeCount), 1) : 1;

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => { e.preventDefault(); fetchReport(); }}
        className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-wrap gap-3 items-end"
      >
        {isSuperAdmin && branches.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-zinc-400 text-xs">Sucursal</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 min-w-[180px]"
            >
              <option value="">Todas las sucursales</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-zinc-700 text-white text-sm rounded hover:bg-zinc-600 disabled:opacity-50 transition-colors"
        >
          {loading ? "Cargando..." : "Aplicar"}
        </button>
        <div className="ml-auto">
          <ExportButtons onExportXlsx={handleExportXlsx} onExportPdf={handleExportPdf} disabled={!data || loading} />
        </div>
      </form>

      {error && <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg p-4">{error}</div>}

      {loading && !data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse h-20" />)}
        </div>
      )}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard label="Total membresías activas" value={data.summary.totalActive.toLocaleString("es-MX")} />
            <SummaryCard label="Sucursales con activas" value={String(data.summary.branchesWithActive)} />
            <SummaryCard label="Valor total en cartera" value={formatCurrency(data.summary.totalValue)} />
          </div>

          {/* Gráfico */}
          {data.items.length >= 2 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <HorizontalBarChart
                svgRef={chartRef}
                title="Membresías activas por sucursal"
                data={data.items.map((i) => ({
                  label: i.branchName,
                  value: i.activeCount,
                }))}
                defaultColor="#10b981"
              />
            </div>
          )}

          {/* Tabla con desglose por plan */}
          {data.items.length === 0 ? (
            <div className="text-center text-zinc-500 py-12 bg-zinc-900 border border-zinc-800 rounded-lg">
              No hay membresías activas para mostrar.
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-3">
                <span className="text-zinc-400 text-xs">Desglose por tipo de membresía:</span>
                <button onClick={expandAll} className="text-xs text-zinc-400 hover:text-white transition-colors">
                  Expandir todo
                </button>
                <span className="text-zinc-700 text-xs">·</span>
                <button onClick={collapseAll} className="text-xs text-zinc-400 hover:text-white transition-colors">
                  Colapsar todo
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left text-zinc-400 font-medium px-4 py-3">Sucursal / Plan</th>
                      <th className="text-right text-zinc-400 font-medium px-4 py-3">Activas</th>
                      <th className="text-left text-zinc-400 font-medium px-4 py-3 w-32">Distribución</th>
                      <th className="text-right text-zinc-400 font-medium px-4 py-3">Valor total</th>
                      <th className="text-right text-zinc-400 font-medium px-4 py-3">% total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => {
                      const isExpanded = expandedBranches.has(item.branchId);
                      const hasPlans = item.planBreakdown.length > 0;
                      return (
                        <Fragment key={item.branchId}>
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
                            <td className="px-4 py-3 text-right text-zinc-300 font-medium">
                              {item.activeCount.toLocaleString("es-MX")}
                            </td>
                            <td className="px-4 py-3">
                              <div className="w-full bg-zinc-800 rounded-full h-1.5">
                                <div
                                  className="bg-emerald-500 h-1.5 rounded-full transition-all"
                                  style={{ width: `${Math.round((item.activeCount / maxCount) * 100)}%` }}
                                />
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-zinc-300">{formatCurrency(item.totalValue)}</td>
                            <td className="px-4 py-3 text-right text-zinc-400">
                              {data.summary.totalActive > 0
                                ? `${Math.round((item.activeCount / data.summary.totalActive) * 100)}%`
                                : "—"}
                            </td>
                          </tr>
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
                                  {plan.activeCount.toLocaleString("es-MX")}
                                </td>
                                <td className="px-4 py-2">
                                  <div className="w-full bg-zinc-800 rounded-full h-1">
                                    <div
                                      className="bg-emerald-600/60 h-1 rounded-full"
                                      style={{ width: `${item.activeCount > 0 ? Math.round((plan.activeCount / item.activeCount) * 100) : 0}%` }}
                                    />
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-right text-zinc-400 text-xs">
                                  {formatCurrency(plan.totalValue)}
                                </td>
                                <td className="px-4 py-2 text-right text-zinc-500 text-xs">
                                  {item.activeCount > 0
                                    ? `${Math.round((plan.activeCount / item.activeCount) * 100)}%`
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
                        <td className="px-4 py-3 text-right text-white font-bold">{data.summary.totalActive.toLocaleString("es-MX")}</td>
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3 text-right text-white font-bold">{formatCurrency(data.summary.totalValue)}</td>
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
