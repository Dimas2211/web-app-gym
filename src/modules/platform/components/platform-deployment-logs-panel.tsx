// ─────────────────────────────────────────────────────────────────
// platform — platform-deployment-logs-panel.tsx
//
// Panel de logs de despliegue de una organización. Solo lectura.
// ─────────────────────────────────────────────────────────────────

import type { PlatformDeploymentLogItem } from "../types/platform.types";

const STATUS_COLORS: Record<string, string> = {
  SUCCESS:  "bg-green-100 text-green-700",
  FAILED:   "bg-red-100 text-red-700",
  ROLLBACK: "bg-yellow-100 text-yellow-700",
};

function formatDate(d: Date): string {
  return new Date(d).toLocaleString("es-SV", {
    year:   "numeric",
    month:  "2-digit",
    day:    "2-digit",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

export function PlatformDeploymentLogsPanel({
  logs,
}: {
  logs: PlatformDeploymentLogItem[];
}) {
  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
          Historial de operaciones
        </h2>
        <p className="text-sm text-zinc-400">Sin registros aún.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-100">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Historial de operaciones ({logs.length})
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-100">
              <th className="text-left px-4 py-2 text-xs font-semibold text-zinc-500 w-[170px]">Fecha</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-zinc-500">Acción</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-zinc-500 w-[90px]">Estado</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-zinc-500">Notas</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-zinc-50 hover:bg-zinc-50 transition-colors">
                <td className="px-4 py-2 text-xs text-zinc-500 whitespace-nowrap">
                  {formatDate(log.created_at)}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-zinc-700">{log.action}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[log.status] ?? "bg-zinc-100 text-zinc-600"}`}>
                    {log.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-zinc-500 max-w-[300px] truncate">
                  {log.notes ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
