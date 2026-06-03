"use client";

// ─────────────────────────────────────────────────────────────────
// platform — platform-provisioning-log-table.tsx
//
// Tabla de logs de provisioning por organización.
// ─────────────────────────────────────────────────────────────────

import { PlatformProvisioningStatusBadge } from "./platform-provisioning-status-badge";
import type { PlatformProvisioningLogItem } from "../types/platform.types";

function formatDate(d: Date): string {
  return new Date(d).toLocaleString("es-SV", {
    year:   "numeric",
    month:  "2-digit",
    day:    "2-digit",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  logs: PlatformProvisioningLogItem[];
}

export function PlatformProvisioningLogTable({ logs }: Props) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
        Historial de provisioning
      </h2>

      {logs.length === 0 ? (
        <p className="text-sm text-zinc-400 italic">Sin intentos de provisioning registrados.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left py-2 pr-4 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  Fecha
                </th>
                <th className="text-left py-2 pr-4 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  Resultado
                </th>
                <th className="text-left py-2 pr-4 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  Notas
                </th>
                <th className="text-left py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  Errores
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="py-2.5 pr-4 text-zinc-600 whitespace-nowrap font-mono text-xs">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="py-2.5 pr-4">
                    <PlatformProvisioningStatusBadge status={log.result} />
                  </td>
                  <td className="py-2.5 pr-4 text-zinc-600 max-w-xs">
                    {log.notes ?? "—"}
                  </td>
                  <td className="py-2.5 text-zinc-500 text-xs max-w-xs">
                    {log.validation_errors && Array.isArray(log.validation_errors) && log.validation_errors.length > 0 ? (
                      <ul className="list-disc list-inside space-y-0.5">
                        {(log.validation_errors as string[]).map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
