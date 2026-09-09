// ─────────────────────────────────────────────────────────────────
// commerce/dte/monitoring — dte-monitoring-panel.tsx
//
// FASE IV-C — Inspector de metering comercial DTE. Componente de
// servidor puro (sin "use client"): el filtro de periodo usa un
// <form method="GET"> nativo — no requiere interactividad de cliente
// para esta primera pasada (IV-C es solo lectura, sin scheduler ni
// polling). Backend (getDteMonitoringPanelData) es la única fuente de
// verdad — nunca se recalculan cantidades aquí.
// ─────────────────────────────────────────────────────────────────

import type { DteMonitoringPanelData } from "../../queries/get-dte-monitoring-panel-data";
import type { DteMonthlyMeteringEntry } from "../../services/dte-fiscal-metering.service";

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-SV", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ledgerStatusCls(status: DteMonthlyMeteringEntry["status"]): string {
  switch (status) {
    case "CONSUMED": return "bg-emerald-100 text-emerald-700";
    case "PENDING":  return "bg-amber-100 text-amber-700";
    case "RELEASED": return "bg-zinc-100 text-zinc-500";
  }
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm px-4 py-3">
      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-zinc-800 mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ageInDays(reservedAt: Date | string): number {
  const d = typeof reservedAt === "string" ? new Date(reservedAt) : reservedAt;
  const diffMs = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

interface Props {
  data: DteMonitoringPanelData;
  isRuntimeSession: boolean;
}

export function DteMonitoringPanel({ data, isRuntimeSession }: Props) {
  const { status, pending, periodKey, periodEntries } = data;

  return (
    <div className="space-y-5">
      {isRuntimeSession && (
        <div className="bg-zinc-50 border border-zinc-200 text-zinc-500 text-xs rounded-lg px-4 py-2 italic">
          Modo &quot;Operar como cliente&quot; — vista de solo lectura del tenant runtime.
        </div>
      )}

      {/* ── Estado de metering del periodo vigente ─────────────────── */}
      <div>
        <h2 className="text-sm font-bold text-zinc-700 mb-2">
          Consumo mensual — {status.periodKey ?? "sin periodo resuelto"}
          {status.timezone && <span className="text-xs font-normal text-zinc-400 ml-2">({status.timezone})</span>}
        </h2>

        {!status.configured ? (
          <div className="bg-zinc-50 border border-zinc-200 text-zinc-500 text-sm rounded-lg px-4 py-3">
            {status.source === "TIMEZONE_INVALID_OR_MISSING"
              ? "No se pudo resolver el periodo vigente — falta o es inválida la zona horaria de la organización."
              : status.source === "LEGACY_UNMANAGED_BYPASS"
                ? "Esta organización opera en modo legacy sin metering comercial configurado."
                : "El entitlement fiscal.dte.monthly_issued no está configurado para esta organización."}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="Consumidos" value={String(status.consumed)} />
            <StatCard label="Pendientes" value={String(status.pending)} />
            <StatCard label="Ocupados" value={String(status.occupied)} sub="consumidos + pendientes" />
            <StatCard label="Límite" value={status.isUnlimited ? "Ilimitado" : String(status.limit ?? "—")} />
            <StatCard
              label="Disponible"
              value={status.isUnlimited ? "Sin límite" : String(status.remainingForNewIssue ?? "—")}
            />
          </div>
        )}
      </div>

      {/* ── PENDING — reservas por reconciliar ─────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-zinc-700">Pendientes de reconciliación ({pending.length})</h2>
        </div>
        <p className="text-[11px] text-zinc-400 mb-2">
          Las reservas de consumo corresponden únicamente a DTE de producción — los DTE de ambiente TEST nunca generan
          reserva de metering, aunque puedan quedar en estado incierto y tener su propio botón &quot;Consultar estado
          MH&quot; en el listado de DTE emitidos.
        </p>

        {pending.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-xl px-4 py-6 text-center text-sm text-zinc-400">
            No hay DTE pendientes de reconciliación.
          </div>
        ) : (
          <div className="bg-white border border-zinc-200 rounded-xl overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Reservado</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Antigüedad</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Periodo</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Tipo</th>
                  <th className="text-left px-3 py-2 font-semibold">Control number</th>
                  <th className="text-left px-3 py-2 font-semibold">Generation code</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Estado DTE</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Ambiente</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.dteDocumentId} className="border-b border-zinc-50 last:border-0">
                    <td className="px-3 py-1.5 whitespace-nowrap text-zinc-600">{fmtDateTime(p.reservedAt)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-zinc-500">{ageInDays(p.reservedAt)}d</td>
                    <td className="px-3 py-1.5 whitespace-nowrap font-mono text-zinc-500">{p.periodKey}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-zinc-600">{p.dteTypeCode}</td>
                    <td className="px-3 py-1.5 font-mono text-zinc-500 truncate max-w-[200px]">{p.controlNumber ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-zinc-500 truncate max-w-[200px]">{p.generationCode ?? "—"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-zinc-600">{p.dteStatus}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-zinc-500">{p.environment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Historial de metering por periodo ───────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-zinc-700">
            Historial de metering{periodKey ? ` — ${periodKey}` : ""} ({periodEntries.length})
          </h2>

          <form method="GET" className="flex items-center gap-2">
            <label htmlFor="period" className="text-[11px] text-zinc-400">Periodo (YYYY-MM)</label>
            <input
              id="period"
              type="text"
              name="period"
              defaultValue={periodKey ?? ""}
              pattern="\d{4}-\d{2}"
              placeholder="2026-09"
              className="h-7 w-24 px-2 text-xs border border-zinc-200 rounded focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
            <button
              type="submit"
              className="h-7 px-3 text-xs font-semibold bg-zinc-900 text-white rounded hover:bg-zinc-800 transition-colors"
            >
              Ver
            </button>
          </form>
        </div>

        {periodEntries.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-xl px-4 py-6 text-center text-sm text-zinc-400">
            No hay entradas de metering para este periodo.
          </div>
        ) : (
          <div className="bg-white border border-zinc-200 rounded-xl overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Ledger</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Tipo</th>
                  <th className="text-left px-3 py-2 font-semibold">Control number</th>
                  <th className="text-left px-3 py-2 font-semibold">Generation code</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Estado DTE</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Reservado</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Resuelto</th>
                </tr>
              </thead>
              <tbody>
                {periodEntries.map((e) => (
                  <tr key={e.dteDocumentId} className="border-b border-zinc-50 last:border-0">
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ledgerStatusCls(e.status)}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-zinc-600">{e.dteTypeCode}</td>
                    <td className="px-3 py-1.5 font-mono text-zinc-500 truncate max-w-[200px]">{e.controlNumber ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-zinc-500 truncate max-w-[200px]">{e.generationCode ?? "—"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-zinc-600">{e.dteStatus}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-zinc-500">{fmtDateTime(e.reservedAt)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-zinc-500">{fmtDateTime(e.resolvedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
