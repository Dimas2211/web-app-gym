"use client";

import { useState, useEffect, useCallback } from "react";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { downloadXlsx } from "@/lib/reports/xlsx-export";
import { downloadPdf } from "@/lib/reports/pdf-export";
import type { ExpiringMembershipsResponse } from "@/modules/reports/types";

type Branch = { id: string; name: string };
type Props = { branches: Branch[]; isSuperAdmin: boolean };

const PAYMENT_LABELS: Record<string, string> = {
  paid: "Pagado",
  partial: "Parcial",
  pending: "Pendiente",
  overdue: "Vencido",
  refunded: "Reembolsado",
};

function formatCurrency(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(v);
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-4 border ${highlight ? "bg-amber-950/30 border-amber-800/50" : "bg-zinc-900 border-zinc-800"}`}>
      <p className="text-zinc-400 text-xs mb-1">{label}</p>
      <p className={`font-semibold text-lg leading-tight ${highlight ? "text-amber-300" : "text-white"}`}>{value}</p>
    </div>
  );
}

export function ExpiringMembershipsReport({ branches, isSuperAdmin }: Props) {
  const [daysAhead, setDaysAhead] = useState("30");
  const [branchId, setBranchId] = useState("");
  const [data, setData] = useState<ExpiringMembershipsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ daysAhead });
    if (branchId) params.set("branchId", branchId);
    try {
      const res = await fetch(`/api/reports/memberships/expiring?${params}`);
      if (!res.ok) throw new Error("Error al cargar el reporte");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [daysAhead, branchId]);

  useEffect(() => { fetchReport(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFilters = {
    "Próximos días": `${daysAhead} días`,
    Sucursal: branches.find((b) => b.id === branchId)?.name ?? "Todas",
  };

  const handleExportXlsx = () => {
    if (!data) return;
    downloadXlsx("membresías_por_vencer", [{
      name: "Por vencer",
      headers: ["Cliente", "Sucursal", "Plan", "Vence", "Días restantes", "Pago", "Monto"],
      rows: data.items.map((i) => [
        i.clientName, i.branchName, i.planName, i.endDate,
        i.daysRemaining, PAYMENT_LABELS[i.paymentStatus] ?? i.paymentStatus,
        i.finalAmount,
      ]),
    }]);
  };

  const handleExportPdf = () => {
    if (!data) return;
    downloadPdf({
      title: "Membresías por vencer",
      filters: activeFilters,
      kpis: [
        { label: "Total por vencer", value: String(data.summary.total) },
        { label: "Vencen esta semana", value: String(data.summary.expiringThisWeek) },
        { label: "Ingreso en riesgo", value: formatCurrency(data.summary.revenueAtRisk) },
      ],
      headers: ["Cliente", "Sucursal", "Plan", "Vence", "Días", "Pago", "Monto"],
      rows: data.items.map((i) => [
        i.clientName, i.branchName, i.planName, i.endDate,
        i.daysRemaining, PAYMENT_LABELS[i.paymentStatus] ?? i.paymentStatus,
        formatCurrency(i.finalAmount),
      ]),
      filename: "membresias_por_vencer",
    });
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <form
        onSubmit={(e) => { e.preventDefault(); fetchReport(); }}
        className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-wrap gap-3 items-end"
      >
        <div className="flex flex-col gap-1">
          <label className="text-zinc-400 text-xs">Próximos días</label>
          <select
            value={daysAhead}
            onChange={(e) => setDaysAhead(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500"
          >
            <option value="7">7 días</option>
            <option value="15">15 días</option>
            <option value="30">30 días</option>
            <option value="60">60 días</option>
            <option value="90">90 días</option>
          </select>
        </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard label="Total por vencer" value={data.summary.total.toLocaleString("es-MX")} />
            <SummaryCard label="Vencen esta semana" value={data.summary.expiringThisWeek.toLocaleString("es-MX")} highlight={data.summary.expiringThisWeek > 0} />
            <SummaryCard label="Ingreso en riesgo" value={formatCurrency(data.summary.revenueAtRisk)} />
          </div>

          {data.items.length === 0 ? (
            <div className="text-center text-zinc-500 py-12 bg-zinc-900 border border-zinc-800 rounded-lg">
              No hay membresías por vencer en los próximos {daysAhead} días.
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      {["Cliente", "Sucursal", "Plan", "Vence", "Días rest.", "Pago", "Monto"].map((h) => (
                        <th key={h} className="text-left text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.membershipId} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{item.clientName}</td>
                        <td className="px-4 py-3 text-zinc-300">{item.branchName}</td>
                        <td className="px-4 py-3 text-zinc-300">{item.planName}</td>
                        <td className="px-4 py-3 text-zinc-300 whitespace-nowrap">{item.endDate}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.daysRemaining <= 7 ? "bg-red-900/50 text-red-300" : item.daysRemaining <= 15 ? "bg-amber-900/50 text-amber-300" : "bg-zinc-700 text-zinc-300"}`}>
                            {item.daysRemaining}d
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{PAYMENT_LABELS[item.paymentStatus] ?? item.paymentStatus}</td>
                        <td className="px-4 py-3 text-zinc-300">{formatCurrency(item.finalAmount)}</td>
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
