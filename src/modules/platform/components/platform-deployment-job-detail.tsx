"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-deployment-job-detail.tsx
//
// Vista de detalle de un Deployment Job con sus steps.
// ─────────────────────────────────────────────────────────────────

import { PlatformDeploymentJobStatusBadge } from "./platform-deployment-job-status-badge";
import { PlatformDeploymentStepsTable }     from "./platform-deployment-steps-table";
import { PlatformSimulateDeploymentButton } from "./platform-simulate-deployment-button";
import { PlatformCancelDeploymentButton }   from "./platform-cancel-deployment-button";
import type { PlatformDeploymentJobDetail } from "../types/platform.types";

const ENV_LABELS: Record<string, string> = {
  LOCAL:      "Local",
  STAGING:    "Staging",
  PRODUCTION: "Producción",
};

const MODE_LABELS: Record<string, string> = {
  SIMULATION: "Simulación",
  MANUAL:     "Manual",
  AUTOMATED:  "Automatizado",
};

interface Props {
  job: PlatformDeploymentJobDetail;
}

export function PlatformDeploymentJobDetail({ job }: Props) {
  const isPending   = job.job_status === "PENDING";
  const isSimulated = job.job_status === "SIMULATED";
  const isFailed    = job.job_status === "FAILED";

  return (
    <div className="space-y-6">

      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-800">{job.organization.name}</h2>
          <p className="text-sm text-zinc-500 font-mono">{job.organization.code}</p>
          <p className="text-xs text-zinc-400 mt-0.5">Job ID: {job.id}</p>
        </div>
        <PlatformDeploymentJobStatusBadge status={job.job_status} size="md" />
      </div>

      {/* Datos del job */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-700 mb-3">Información del Job</h3>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-zinc-400 uppercase tracking-wide">Ambiente</dt>
            <dd className="font-medium text-zinc-800 mt-0.5">
              {ENV_LABELS[job.target_environment] ?? job.target_environment}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400 uppercase tracking-wide">Modo</dt>
            <dd className="font-medium text-zinc-800 mt-0.5">
              {MODE_LABELS[job.deployment_mode] ?? job.deployment_mode}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400 uppercase tracking-wide">Bundle Export</dt>
            <dd className="font-mono text-xs text-zinc-600 mt-0.5">
              {job.bundle_export_id
                ? job.bundle_export_id.substring(0, 16) + "…"
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400 uppercase tracking-wide">Iniciado</dt>
            <dd className="text-zinc-600 mt-0.5 text-xs">
              {job.started_at
                ? new Date(job.started_at).toLocaleString("es-SV")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400 uppercase tracking-wide">Finalizado</dt>
            <dd className="text-zinc-600 mt-0.5 text-xs">
              {job.finished_at
                ? new Date(job.finished_at).toLocaleString("es-SV")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400 uppercase tracking-wide">Creado</dt>
            <dd className="text-zinc-600 mt-0.5 text-xs">
              {new Date(job.created_at).toLocaleString("es-SV")}
            </dd>
          </div>
        </dl>

        {job.notes && (
          <div className="mt-3 pt-3 border-t border-zinc-100">
            <dt className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Notas</dt>
            <p className="text-sm text-zinc-600">{job.notes}</p>
          </div>
        )}
      </div>

      {/* Error */}
      {isFailed && job.error_message && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-red-700 mb-1">Error de Deployment</h3>
          <p className="text-sm text-red-600">{job.error_message}</p>
        </div>
      )}

      {/* Resultado exitoso */}
      {isSimulated && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-blue-700 mb-1">Simulación Completada</h3>
          <p className="text-sm text-blue-600">
            Todos los pasos completados exitosamente en modo SIMULATION.
            La organización está lista para deployment manual en el siguiente paso.
          </p>
        </div>
      )}

      {/* Acciones */}
      {isPending && (
        <div className="flex items-center gap-3">
          <PlatformSimulateDeploymentButton jobId={job.id} />
          <PlatformCancelDeploymentButton jobId={job.id} />
        </div>
      )}

      {/* Steps */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-700 mb-3">
          Pasos del Deployment ({job.steps.length})
        </h3>
        <PlatformDeploymentStepsTable steps={job.steps} />
      </div>

    </div>
  );
}
