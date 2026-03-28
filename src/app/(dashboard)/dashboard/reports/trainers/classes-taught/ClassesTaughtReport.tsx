"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { downloadXlsx } from "@/lib/reports/xlsx-export";
import { downloadPdf } from "@/lib/reports/pdf-export";
import { captureChartAsPng } from "@/lib/reports/chart-capture";
import { HorizontalBarChart } from "@/components/reports/ReportBarChart";
import type { TrainerClassesTaughtResponse } from "@/modules/reports/types";

type Branch = { id: string; name: string };
type Trainer = { id: string; name: string };
type Props = { branches: Branch[]; trainers: Trainer[]; isSuperAdmin: boolean };

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <p className="text-zinc-400 text-xs mb-1">{label}</p>
      <p className="text-white font-semibold text-lg leading-tight">{value}</p>
    </div>
  );
}

export function ClassesTaughtReport({ branches, trainers, isSuperAdmin }: Props) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [branchId, setBranchId] = useState("");
  const [trainerId, setTrainerId] = useState("");
  const [data, setData] = useState<TrainerClassesTaughtResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<SVGSVGElement>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (branchId) params.set("branchId", branchId);
    if (trainerId) params.set("trainerId", trainerId);
    try {
      const res = await fetch(`/api/reports/trainers/classes-taught?${params}`);
      if (!res.ok) throw new Error("Error al cargar el reporte");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, branchId, trainerId]);

  useEffect(() => { fetchReport(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFilters = {
    Desde: dateFrom || "Todos",
    Hasta: dateTo || "Todos",
    Sucursal: branches.find((b) => b.id === branchId)?.name ?? "Todas",
    Entrenador: trainers.find((t) => t.id === trainerId)?.name ?? "Todos",
  };

  const handleExportXlsx = () => {
    if (!data) return;
    downloadXlsx("clases_impartidas", [{
      name: "Clases impartidas",
      headers: ["Entrenador", "Sucursal", "Clases impartidas", "Total asistentes", "Prom. asistencia/clase"],
      rows: data.items.map((i) => [i.trainerName, i.branchName, i.classesTaught, i.totalAttendees, i.avgAttendance]),
    }]);
  };

  const handleExportPdf = async () => {
    if (!data) return;
    const chartImage =
      data.items.length >= 2 && chartRef.current
        ? await captureChartAsPng(chartRef.current)
        : null;
    downloadPdf({
      title: "Clases impartidas por entrenador",
      filters: activeFilters,
      kpis: [
        { label: "Clases totales", value: data.summary.totalClasses.toLocaleString("es-MX") },
        { label: "Entrenadores activos", value: String(data.summary.totalTrainers) },
        { label: "Total asistentes", value: data.summary.totalAttendees.toLocaleString("es-MX") },
        { label: "Prom. clases/entrenador", value: String(data.summary.avgClassesPerTrainer) },
      ],
      chartImage: chartImage ?? undefined,
      headers: ["Entrenador", "Sucursal", "Clases", "Asistentes totales", "Prom/clase"],
      rows: data.items.map((i) => [i.trainerName, i.branchName, i.classesTaught, i.totalAttendees, i.avgAttendance]),
      filename: "clases_impartidas",
    });
  };

  const maxClasses = data ? Math.max(...data.items.map((i) => i.classesTaught), 1) : 1;

  return (
    <div className="space-y-6">
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
        {isSuperAdmin && branches.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-zinc-400 text-xs">Sucursal</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 min-w-[160px]">
              <option value="">Todas las sucursales</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        {trainers.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-zinc-400 text-xs">Entrenador</label>
            <select value={trainerId} onChange={(e) => setTrainerId(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 min-w-[180px]">
              <option value="">Todos los entrenadores</option>
              {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse h-20" />)}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Clases completadas" value={data.summary.totalClasses.toLocaleString("es-MX")} />
            <SummaryCard label="Entrenadores" value={String(data.summary.totalTrainers)} />
            <SummaryCard label="Total asistentes" value={data.summary.totalAttendees.toLocaleString("es-MX")} />
            <SummaryCard label="Prom. clases/entrenador" value={String(data.summary.avgClassesPerTrainer)} />
          </div>

          {/* Gráfico — ranking de clases por entrenador */}
          {data.items.length >= 2 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <HorizontalBarChart
                svgRef={chartRef}
                title="Clases impartidas por entrenador"
                data={data.items.map((i) => ({
                  label: i.trainerName,
                  value: i.classesTaught,
                }))}
                defaultColor="#6366f1"
              />
            </div>
          )}

          {data.items.length === 0 ? (
            <div className="text-center text-zinc-500 py-12 bg-zinc-900 border border-zinc-800 rounded-lg">
              No hay clases completadas para el período seleccionado.
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left text-zinc-400 font-medium px-4 py-3">Entrenador</th>
                      <th className="text-left text-zinc-400 font-medium px-4 py-3">Sucursal</th>
                      <th className="text-right text-zinc-400 font-medium px-4 py-3">Clases</th>
                      <th className="text-left text-zinc-400 font-medium px-4 py-3 w-32">Volumen</th>
                      <th className="text-right text-zinc-400 font-medium px-4 py-3">Asistentes totales</th>
                      <th className="text-right text-zinc-400 font-medium px-4 py-3">Prom/clase</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.trainerId} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{item.trainerName}</td>
                        <td className="px-4 py-3 text-zinc-300">{item.branchName}</td>
                        <td className="px-4 py-3 text-right text-zinc-300 font-medium">{item.classesTaught}</td>
                        <td className="px-4 py-3">
                          <div className="w-full bg-zinc-800 rounded-full h-1.5">
                            <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${Math.round((item.classesTaught / maxClasses) * 100)}%` }} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-400">{item.totalAttendees}</td>
                        <td className="px-4 py-3 text-right text-zinc-400">{item.avgAttendance}</td>
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
