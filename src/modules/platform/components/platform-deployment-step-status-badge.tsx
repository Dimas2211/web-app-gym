"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-deployment-step-status-badge.tsx
//
// Badge visual para el estado de un Deployment Step.
// ─────────────────────────────────────────────────────────────────

import type { PlatformDeploymentStepStatus } from "../types/platform.types";

const STATUS_CONFIG: Record<
  PlatformDeploymentStepStatus,
  { label: string; className: string }
> = {
  PENDING:  { label: "Pendiente",  className: "bg-zinc-100 text-zinc-500" },
  RUNNING:  { label: "Ejecutando", className: "bg-yellow-100 text-yellow-700" },
  SUCCESS:  { label: "Exitoso",    className: "bg-emerald-100 text-emerald-700" },
  FAILED:   { label: "Fallido",    className: "bg-red-100 text-red-700" },
  SKIPPED:  { label: "Omitido",    className: "bg-zinc-100 text-zinc-400" },
};

interface Props {
  status: PlatformDeploymentStepStatus;
}

export function PlatformDeploymentStepStatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG["PENDING"];
  return (
    <span className={`inline-flex items-center font-semibold rounded-full text-xs px-2.5 py-0.5 ${config.className}`}>
      {config.label}
    </span>
  );
}
