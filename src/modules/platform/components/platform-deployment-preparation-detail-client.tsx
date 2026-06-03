"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-deployment-preparation-detail-client.tsx
//
// Shell cliente para el detalle de Deployment Preparation.
// Une checklist de provisioning + download manager + historial.
// ─────────────────────────────────────────────────────────────────

import { PlatformProvisioningChecklist }     from "./platform-provisioning-checklist";
import { PlatformProvisioningSummary }       from "./platform-provisioning-summary";
import { PlatformProvisioningStatusBadge }   from "./platform-provisioning-status-badge";
import { PlatformDeploymentDownloadManager } from "./platform-deployment-download-manager";
import { PlatformDeploymentExportHistory }   from "./platform-deployment-export-history";

import type {
  ProvisioningPackage,
  DeploymentExportLogItem,
  PlatformProvisioningStatus,
} from "../types/platform.types";

interface Props {
  organizationId:      string;
  organizationName:    string;
  organizationCode:    string;
  provisioningStatus:  PlatformProvisioningStatus;
  pkg:                 ProvisioningPackage;
  exportLogs:          DeploymentExportLogItem[];
}

export function PlatformDeploymentPreparationDetailClient({
  organizationId,
  organizationName,
  organizationCode,
  provisioningStatus,
  pkg,
  exportLogs,
}: Props) {
  const canExport =
    provisioningStatus === "READY" ||
    provisioningStatus === "PROVISIONED" ||
    provisioningStatus === "DEPLOYED";

  return (
    <div className="space-y-6">

      {/* Estado general */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-800">{organizationName}</h2>
          <p className="text-sm text-zinc-500 font-mono">{organizationCode}</p>
        </div>
        <PlatformProvisioningStatusBadge status={provisioningStatus} />
      </div>

      {/* Grilla 2 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Columna izquierda: Provisioning */}
        <div className="space-y-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-zinc-700 mb-3">Resumen de Provisioning</h3>
            <PlatformProvisioningSummary config={pkg.config} />
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-zinc-700 mb-3">Checklist de Provisioning</h3>
            <PlatformProvisioningChecklist checks={pkg.validation.checks} />
          </div>
        </div>

        {/* Columna derecha: Export */}
        <div className="space-y-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-zinc-700 mb-4">Exportación de Bundle</h3>
            <PlatformDeploymentDownloadManager
              organizationId={organizationId}
              organizationCode={organizationCode}
              canExport={canExport}
            />
          </div>
        </div>

      </div>

      {/* Historial de exportaciones */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-700 mb-3">
          Historial de Exportaciones ({exportLogs.length})
        </h3>
        <PlatformDeploymentExportHistory logs={exportLogs} showOrganization={false} />
      </div>

    </div>
  );
}
