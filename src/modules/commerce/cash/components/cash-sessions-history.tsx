"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — cash-sessions-history.tsx
//
// Historial de sesiones de caja con filtros básicos.
// Permite seleccionar una sesión para ver su corte.
// No exporta PDF/Excel. No integra ventas ni DTE.
// ─────────────────────────────────────────────────────────────────

import { useState } from "react";
import type { CashSessionHistoryItem, CashCutStatus } from "../types/cash.types";

// ── Labels de estado derivado ─────────────────────────────────────

const CUT_STATUS_LABELS: Record<CashCutStatus, string> = {
  OPEN:             "Abierta",
  CLOSED_BALANCED:  "Cerrada cuadrada",
  CLOSED_OVER:      "Cerrada con sobrante",
  CLOSED_SHORT:     "Cerrada con faltante",
  CANCELLED:        "Cancelada",
};

function cutStatusClass(status: CashCutStatus): string {
  switch (status) {
    case "OPEN":            return "bg-green-100 text-green-700";
    case "CLOSED_BALANCED": return "bg-zinc-100 text-zinc-600";
    case "CLOSED_OVER":     return "bg-blue-100 text-blue-700";
    case "CLOSED_SHORT":    return "bg-red-100 text-red-700";
    case "CANCELLED":       return "bg-yellow-100 text-yellow-700";
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function formatCurrency(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "$0.00";
  return "$" + Number(value).toFixed(2);
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-SV", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Props ─────────────────────────────────────────────────────────

type StatusFilter = "ALL" | "OPEN" | "CLOSED" | "CANCELLED";

interface CashSessionsHistoryProps {
  sessions:           CashSessionHistoryItem[];
  loading:            boolean;
  error:              string | null;
  selectedSessionId:  string | null;
  onSelectSession:    (id: string) => void;
  onReload:           (filters: {
    status:           StatusFilter;
    only_differences: boolean;
  }) => void;
}

// ── Componente ────────────────────────────────────────────────────

export function CashSessionsHistory({
  sessions,
  loading,
  error,
  selectedSessionId,
  onSelectSession,
  onReload,
}: CashSessionsHistoryProps) {
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>("ALL");
  const [onlyDiffs,    setOnlyDiffs]      = useState(false);

  function handleReload() {
    onReload({ status: statusFilter, only_differences: onlyDiffs });
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h2 className="text-sm font-medium text-zinc-700">Historial de sesiones</h2>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <label htmlFor="history-status" className="text-xs text-zinc-500">
            Estado
          </label>
          <select
            id="history-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          >
            <option value="ALL">Todas</option>
            <option value="OPEN">Abiertas</option>
            <option value="CLOSED">Cerradas</option>
            <option value="CANCELLED">Canceladas</option>
          </select>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyDiffs}
            onChange={(e) => setOnlyDiffs(e.target.checked)}
            className="rounded border-zinc-300"
          />
          Solo diferencias
        </label>

        <button
          type="button"
          onClick={handleReload}
          disabled={loading}
          className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? "Cargando..." : "Recargar"}
        </button>
      </div>

      {/* Contenido */}
      {error && (
        <div className="px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {!error && sessions.length === 0 && !loading && (
        <div className="px-4 py-6 text-center text-sm text-zinc-400">
          No hay sesiones registradas con los filtros actuales.
        </div>
      )}

      {sessions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-zinc-400">
                <th className="px-3 py-2 font-medium">Caja</th>
                <th className="px-3 py-2 font-medium">Apertura</th>
                <th className="px-3 py-2 font-medium">Cierre</th>
                <th className="px-3 py-2 font-medium">Abrió</th>
                <th className="px-3 py-2 font-medium">Cerró</th>
                <th className="px-3 py-2 font-medium text-right">Inicial</th>
                <th className="px-3 py-2 font-medium text-right">Esperado</th>
                <th className="px-3 py-2 font-medium text-right">Declarado</th>
                <th className="px-3 py-2 font-medium text-right">Diferencia</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {sessions.map((s) => {
                const isSelected = s.id === selectedSessionId;
                const diff = s.difference_amount;
                return (
                  <tr
                    key={s.id}
                    onClick={() => onSelectSession(s.id)}
                    className={[
                      "cursor-pointer transition-colors",
                      isSelected
                        ? "bg-zinc-50"
                        : "hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium text-zinc-800">{s.cash_register_name}</p>
                      <p className="text-zinc-400">{s.cash_register_code}</p>
                    </td>
                    <td className="px-3 py-2 text-zinc-600 whitespace-nowrap">
                      {formatDate(s.opened_at)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 whitespace-nowrap">
                      {formatDate(s.closed_at)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600">
                      {s.opened_by_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600">
                      {s.closed_by_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-700">
                      {formatCurrency(s.opening_amount)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-700">
                      {formatCurrency(s.expected_cash_amount)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-700">
                      {s.declared_cash_amount != null
                        ? formatCurrency(s.declared_cash_amount)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {diff != null ? (
                        <span
                          className={
                            diff < 0
                              ? "font-medium text-red-600"
                              : diff > 0
                                ? "font-medium text-blue-700"
                                : "text-zinc-600"
                          }
                        >
                          {diff >= 0 ? "+" : ""}
                          {formatCurrency(diff)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={[
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          cutStatusClass(s.cut_status),
                        ].join(" ")}
                      >
                        {CUT_STATUS_LABELS[s.cut_status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
