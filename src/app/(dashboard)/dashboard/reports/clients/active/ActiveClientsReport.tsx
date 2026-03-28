"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { downloadXlsx } from "@/lib/reports/xlsx-export";
import { downloadPdf } from "@/lib/reports/pdf-export";
import type { ActiveClientsResponse } from "@/modules/reports/types";

type Branch = { id: string; name: string };
type Plan = { id: string; name: string };
type Props = { branches: Branch[]; plans: Plan[]; isSuperAdmin: boolean };

function SummaryCard({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <p className="text-zinc-400 text-xs mb-1">{label}</p>
      <p className="text-white font-semibold text-lg leading-tight">{value}</p>
      {badge && <p className="text-zinc-500 text-xs mt-0.5">{badge}</p>}
    </div>
  );
}

type SortOrder = "asc" | "desc";

export function ActiveClientsReport({ branches, plans, isSuperAdmin }: Props) {
  const [branchId, setBranchId] = useState("");
  const [data, setData] = useState<ActiveClientsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Client-side filters & sort
  const [planFilter, setPlanFilter] = useState("");
  const [membershipFilter, setMembershipFilter] = useState<"all" | "with" | "without">("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (branchId) params.set("branchId", branchId);
    try {
      const res = await fetch(`/api/reports/clients/active?${params}`);
      if (!res.ok) throw new Error("Error al cargar el reporte");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { fetchReport(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply client-side filters and sort
  const filteredItems = useMemo(() => {
    if (!data) return [];
    let items = [...data.items];

    if (planFilter) {
      items = items.filter((i) => i.membershipPlanName === planFilter);
    }

    if (membershipFilter === "with") {
      items = items.filter((i) => i.hasActiveMembership);
    } else if (membershipFilter === "without") {
      items = items.filter((i) => !i.hasActiveMembership);
    }

    items.sort((a, b) => {
      const cmp = a.clientName.localeCompare(b.clientName, "es");
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return items;
  }, [data, planFilter, membershipFilter, sortOrder]);

  // Recalculate KPIs from filtered set
  const filteredSummary = useMemo(() => {
    const withMembership = filteredItems.filter((i) => i.hasActiveMembership).length;
    return {
      total: filteredItems.length,
      withActiveMembership: withMembership,
      withoutActiveMembership: filteredItems.length - withMembership,
    };
  }, [filteredItems]);

  const hasFilters = planFilter || membershipFilter !== "all";

  const activeFilters = {
    Sucursal: branches.find((b) => b.id === branchId)?.name ?? "Todas",
    Plan: planFilter || "Todos",
    Membresía: membershipFilter === "with" ? "Con membresía" : membershipFilter === "without" ? "Sin membresía" : "Todos",
    Orden: sortOrder === "asc" ? "A → Z" : "Z → A",
  };

  const handleExportXlsx = () => {
    if (!data) return;
    downloadXlsx("clientes_activos", [{
      name: "Clientes activos",
      headers: ["Nombre", "Sucursal", "Email", "Teléfono", "Deporte", "Meta", "Entrenador", "Plan de membresía", "Membresía activa", "Alta"],
      rows: filteredItems.map((i) => [
        i.clientName, i.branchName, i.email ?? "", i.phone ?? "",
        i.sport ?? "", i.goal ?? "", i.assignedTrainer ?? "",
        i.membershipPlanName ?? "",
        i.hasActiveMembership ? "Sí" : "No", i.createdAt,
      ]),
    }]);
  };

  const handleExportPdf = () => {
    if (!data) return;
    downloadPdf({
      title: "Clientes activos",
      filters: activeFilters,
      kpis: [
        { label: "Total mostrados", value: filteredSummary.total.toLocaleString("es-MX") },
        { label: "Con membresía activa", value: filteredSummary.withActiveMembership.toLocaleString("es-MX") },
        { label: "Sin membresía", value: filteredSummary.withoutActiveMembership.toLocaleString("es-MX") },
      ],
      headers: ["Nombre", "Sucursal", "Email", "Deporte", "Plan", "Membresía"],
      rows: filteredItems.map((i) => [
        i.clientName, i.branchName, i.email ?? "—",
        i.sport ?? "—",
        i.membershipPlanName ?? "—",
        i.hasActiveMembership ? "Activa" : "Sin membresía",
      ]),
      filename: "clientes_activos",
    });
  };

  return (
    <div className="space-y-6">
      {/* Filtros principales (fetch) */}
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
        <button type="submit" disabled={loading} className="px-4 py-2 bg-zinc-700 text-white text-sm rounded hover:bg-zinc-600 disabled:opacity-50 transition-colors">
          {loading ? "Cargando..." : "Aplicar"}
        </button>
        <div className="ml-auto">
          <ExportButtons onExportXlsx={handleExportXlsx} onExportPdf={handleExportPdf} disabled={!data || loading} />
        </div>
      </form>

      {/* Filtros rápidos (client-side) */}
      {data && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-wrap gap-3 items-end">
          {/* Filtro por plan */}
          {plans.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-zinc-400 text-xs">Filtrar por plan</label>
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-zinc-500 min-w-[180px]"
              >
                <option value="">Todos los planes</option>
                {plans.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          )}

          {/* Filtro por estado de membresía */}
          <div className="flex flex-col gap-1">
            <label className="text-zinc-400 text-xs">Membresía</label>
            <select
              value={membershipFilter}
              onChange={(e) => setMembershipFilter(e.target.value as "all" | "with" | "without")}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-zinc-500"
            >
              <option value="all">Todos</option>
              <option value="with">Con membresía activa</option>
              <option value="without">Sin membresía</option>
            </select>
          </div>

          {/* Orden por nombre */}
          <div className="flex flex-col gap-1">
            <label className="text-zinc-400 text-xs">Orden por nombre</label>
            <button
              type="button"
              onClick={() => setSortOrder((s) => s === "asc" ? "desc" : "asc")}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm hover:bg-zinc-700 transition-colors"
            >
              {sortOrder === "asc" ? "A → Z" : "Z → A"}
              <span className="text-zinc-400 text-xs">↕</span>
            </button>
          </div>

          {/* Limpiar filtros rápidos */}
          {hasFilters && (
            <button
              type="button"
              onClick={() => { setPlanFilter(""); setMembershipFilter("all"); }}
              className="px-3 py-1.5 text-zinc-400 text-sm rounded hover:text-white transition-colors self-end"
            >
              Limpiar filtros
            </button>
          )}

          <div className="self-end text-zinc-500 text-xs ml-auto">
            {filteredItems.length} de {data.items.length} clientes
          </div>
        </div>
      )}

      {error && <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg p-4">{error}</div>}

      {loading && !data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse h-20" />)}
        </div>
      )}

      {data && (
        <>
          {/* KPIs (basados en filtrado actual) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard
              label={hasFilters ? "Clientes filtrados" : "Clientes activos"}
              value={filteredSummary.total.toLocaleString("es-MX")}
              badge={hasFilters ? `Total en sistema: ${data.summary.totalActive}` : undefined}
            />
            <SummaryCard label="Con membresía activa" value={filteredSummary.withActiveMembership.toLocaleString("es-MX")} />
            <SummaryCard label="Sin membresía activa" value={filteredSummary.withoutActiveMembership.toLocaleString("es-MX")} badge="Posibles seguimientos" />
          </div>

          {filteredItems.length === 0 ? (
            <div className="text-center text-zinc-500 py-12 bg-zinc-900 border border-zinc-800 rounded-lg">
              {hasFilters ? "Sin resultados para los filtros aplicados." : "No hay clientes activos para mostrar."}
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th
                        className="text-left text-zinc-400 font-medium px-3 py-2.5 whitespace-nowrap cursor-pointer hover:text-white transition-colors select-none"
                        onClick={() => setSortOrder((s) => s === "asc" ? "desc" : "asc")}
                      >
                        Nombre {sortOrder === "asc" ? "↑" : "↓"}
                      </th>
                      <th className="text-left text-zinc-400 font-medium px-3 py-2.5 whitespace-nowrap">Sucursal</th>
                      <th className="text-left text-zinc-400 font-medium px-3 py-2.5 whitespace-nowrap">Email</th>
                      <th className="text-left text-zinc-400 font-medium px-3 py-2.5 whitespace-nowrap">Perfil</th>
                      <th className="text-left text-zinc-400 font-medium px-3 py-2.5 whitespace-nowrap">Entrenador</th>
                      <th className="text-left text-zinc-400 font-medium px-3 py-2.5 whitespace-nowrap">Plan</th>
                      <th className="text-left text-zinc-400 font-medium px-3 py-2.5 whitespace-nowrap">Membresía</th>
                      <th className="text-left text-zinc-400 font-medium px-3 py-2.5 whitespace-nowrap">Alta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => (
                      <tr key={item.clientId} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40 transition-colors">
                        <td className="px-3 py-2.5 text-white font-medium whitespace-nowrap">{item.clientName}</td>
                        <td className="px-3 py-2.5 text-zinc-300 whitespace-nowrap">{item.branchName}</td>
                        <td className="px-3 py-2.5 text-zinc-400 max-w-[150px] truncate" title={item.email ?? ""}>{item.email ?? "—"}</td>
                        <td className="px-3 py-2.5 text-zinc-400">
                          <div className="text-xs">{item.sport ?? "—"}</div>
                          {item.goal && <div className="text-xs text-zinc-600 mt-0.5">{item.goal}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-zinc-400 max-w-[130px] truncate whitespace-nowrap" title={item.assignedTrainer ?? ""}>{item.assignedTrainer ?? "—"}</td>
                        <td className="px-3 py-2.5 text-zinc-300 whitespace-nowrap">
                          {item.membershipPlanName ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300 font-medium">
                              {item.membershipPlanName}
                            </span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.hasActiveMembership ? "bg-green-900/40 text-green-400" : "bg-zinc-800 text-zinc-500"}`}>
                            {item.hasActiveMembership ? "Activa" : "Sin membresía"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap">{item.createdAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t border-zinc-800 text-zinc-500 text-xs">
                {filteredItems.length} {filteredItems.length === 1 ? "cliente" : "clientes"}
                {hasFilters && data.items.length !== filteredItems.length && (
                  <span className="ml-1">(de {data.items.length} total)</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
