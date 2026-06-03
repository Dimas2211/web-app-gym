"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-deployment-steps-table.tsx
//
// Tabla de pasos de un Deployment Job.
// ─────────────────────────────────────────────────────────────────

import { PlatformDeploymentStepStatusBadge } from "./platform-deployment-step-status-badge";
import type { PlatformDeploymentStepItem }   from "../types/platform.types";

interface Props {
  steps: PlatformDeploymentStepItem[];
}

export function PlatformDeploymentStepsTable({ steps }: Props) {
  if (steps.length === 0) {
    return (
      <p className="text-sm text-zinc-400 italic py-4 text-center">
        Sin pasos registrados.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 uppercase tracking-wide">
            <th className="pb-2 pr-3 font-medium w-8">#</th>
            <th className="pb-2 pr-4 font-medium">Paso</th>
            <th className="pb-2 pr-4 font-medium">Estado</th>
            <th className="pb-2 pr-4 font-medium">Inicio</th>
            <th className="pb-2 pr-4 font-medium">Fin</th>
            <th className="pb-2 font-medium">Mensaje</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={step.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
              <td className="py-2.5 pr-3 text-zinc-400 font-mono text-xs">{step.step_order}</td>
              <td className="py-2.5 pr-4">
                <div className="font-medium text-zinc-800">{step.step_name}</div>
                <div className="text-xs text-zinc-400 font-mono">{step.step_key}</div>
              </td>
              <td className="py-2.5 pr-4">
                <PlatformDeploymentStepStatusBadge status={step.status} />
              </td>
              <td className="py-2.5 pr-4 text-zinc-500 text-xs whitespace-nowrap">
                {step.started_at
                  ? new Date(step.started_at).toLocaleString("es-SV")
                  : "—"}
              </td>
              <td className="py-2.5 pr-4 text-zinc-500 text-xs whitespace-nowrap">
                {step.finished_at
                  ? new Date(step.finished_at).toLocaleString("es-SV")
                  : "—"}
              </td>
              <td className="py-2.5 text-zinc-600 text-xs max-w-xs">
                {step.message ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
