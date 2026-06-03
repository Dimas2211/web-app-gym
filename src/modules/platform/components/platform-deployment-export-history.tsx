"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-deployment-export-history.tsx
//
// Tabla de historial de exportaciones de Deployment Bundles.
// ─────────────────────────────────────────────────────────────────

import { CheckCircle2, XCircle } from "lucide-react";
import type { DeploymentExportLogItem } from "../types/platform.types";

interface Props {
  logs:            DeploymentExportLogItem[];
  showOrganization?: boolean;
}

const EXPORT_TYPE_LABELS: Record<string, string> = {
  DEPLOYMENT_BUNDLE:      "Deployment Bundle",
  CONFIGURATION_PACKAGE:  "Config. Package",
};

export function PlatformDeploymentExportHistory({ logs, showOrganization = false }: Props) {
  if (logs.length === 0) {
    return (
      <p className="text-sm text-zinc-400 italic py-4 text-center">
        Sin exportaciones registradas.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 uppercase tracking-wide">
            {showOrganization && <th className="pb-2 pr-4 font-medium">Organización</th>}
            <th className="pb-2 pr-4 font-medium">Tipo</th>
            <th className="pb-2 pr-4 font-medium">Versión</th>
            <th className="pb-2 pr-4 font-medium">Resultado</th>
            <th className="pb-2 pr-4 font-medium">Fecha</th>
            {showOrganization && <th className="pb-2 font-medium">Usuario</th>}
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
              {showOrganization && (
                <td className="py-2.5 pr-4">
                  <div className="font-medium text-zinc-800">{log.organization.name}</div>
                  <div className="text-xs text-zinc-400">{log.organization.code}</div>
                </td>
              )}
              <td className="py-2.5 pr-4 text-zinc-600">
                {EXPORT_TYPE_LABELS[log.export_type] ?? log.export_type}
              </td>
              <td className="py-2.5 pr-4">
                <span className="font-mono text-xs bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded">
                  {log.bundle_version}
                </span>
              </td>
              <td className="py-2.5 pr-4">
                {log.result === "SUCCESS" ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 size={13} /> Exitoso
                  </span>
                ) : (
                  <div>
                    <span className="inline-flex items-center gap-1 text-red-600">
                      <XCircle size={13} /> Fallido
                    </span>
                    {log.error_message && (
                      <div className="text-xs text-red-400 mt-0.5 max-w-xs truncate" title={log.error_message}>
                        {log.error_message}
                      </div>
                    )}
                  </div>
                )}
              </td>
              <td className="py-2.5 pr-4 text-zinc-500 text-xs whitespace-nowrap">
                {new Date(log.created_at).toLocaleString("es-SV")}
              </td>
              {showOrganization && (
                <td className="py-2.5 text-zinc-400 text-xs font-mono">
                  {log.exported_by ? log.exported_by.substring(0, 8) + "…" : "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
