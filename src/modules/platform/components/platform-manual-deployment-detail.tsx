"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-manual-deployment-detail.tsx
//
// Vista principal del runbook de deployment manual.
// Muestra: checklist de pasos, env vars, instrucciones de DB,
// seeds, smoke test, y acciones para completar el job.
// ─────────────────────────────────────────────────────────────────

import { useState }                         from "react";
import { PlatformDeploymentJobStatusBadge } from "./platform-deployment-job-status-badge";
import { PlatformManualDeploymentChecklist } from "./platform-manual-deployment-checklist";
import { PlatformEnvPreviewPanel }           from "./platform-env-preview-panel";
import { PlatformDatabaseInstructions }      from "./platform-database-instructions";
import { PlatformSeedInstructions }          from "./platform-seed-instructions";
import { PlatformSmokeTestChecklist }        from "./platform-smoke-test-checklist";
import { PlatformCompleteManualDeploymentButton } from "./platform-complete-manual-deployment-button";
import type { ManualDeploymentJobDetail }    from "../types/platform.types";

type Tab = "checklist" | "env" | "database" | "seeds" | "smoketest";

const TABS: { id: Tab; label: string }[] = [
  { id: "checklist", label: "Checklist Runbook" },
  { id: "env",       label: "Variables ENV" },
  { id: "database",  label: "Base de Datos" },
  { id: "seeds",     label: "Seeds" },
  { id: "smoketest", label: "Smoke Test" },
];

const ENV_LABELS: Record<string, string> = {
  LOCAL:      "Local",
  STAGING:    "Staging",
  PRODUCTION: "Producción",
};

interface Props {
  job: ManualDeploymentJobDetail;
}

export function PlatformManualDeploymentDetail({ job }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("checklist");

  const isTerminal = ["SUCCESS", "FAILED", "CANCELLED"].includes(job.job_status);
  const isSuccess  = job.job_status === "SUCCESS";
  const isFailed   = job.job_status === "FAILED";
  const canComplete = !isTerminal && job.deployment_mode === "MANUAL";

  return (
    <div className="space-y-6">

      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-zinc-800">{job.org_details.name}</h2>
          <p className="text-sm text-zinc-500 font-mono">{job.org_details.code}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400 flex-wrap">
            <span>Job ID: <span className="font-mono">{job.id.substring(0, 16)}…</span></span>
            <span>·</span>
            <span>Ambiente: {ENV_LABELS[job.target_environment] ?? job.target_environment}</span>
            {job.notes && (
              <>
                <span>·</span>
                <span className="italic">{job.notes}</span>
              </>
            )}
          </div>
        </div>
        <PlatformDeploymentJobStatusBadge status={job.job_status} size="md" />
      </div>

      {/* Banner de resultado */}
      {isSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-green-700">Deployment manual completado exitosamente.</p>
          {job.org_details.deployment_url && (
            <p className="text-xs text-green-600 mt-0.5">
              URL: <span className="font-mono">{job.org_details.deployment_url}</span>
            </p>
          )}
          {job.finished_at && (
            <p className="text-xs text-green-500 mt-0.5">
              Finalizado: {new Date(job.finished_at).toLocaleString("es-SV")}
            </p>
          )}
        </div>
      )}

      {isFailed && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-red-700">Deployment manual fallido.</p>
          {job.error_message && (
            <p className="text-xs text-red-600 mt-0.5">{job.error_message}</p>
          )}
        </div>
      )}

      {/* Resumen de la organización */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-700 mb-3">Información de la Organización</h3>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-zinc-400 uppercase tracking-wide">Vertical</dt>
            <dd className="font-medium text-zinc-800 mt-0.5">
              {job.org_details.vertical?.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400 uppercase tracking-wide">Plan</dt>
            <dd className="font-medium text-zinc-800 mt-0.5">
              {job.org_details.plan?.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400 uppercase tracking-wide">País / TZ</dt>
            <dd className="font-medium text-zinc-800 mt-0.5">
              {job.org_details.country_code ?? "—"} / {job.org_details.timezone ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400 uppercase tracking-wide">Módulos activos</dt>
            <dd className="font-medium text-zinc-800 mt-0.5">
              {job.org_details.active_modules.length}
            </dd>
          </div>
          {job.org_details.tenant_id && (
            <div className="col-span-2">
              <dt className="text-xs text-zinc-400 uppercase tracking-wide">Tenant ID</dt>
              <dd className="font-mono text-xs text-zinc-600 mt-0.5">{job.org_details.tenant_id}</dd>
            </div>
          )}
          {job.org_details.domain && (
            <div className="col-span-2">
              <dt className="text-xs text-zinc-400 uppercase tracking-wide">Dominio</dt>
              <dd className="font-mono text-xs text-zinc-600 mt-0.5">{job.org_details.domain}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Acción de completar (solo si no está en estado terminal) */}
      {canComplete && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
          <p className="text-sm text-zinc-600 mb-3">
            Cuando hayas completado todos los pasos del runbook, registra el resultado:
          </p>
          <PlatformCompleteManualDeploymentButton jobId={job.id} />
        </div>
      )}

      {/* Tabs del runbook */}
      <div>
        {/* Tab headers */}
        <div className="flex gap-1 border-b border-zinc-200 mb-4 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          {activeTab === "checklist" && (
            <PlatformManualDeploymentChecklist
              steps={job.steps}
              jobId={job.id}
              jobDone={isTerminal}
            />
          )}
          {activeTab === "env" && (
            <PlatformEnvPreviewPanel org={job.org_details} />
          )}
          {activeTab === "database" && (
            <PlatformDatabaseInstructions org={job.org_details} />
          )}
          {activeTab === "seeds" && (
            <PlatformSeedInstructions org={job.org_details} />
          )}
          {activeTab === "smoketest" && (
            <PlatformSmokeTestChecklist org={job.org_details} />
          )}
        </div>
      </div>

      {/* Timestamps */}
      <div className="text-xs text-zinc-400 flex gap-4 flex-wrap">
        <span>Creado: {new Date(job.created_at).toLocaleString("es-SV")}</span>
        {job.started_at && (
          <span>Iniciado: {new Date(job.started_at).toLocaleString("es-SV")}</span>
        )}
        {job.finished_at && (
          <span>Finalizado: {new Date(job.finished_at).toLocaleString("es-SV")}</span>
        )}
      </div>

    </div>
  );
}
