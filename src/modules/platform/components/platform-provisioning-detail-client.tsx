"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-provisioning-detail-client.tsx
//
// Shell cliente para el detalle de provisioning.
// Gestiona el estado del diálogo de cambio manual de estado.
// ─────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useRouter }  from "next/navigation";
import { Settings2 }  from "lucide-react";

import { PlatformProvisioningStatusBadge }   from "./platform-provisioning-status-badge";
import { PlatformProvisioningValidator }     from "./platform-provisioning-validator";
import { PlatformDatabasePreflightPanel }    from "./platform-database-preflight-panel";
import { PlatformProvisioningChecklist }     from "./platform-provisioning-checklist";
import { PlatformProvisioningSummary }       from "./platform-provisioning-summary";
import { PlatformProvisioningPackageViewer } from "./platform-provisioning-package-viewer";
import { PlatformProvisioningLogTable }      from "./platform-provisioning-log-table";
import { MarkProvisioningStatusDialog }      from "./mark-provisioning-status-dialog";

import type {
  ProvisioningPackage,
  PlatformProvisioningLogItem,
  PlatformProvisioningStatus,
} from "../types/platform.types";

interface Props {
  organizationId:       string;
  organizationName:     string;
  provisioningStatus:   PlatformProvisioningStatus;
  pkg:                  ProvisioningPackage;
  logs:                 PlatformProvisioningLogItem[];
}

export function PlatformProvisioningDetailClient({
  organizationId,
  organizationName,
  provisioningStatus,
  pkg,
  logs,
}: Props) {
  const router = useRouter();
  const [showStatusDialog, setShowStatusDialog] = useState(false);

  function handleValidated() {
    router.refresh();
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-800">{organizationName}</h1>
            <p className="text-xs font-mono text-zinc-400 mt-0.5">{organizationId}</p>
          </div>
          <div className="flex items-center gap-3">
            <PlatformProvisioningStatusBadge status={provisioningStatus} size="md" />
            <button
              type="button"
              onClick={() => setShowStatusDialog(true)}
              className="flex items-center gap-2 text-sm font-semibold text-zinc-600 border border-zinc-200 px-3 py-1.5 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              <Settings2 size={14} />
              Cambiar estado
            </button>
          </div>
        </div>
      </div>

      {/* Validador de configuración Platform */}
      <PlatformProvisioningValidator
        organizationId={organizationId}
        organizationName={organizationName}
        onValidated={handleValidated}
      />

      {/* Preflight de base de datos operativa */}
      <PlatformDatabasePreflightPanel organizationId={organizationId} />

      {/* Checklist */}
      <PlatformProvisioningChecklist checks={pkg.validation.checks} />

      {/* Provisioning Summary */}
      <PlatformProvisioningSummary config={pkg.config} />

      {/* Provisioning Package */}
      <PlatformProvisioningPackageViewer pkg={pkg} />

      {/* Historial de logs */}
      <PlatformProvisioningLogTable logs={logs} />

      {/* Diálogo cambio manual */}
      {showStatusDialog && (
        <MarkProvisioningStatusDialog
          organizationId={organizationId}
          organizationName={organizationName}
          currentStatus={provisioningStatus}
          onClose={() => {
            setShowStatusDialog(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
