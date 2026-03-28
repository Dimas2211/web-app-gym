"use client";

import { useState, useCallback, useRef } from "react";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { downloadXlsx } from "@/lib/reports/xlsx-export";
import { downloadPdf } from "@/lib/reports/pdf-export";
import { captureChartAsPng } from "@/lib/reports/chart-capture";
import { StackedBarChart } from "@/components/reports/ReportBarChart";
import type { AttendanceByPeriodResponse } from "@/modules/reports/types";

type Branch = { id: string; name: string };
type Props = { branches: Branch[]; isSuperAdmin: boolean };

// Default: current month
function defaultDates() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const to = now.toISOString().split("T")[0];
  return { from, to };
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <p className="text-zinc-400 text-xs mb-1">{label}</p>
      <p className="text-white font-semibold text-lg leading-tight">{value}</p>
      {sub && <p className="text-zinc-500 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

export function AttendanceByPeriodReport({ branches, isSuperAdmin }: Props) {
  const { from, to } = defaultDates();
  const [dateFrom, setDateFrom] = useState(from);
  const [dateTo, setDateTo] = useState(to);
  const [branchId, setBranchId] = useState("");
  const [data, setData] = useState<AttendanceByPeriodResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const chartRef = useRef<SVGSVGElement>(null);

  const fetchReport = useCallback(async () => {
    if (!dateFrom || !dateTo) {
      setDateError("Selecciona un rango de fechas.");
      return;
    }
    setDateError(null);
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ dateFrom, dateTo });
    if (branchId) params.set("branchId", branchId);
    try {
      const res = await fetch(`/api/reports/attendance/by-period?${params}`);
      if (!res.ok) throw new Error("Error al cargar el reporte");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, branchId]);

  const activeFilters = {
    Desde: dateFrom,
    Hasta: dateTo,
    Sucursal: branches.find((b) => b.id === branchId)?.name ?? "Todas",
  };

  const handleExportXlsx = () => {
    if (!data) return;
    downloadXlsx("asistencia_por_periodo", [
      {
        name: "Resumen por día",
        headers: ["Fecha", "Sesiones", "Asistieron", "Faltaron", "Tasa %"],
        rows: data.byDay.map((d) => [d.date, d.totalSessions, d.totalAttended, d.totalAbsent, `${d.attendanceRate}%`]),
      },
      {
        name: "Detalle por clase",
        headers: ["Fecha", "Clase", "Sucursal", "Entrenador", "Capacidad", "Asistieron", "Faltaron", "Tasa %"],
        rows: data.items.map((i) => [
          i.date, i.classTitle, i.branchName, i.trainerName,
          i.capacity, i.attended, i.absent, `${i.attendanceRate}%`,
        ]),
      },
    ]);
  };

  const handleExportPdf = async () => {
    if (!data) return;
    const chartImage =
      data.byDay.length >= 1 && chartRef.current
        ? await captureChartAsPng(chartRef.current)
        : null;
    downloadPdf({
      title: "Asistencia por período",
      filters: activeFilters,
      kpis: [
        { label: "Sesiones", value: String(data.summary.totalSessions) },
        { label: "Asistieron", value: String(data.summary.totalAttended) },
        { label: "Faltaron", value: String(data.summary.totalAbsent) },
        { label: "Tasa global", value: `${data.summary.overallAttendanceRate}%` },
      ],
      chartImage: chartImage ?? undefined,
      headers: ["Fecha", "Clase", "Sucursal", "Entrenador", "Capacidad", "Asistieron", "Faltaron", "Tasa"],
      rows: data.items.map((i) => [
        i.date, i.classTitle, i.branchName, i.trainerName,
        i.capacity, i.attended, i.absent, `${i.attendanceRate}%`,
      ]),
      filename: "asistencia_por_periodo",
    });
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => { e.preventDefault(); fetchReport(); }}
        className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-wrap gap-3 items-end"
      >
        <div className="flex flex-col gap-1">
          <label className="text-zinc-400 text-xs">Desde *</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} required
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 min-w-[150px]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-zinc-400 text-xs">Hasta *</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} required
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 min-w-[150px]" />
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
          {loading ? "Cargando..." : "Consultar"}
        </button>
        <div className="ml-auto">
          <ExportButtons onExportXlsx={handleExportXlsx} onExportPdf={handleExportPdf} disabled={!data || loading} />
        </div>
      </form>

      {dateError && <div className="text-amber-400 text-sm">{dateError}</div>}
      {error && <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg p-4">{error}</div>}

      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse h-20" />)}
        </div>
      )}

      {!data && !loading && (
        <div className="text-center text-zinc-500 py-16 bg-zinc-900 border border-zinc-800 rounded-lg">
          Selecciona un rango de fechas y presiona <strong className="text-zinc-400">Consultar</strong>.
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Sesiones en período" value={data.summary.totalSessions.toLocaleString("es-MX")} />
            <SummaryCard label="Asistencias" value={data.summary.totalAttended.toLocaleString("es-MX")} />
            <SummaryCard label="Ausencias" value={data.summary.totalAbsent.toLocaleString("es-MX")} />
            <SummaryCard label="Tasa global" value={`${data.summary.overallAttendanceRate}%`}
              sub={`${data.summary.avgAttendancePerSession} asist. prom/sesión`} />
          </div>

          {/* Gráfico de tendencia diaria — asistidos (verde, abajo) vs ausentes (rojo, arriba) */}
          {data.byDay.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <StackedBarChart
                svgRef={chartRef}
                title="Asistencia por día"
                data={data.byDay.map((d) => ({
                  label: d.date,
                  values: [
                    { value: d.totalAttended, color: "#10b981", name: "Asistió" },
                    { value: d.totalAbsent,   color: "#dc2626", name: "Faltó"   },
                  ],
                }))}
              />
            </div>
          )}

          {data.items.length === 0 ? (
            <div className="text-center text-zinc-500 py-12 bg-zinc-900 border border-zinc-800 rounded-lg">
              No hay registros de asistencia en el período seleccionado.
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      {["Fecha", "Clase", "Sucursal", "Entrenador", "Capacidad", "Asistieron", "Faltaron", "Tasa"].map((h) => (
                        <th key={h} className="text-left text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.scheduledClassId} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40 transition-colors">
                        <td className="px-4 py-3 text-zinc-300 whitespace-nowrap">{item.date}</td>
                        <td className="px-4 py-3 text-white">{item.classTitle}</td>
                        <td className="px-4 py-3 text-zinc-400">{item.branchName}</td>
                        <td className="px-4 py-3 text-zinc-400">{item.trainerName}</td>
                        <td className="px-4 py-3 text-right text-zinc-400">{item.capacity}</td>
                        <td className="px-4 py-3 text-right text-emerald-400 font-medium">{item.attended}</td>
                        <td className="px-4 py-3 text-right text-red-400">{item.absent}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-semibold ${item.attendanceRate >= 75 ? "text-emerald-400" : item.attendanceRate >= 50 ? "text-amber-400" : "text-red-400"}`}>
                            {item.attendanceRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t border-zinc-800 text-zinc-500 text-xs">
                {data.items.length} sesiones
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
