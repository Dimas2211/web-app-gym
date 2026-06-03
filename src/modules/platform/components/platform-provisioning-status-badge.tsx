"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-provisioning-status-badge.tsx
//
// Badge visual para el estado de provisioning.
// ─────────────────────────────────────────────────────────────────

import type { PlatformProvisioningStatus } from "../types/platform.types";

const STATUS_CONFIG: Record<
  PlatformProvisioningStatus,
  { label: string; className: string }
> = {
  NOT_READY:   { label: "No listo",    className: "bg-zinc-100 text-zinc-500" },
  READY:       { label: "Listo",       className: "bg-green-100 text-green-700" },
  PROVISIONED: { label: "Provisionado", className: "bg-blue-100 text-blue-700" },
  DEPLOYED:    { label: "Desplegado",  className: "bg-purple-100 text-purple-700" },
  FAILED:      { label: "Fallido",     className: "bg-red-100 text-red-700" },
};

interface Props {
  status: PlatformProvisioningStatus;
  size?:  "sm" | "md";
}

export function PlatformProvisioningStatusBadge({ status, size = "sm" }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG["NOT_READY"];
  const sizeClass = size === "md" ? "text-sm px-3 py-1" : "text-xs px-2.5 py-0.5";
  return (
    <span className={`inline-flex items-center font-semibold rounded-full ${sizeClass} ${config.className}`}>
      {config.label}
    </span>
  );
}
