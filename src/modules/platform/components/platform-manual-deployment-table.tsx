"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-manual-deployment-table.tsx
//
// Tabla de Deployment Jobs en modo MANUAL.
// ─────────────────────────────────────────────────────────────────

import Link  from "next/link";
import { Eye } from "lucide-react";
import { PlatformDeploymentJobStatusBadge } from "./platform-deployment-job-status-badge";
import type {
  PlatformDeploymentJobItem,
  PlatformDeploymentJobEnvironment,
} from "../types/platform.types";

const ENV_LABELS: Record<PlatformDeploymentJobEnvironment, string> = {
  LOCAL:      "Local",
  STAGING:    "Staging",
  PRODUCTION: "Producción",
};

interface Props {
  jobs: PlatformDeploymentJobItem[];
}

export function PlatformManualDeploymentTable({ jobs }: Props) {
  if (jobs.length === 0) {
    return (
      <p className="text-sm text-zinc-400 italic py-8 text-center">
        Sin deployment jobs manuales registrados.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 uppercase tracking-wide">
            <th className="pb-2 pr-4 font-medium">Organización</th>
            <th className="pb-2 pr-4 font-medium">Estado</th>
            <th className="pb-2 pr-4 font-medium">Ambiente</th>
            <th className="pb-2 pr-4 font-medium">Creado</th>
            <th className="pb-2 pr-4 font-medium">Finalizado</th>
            <th className="pb-2 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
              <td className="py-2.5 pr-4">
                <div className="font-medium text-zinc-800">{job.organization.name}</div>
                <div className="text-xs text-zinc-400 font-mono">{job.organization.code}</div>
              </td>
              <td className="py-2.5 pr-4">
                <PlatformDeploymentJobStatusBadge status={job.job_status} />
              </td>
              <td className="py-2.5 pr-4 text-zinc-600">
                {ENV_LABELS[job.target_environment] ?? job.target_environment}
              </td>
              <td className="py-2.5 pr-4 text-zinc-500 text-xs whitespace-nowrap">
                {new Date(job.created_at).toLocaleString("es-SV")}
              </td>
              <td className="py-2.5 pr-4 text-zinc-500 text-xs whitespace-nowrap">
                {job.finished_at
                  ? new Date(job.finished_at).toLocaleString("es-SV")
                  : "—"}
              </td>
              <td className="py-2.5">
                <Link
                  href={`/dashboard/platform/manual-deployment/${job.id}`}
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  <Eye size={13} />
                  Runbook
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
