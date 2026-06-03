"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-deployment-jobs-client.tsx
//
// Shell cliente del dashboard de Deployment Jobs con filtros.
// ─────────────────────────────────────────────────────────────────

import { useState, useMemo }               from "react";
import { PlatformDeploymentJobsTable }      from "./platform-deployment-jobs-table";
import type { PlatformDeploymentJobItem } from "../types/platform.types";

interface Props {
  jobs: PlatformDeploymentJobItem[];
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "",          label: "Todos los estados" },
  { value: "PENDING",   label: "Pendiente" },
  { value: "RUNNING",   label: "Ejecutando" },
  { value: "SIMULATED", label: "Simulado" },
  { value: "SUCCESS",   label: "Exitoso" },
  { value: "FAILED",    label: "Fallido" },
  { value: "CANCELLED", label: "Cancelado" },
];

const ENV_OPTIONS: { value: string; label: string }[] = [
  { value: "",           label: "Todos los ambientes" },
  { value: "LOCAL",      label: "Local" },
  { value: "STAGING",    label: "Staging" },
  { value: "PRODUCTION", label: "Producción" },
];

export function PlatformDeploymentJobsClient({ jobs }: Props) {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [envFilter,    setEnvFilter]    = useState<string>("");
  const [orgSearch,    setOrgSearch]    = useState<string>("");

  const filtered = useMemo(() => {
    return jobs.filter((job) => {
      if (statusFilter && job.job_status !== statusFilter) return false;
      if (envFilter    && job.target_environment !== envFilter) return false;
      if (orgSearch) {
        const q = orgSearch.toLowerCase();
        if (
          !job.organization.name.toLowerCase().includes(q) &&
          !job.organization.code.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [jobs, statusFilter, envFilter, orgSearch]);

  return (
    <div className="space-y-4">

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar organización…"
          value={orgSearch}
          onChange={(e) => setOrgSearch(e.target.value)}
          className="h-8 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 px-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={envFilter}
          onChange={(e) => setEnvFilter(e.target.value)}
          className="h-8 px-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {ENV_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="text-xs text-zinc-400 ml-auto">
          {filtered.length} job{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Tabla */}
      <PlatformDeploymentJobsTable jobs={filtered} />

    </div>
  );
}
