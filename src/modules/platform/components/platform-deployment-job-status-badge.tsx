"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-deployment-job-status-badge.tsx
//
// Badge visual para el estado de un Deployment Job.
// ─────────────────────────────────────────────────────────────────

import type { PlatformDeploymentJobStatus } from "../types/platform.types";

const STATUS_CONFIG: Record<
  PlatformDeploymentJobStatus,
  { label: string; className: string }
> = {
  PENDING:   { label: "Pendiente",  className: "bg-zinc-100 text-zinc-600" },
  RUNNING:   { label: "Ejecutando", className: "bg-yellow-100 text-yellow-700" },
  SUCCESS:   { label: "Exitoso",    className: "bg-emerald-100 text-emerald-700" },
  FAILED:    { label: "Fallido",    className: "bg-red-100 text-red-700" },
  CANCELLED: { label: "Cancelado",  className: "bg-zinc-100 text-zinc-400" },
  SIMULATED: { label: "Simulado",   className: "bg-blue-100 text-blue-700" },
};

interface Props {
  status: PlatformDeploymentJobStatus;
  size?:  "sm" | "md";
}

export function PlatformDeploymentJobStatusBadge({ status, size = "sm" }: Props) {
  const config    = STATUS_CONFIG[status] ?? STATUS_CONFIG["PENDING"];
  const sizeClass = size === "md" ? "text-sm px-3 py-1" : "text-xs px-2.5 py-0.5";
  return (
    <span className={`inline-flex items-center font-semibold rounded-full ${sizeClass} ${config.className}`}>
      {config.label}
    </span>
  );
}
