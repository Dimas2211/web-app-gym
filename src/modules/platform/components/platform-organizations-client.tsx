"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-organizations-client.tsx
//
// Orquestador cliente del listado de organizaciones Platform Admin.
// Filtra en memoria sobre los datos iniciales cargados por el servidor.
// ─────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Building2, Plus } from "lucide-react";

import { PlatformOrganizationsTable }    from "./platform-organizations-table";
import { NewPlatformOrganizationDialog } from "./new-platform-organization-dialog";

import type {
  PlatformOrganizationListItem,
  PlatformOrganizationStatus,
  PlatformLicenseStatus,
  PlatformVerticalItem,
  PlatformPlanItem,
} from "../types/platform.types";

export interface PlatformOrganizationsClientProps {
  initialItems: PlatformOrganizationListItem[];
  initialTotal: number;
  verticals:    PlatformVerticalItem[];
  plans:        PlatformPlanItem[];
}

export function PlatformOrganizationsClient({
  initialItems,
  initialTotal,
  verticals,
  plans,
}: PlatformOrganizationsClientProps) {
  const [search,         setSearch]        = useState("");
  const [statusFilter,   setStatusFilter]  = useState<PlatformOrganizationStatus | "">("");
  const [licenseFilter,  setLicenseFilter] = useState<PlatformLicenseStatus | "">("");
  const [verticalFilter, setVerticalFilter]= useState("");
  const [planFilter,     setPlanFilter]    = useState("");
  const [showNewDialog,  setShowNewDialog] = useState(false);

  // Filtrado en memoria — dataset pequeño (orgs de plataforma son pocas)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialItems.filter((o) => {
      if (q && !o.name.toLowerCase().includes(q) && !o.code.toLowerCase().includes(q)) return false;
      if (statusFilter   && o.status         !== statusFilter)   return false;
      if (licenseFilter  && o.license_status !== licenseFilter)  return false;
      if (verticalFilter && o.vertical?.id   !== verticalFilter) return false;
      if (planFilter     && o.plan?.id       !== planFilter)     return false;
      return true;
    });
  }, [initialItems, search, statusFilter, licenseFilter, verticalFilter, planFilter]);

  const hasActiveFilters =
    !!search.trim() || !!statusFilter || !!licenseFilter || !!verticalFilter || !!planFilter;

  function handleClearFilters() {
    setSearch("");
    setStatusFilter("");
    setLicenseFilter("");
    setVerticalFilter("");
    setPlanFilter("");
  }

  return (
    <div className="space-y-4">

      {/* Encabezado */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-zinc-400" />
            <h1 className="text-xl font-bold text-zinc-800">Organizaciones</h1>
          </div>
          <p className="text-sm text-zinc-500 mt-0.5">
            {filtered.length} de {initialTotal} organización{initialTotal !== 1 ? "es" : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowNewDialog(true)}
          className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-lg
                     text-sm font-semibold hover:bg-zinc-800 transition-colors shrink-0"
        >
          <Plus size={15} />
          Nueva organización
        </button>
      </div>

      {/* Toolbar de filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o código…"
          className="flex-1 min-w-[200px] h-9 px-3 text-sm border border-zinc-200 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PlatformOrganizationStatus | "")}
          className="h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none
                     focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
        >
          <option value="">Todos los estados</option>
          <option value="PENDING">PENDING</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="SUSPENDED">SUSPENDED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>

        <select
          value={licenseFilter}
          onChange={(e) => setLicenseFilter(e.target.value as PlatformLicenseStatus | "")}
          className="h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none
                     focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
        >
          <option value="">Todas las licencias</option>
          <option value="TRIAL">TRIAL</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="SUSPENDED">SUSPENDED</option>
          <option value="EXPIRED">EXPIRED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>

        {verticals.length > 0 && (
          <select
            value={verticalFilter}
            onChange={(e) => setVerticalFilter(e.target.value)}
            className="h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none
                       focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
          >
            <option value="">Todas las verticales</option>
            {verticals.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        )}

        {plans.length > 0 && (
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none
                       focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
          >
            <option value="">Todos los planes</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="h-9 px-3 text-sm text-zinc-500 border border-zinc-200 rounded-lg
                       hover:bg-zinc-50 transition-colors whitespace-nowrap"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Grilla */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="h-[60vh] overflow-auto">
          <PlatformOrganizationsTable items={filtered} isLoading={false} />
        </div>
        <div className="px-4 py-2 border-t border-zinc-100 bg-zinc-50 text-xs text-zinc-400 text-right">
          {filtered.length} de {initialTotal} organización{initialTotal !== 1 ? "es" : ""}
        </div>
      </div>

      {/* Diálogo nueva organización */}
      {showNewDialog && (
        <NewPlatformOrganizationDialog
          verticals={verticals}
          plans={plans}
          onClose={() => setShowNewDialog(false)}
        />
      )}
    </div>
  );
}
