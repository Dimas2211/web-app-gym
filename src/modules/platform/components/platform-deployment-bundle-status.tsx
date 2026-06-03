"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-deployment-bundle-status.tsx
//
// Badge de estado del Deployment Bundle.
// ─────────────────────────────────────────────────────────────────

import { CheckCircle2, XCircle, Clock } from "lucide-react";
import type { PlatformProvisioningStatus } from "../types/platform.types";

interface Props {
  provisioning_status: PlatformProvisioningStatus;
  export_count:        number;
}

export function PlatformDeploymentBundleStatus({ provisioning_status, export_count }: Props) {
  if (provisioning_status === "READY" || provisioning_status === "PROVISIONED" || provisioning_status === "DEPLOYED") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 size={12} />
        Listo para exportar
        {export_count > 0 && (
          <span className="ml-1 bg-emerald-100 text-emerald-800 px-1.5 rounded-full text-[10px]">
            {export_count} {export_count === 1 ? "exportación" : "exportaciones"}
          </span>
        )}
      </span>
    );
  }

  if (provisioning_status === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        <XCircle size={12} />
        Provisioning fallido
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
      <Clock size={12} />
      No listo
    </span>
  );
}
