"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { downloadXlsx } from "@/lib/reports/xlsx-export";
import { downloadPdf } from "@/lib/reports/pdf-export";
import { captureChartAsPng } from "@/lib/reports/chart-capture";
import { VerticalBarChart } from "@/components/reports/ReportBarChart";
import type { LowAdherenceResponse } from "@/modules/reports/types";

// Distribution histogram of attendance rates in 10-point buckets
const RATE_BUCKETS = [
  { from: 0,  to: 10, color: "#ef4444" },
  { from: 10, to: 20, color: "#f97316" },
  { from: 20, to: 30, color: "#f59e0b" },
  { from: 30, to: 40, color: "#eab308" },
  { from: 40, to: 50, color: "#a3e635" },
  { from: 50, to: 60, color: "#4ade80" },
  { from: 60, to: 70, color: "#22c55e" },
  { from: 70, to: 80, color: "#22c55e" },
  { from: 80, to: 90, color: "#22c55e" },
  { from: 90, to: 101, color: "#22c55e" },
];

function computeDistribution(items: { attendanceRate: number }[]) {
  if (!items.length) return [];
  const maxRate = Math.max(...items.map((i) => i.attendanceRate));
  return RATE_BUCKETS.filter((b) => b.from <= maxRate).map((b) => ({
    label: `${b.from}–${b.to === 101 ? 100 : b.to}%`,
    value: items.filter((i) => i.attendanceRate >= b.from && i.attendanceRate < b.to).length,
    color: b.color,
  }));
}

type Branch = { id: string; name: string };
type Props = { branches: Branch[]; isSuperAdmin: boolean };

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <p className="text-zinc-400 text-xs mb-1">{label}</p>
      <p className="text-white font-semibold text-lg leading-tight">{value}</p>
      {sub && <p className="text-zinc-500 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function AdherenceBar({ rate }: { rate: number }) {
  const color = rate < 30 ? "bg-red-500" : rate < 50 ? "bg-amber-500" : "bg-yellow-500";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${rate}%` }} />
      </div>
      <span className="text-xs text-zinc-400 w-8 text-right">{rate}%</span>
    </div>
  );
}

export function LowAdherenceReport({ branches, isSuperAdmin }: Props) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [branchId, setBranchId] = useState("");
  const [threshold, setThreshold] = useState("50");
  const [data, setData] = useState<LowAdherenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<SVGSVGElement>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ threshold });
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (branchId) params.set("branchId", branchId);
    try {
      const res = await fetch(`/api/reports/clients/low-adherence?${params}`);
      if (!res.ok) throw new Error("Error al cargar el reporte");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, branchId, threshold]);

  useEffect(() => { fetchReport(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFilters = {
    Desde: dateFrom || "Todos",
    Hasta: dateTo || "Todos",
    Sucursal: branches.find((b) => b.id === branchId)?.name ?? "Todas",
    Umbral: `< ${threshold}%`,
  };

  const handleExportXlsx = () => {
    if (!data) return;
    downloadXlsx("baja_adherencia", [{
      name: "Baja adherencia",
      headers: ["Cliente", "Sucursal", "Total clases", "Asistió", "Faltó", "Tasa asistencia"],
      rows: data.items.map((i) => [
        i.clientName, i.branchName, i.totalClasses, i.attended, i.absent, `${i.attendanceRate}%`,
      ]),
    }]);
  };

  const handleExportPdf = async () => {
    if (!data) return;
    const distribution = computeDistribution(data.items);
    const chartImage =
      data.items.length >= 3 && distribution.length >= 2 && chartRef.current
        ? await captureChartAsPng(chartRef.current)
        : null;
    downloadPdf({
      title: `Clientes con baja adherencia (umbral < ${threshold}%)`,
      subtitle: "Lógica: tasa = (asistencias + tardanzas) / total registros × 100. Solo incluye clientes con al menos 1 registro en el período.",
      filters: activeFilters,
      kpis: [
        { label: "Analizados", value: String(data.summary.totalAnalyzed) },
        { label: "Baja adherencia", value: String(data.summary.lowAdherenceCount) },
        { label: "Tasa promedio global", value: `${data.summary.avgAttendanceRate}%` },
      ],
      chartImage: chartImage ?? undefined,
      headers: ["Cliente", "Sucursal", "Total clases", "Asistió", "Faltó", "Tasa"],
      rows: data.items.map((i) => [
        i.clientName, i.branchName, i.totalClasses, i.attended, i.absent, `${i.attendanceRate}%`,
      ]),
      filename: "baja_adherencia",
    });
  };

  return (
    <div className="space-y-6">
      {/* Info de cálculo */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-zinc-400">
        <strong className="text-zinc-300">Cálculo de adherencia:</strong> tasa = (asistencias + tardanzas) ÷ total registros de asistencia × 100.
        Solo se incluyen clientes con al menos 1 registro en el período seleccionado.
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); fetchReport(); }}
        className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-wrap gap-3 items-end"
      >
        <div className="flex flex-col gap-1">
          <label className="text-zinc-400 text-xs">Desde</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 min-w-[150px]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-zinc-400 text-xs">Hasta</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 min-w-[150px]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-zinc-400 text-xs">Umbral adherencia</label>
          <select value={threshold} onChange={(e) => setThreshold(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500">
            <option value="25">Menos del 25%</option>
            <option value="50">Menos del 50%</option>
            <option value="70">Menos del 70%</option>
          </select>
        </div>
        {isSuperAdmin && branches.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-zinc-400 text-xs">Sucursal</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 min-w-[180px]">
              <option value="">Todas las sucursales</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <button type="submit" disabled={loading} className="px-4 py-2 bg-zinc-700 text-white text-sm rounded hover:bg-zinc-600 disabled:opacity-50 transition-colors">
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard label="Clientes analizados" value={data.summary.totalAnalyzed.toLocaleString("es-MX")} />
            <SummaryCard label={`Baja adherencia (< ${data.summary.threshold}%)`} value={data.summary.lowAdherenceCount.toLocaleString("es-MX")} sub="Requieren seguimiento" />
            <SummaryCard label="Tasa promedio global" value={`${data.summary.avgAttendanceRate}%`} />
          </div>

          {/* Distribución por rangos — muestra cuántos clientes caen en cada tramo de 10% */}
          {data.items.length >= 3 && (() => {
            const dist = computeDistribution(data.items);
            return dist.length >= 2 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <VerticalBarChart
                  svgRef={chartRef}
                  title="Distribución por rango de tasa de asistencia"
                  data={dist}
                  valueFormatter={(v) => String(v)}
                />
              </div>
            ) : null;
          })()}

          {data.items.length === 0 ? (
            <div className="text-center text-zinc-500 py-12 bg-zinc-900 border border-zinc-800 rounded-lg">
              {data.summary.totalAnalyzed === 0
                ? "No hay registros de asistencia para el período seleccionado."
                : `No hay clientes con adherencia menor al ${threshold}% en el período.`}
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      {["Cliente", "Sucursal", "Total clases", "Asistió", "Faltó", "Tasa"].map((h) => (
                        <th key={h} className="text-left text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.clientId} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{item.clientName}</td>
                        <td className="px-4 py-3 text-zinc-300">{item.branchName}</td>
                        <td className="px-4 py-3 text-right text-zinc-400">{item.totalClasses}</td>
                        <td className="px-4 py-3 text-right text-green-400">{item.attended}</td>
                        <td className="px-4 py-3 text-right text-red-400">{item.absent}</td>
                        <td className="px-4 py-3"><AdherenceBar rate={item.attendanceRate} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
