"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — cash-session-cut-panel.tsx
//
// Panel de corte de una sesión de caja seleccionada.
// Incluye botón "Imprimir corte" que usa window.print().
// La vista imprimible se renderiza en cash-client.tsx fuera de
// la capa print:hidden para que sea la única visible al imprimir.
// ─────────────────────────────────────────────────────────────────

import type { CashSessionCutReport, CashCutStatus } from "../types/cash.types";
import { exportCashCutPdf }   from "../utils/export-cash-cut-pdf";
import { exportCashCutExcel } from "../utils/export-cash-cut-excel";

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

const MOVEMENT_DIRECTION_LABEL: Record<string, string> = {
  IN:  "Entrada",
  OUT: "Salida",
};

// ── Props ─────────────────────────────────────────────────────────

interface CashSessionCutPanelProps {
  report:  CashSessionCutReport;
  loading: boolean;
  onClose: () => void;
}

// ── Componente ────────────────────────────────────────────────────

export function CashSessionCutPanel({
  report,
  loading,
  onClose,
}: CashSessionCutPanelProps) {
  const diff = report.difference_amount;

  function handlePrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      {/* Encabezado */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-medium text-zinc-700">Corte de sesión</h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            {report.cash_register_name} — {report.cash_register_code}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={[
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              cutStatusClass(report.cut_status),
            ].join(" ")}
          >
            {CUT_STATUS_LABELS[report.cut_status]}
          </span>
          <button
            type="button"
            onClick={handlePrint}
            disabled={loading}
            className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-400 hover:text-zinc-800 disabled:opacity-40"
          >
            Imprimir corte
          </button>
          <button
            type="button"
            onClick={() => exportCashCutPdf(report)}
            disabled={loading}
            className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:border-blue-400 hover:bg-blue-100 disabled:opacity-40"
          >
            Exportar PDF
          </button>
          <button
            type="button"
            onClick={() => exportCashCutExcel(report)}
            disabled={loading}
            className="rounded-md border border-green-300 bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:border-green-400 hover:bg-green-100 disabled:opacity-40"
          >
            Exportar Excel
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-zinc-400 hover:text-zinc-600"
          >
            Cerrar
          </button>
        </div>
      </div>

      {loading && (
        <div className="px-4 py-3 text-xs text-zinc-400">Cargando corte...</div>
      )}

      <div className="space-y-6 px-4 py-4">

        {/* Datos básicos de la sesión */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-zinc-400">Abrió</p>
            <p className="font-medium text-zinc-800">{report.opened_by_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Cerró</p>
            <p className="font-medium text-zinc-800">{report.closed_by_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Apertura</p>
            <p className="font-medium text-zinc-800">{formatDate(report.opened_at)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Cierre</p>
            <p className="font-medium text-zinc-800">{formatDate(report.closed_at)}</p>
          </div>
        </div>

        {/* Resumen de montos */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Resumen de efectivo
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-zinc-400">Monto inicial</p>
              <p className="font-medium text-zinc-800">
                {formatCurrency(report.opening_amount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Entradas manuales</p>
              <p className="font-medium text-green-700">
                +{formatCurrency(report.manual_in_total)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Salidas manuales</p>
              <p className="font-medium text-red-600">
                -{formatCurrency(report.manual_out_total)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Efectivo esperado</p>
              <p className="text-base font-semibold text-zinc-900">
                {formatCurrency(report.expected_cash_amount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Efectivo declarado</p>
              <p className="text-base font-semibold text-zinc-900">
                {report.declared_cash_amount != null
                  ? formatCurrency(report.declared_cash_amount)
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Diferencia</p>
              {diff != null ? (
                <p
                  className={[
                    "text-base font-semibold",
                    diff < 0 ? "text-red-600" : diff > 0 ? "text-blue-700" : "text-zinc-700",
                  ].join(" ")}
                >
                  {diff >= 0 ? "+" : ""}
                  {formatCurrency(diff)}
                </p>
              ) : (
                <p className="font-medium text-zinc-400">—</p>
              )}
            </div>
          </div>
        </div>

        {/* Movimientos manuales */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Movimientos manuales ({report.movements_count})
          </p>
          {report.movements.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No hubo movimientos manuales en esta sesión.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-zinc-400">
                    <th className="py-1.5 font-medium">Fecha</th>
                    <th className="py-1.5 font-medium">Tipo</th>
                    <th className="py-1.5 font-medium">Dir.</th>
                    <th className="py-1.5 text-right font-medium">Monto</th>
                    <th className="py-1.5 font-medium">Razón</th>
                    <th className="py-1.5 font-medium">Ref.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {report.movements.map((m) => (
                    <tr key={m.id}>
                      <td className="py-1.5 text-zinc-600 whitespace-nowrap">
                        {formatDate(m.performed_at)}
                      </td>
                      <td className="py-1.5 text-zinc-700">{m.movement_type_label}</td>
                      <td className="py-1.5">
                        <span
                          className={
                            m.direction === "IN"
                              ? "font-medium text-green-700"
                              : "font-medium text-red-600"
                          }
                        >
                          {MOVEMENT_DIRECTION_LABEL[m.direction] ?? m.direction}
                        </span>
                      </td>
                      <td className="py-1.5 text-right">
                        <span
                          className={
                            m.direction === "IN"
                              ? "font-medium text-green-700"
                              : "font-medium text-red-600"
                          }
                        >
                          {m.direction === "IN" ? "+" : "-"}
                          {formatCurrency(m.amount)}
                        </span>
                      </td>
                      <td className="py-1.5 text-zinc-600">{m.reason ?? "—"}</td>
                      <td className="py-1.5 text-zinc-600">{m.reference ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Ventas y pagos */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Ventas asociadas
          </p>
          {report.sales_summary.sales_count > 0 ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-zinc-400">Ventas confirmadas</p>
                <p className="font-medium text-zinc-800">{report.sales_summary.sales_count}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Total ventas</p>
                <p className="font-medium text-zinc-800">
                  {formatCurrency(report.sales_summary.total_amount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Pagado</p>
                <p className="font-medium text-green-700">
                  {formatCurrency(report.sales_summary.paid_amount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Pendiente</p>
                <p className="font-medium text-red-600">
                  {formatCurrency(report.sales_summary.unpaid_amount)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">
              Ventas y pagos se integrarán en una fase posterior.
            </p>
          )}
        </div>

        {/* Formas de pago */}
        {report.payments_summary.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
              Formas de pago
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-zinc-400">
                    <th className="py-1.5 font-medium">Método</th>
                    <th className="py-1.5 font-medium">Forma MH</th>
                    <th className="py-1.5 text-right font-medium">Transacciones</th>
                    <th className="py-1.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {report.payments_summary.map((p, idx) => (
                    <tr key={idx}>
                      <td className="py-1.5 font-medium text-zinc-700">
                        {p.label}
                      </td>
                      <td className="py-1.5 text-zinc-600">
                        {p.mh_payment_form_code ?? "—"}
                      </td>
                      <td className="py-1.5 text-right text-zinc-600">{p.count}</td>
                      <td className="py-1.5 text-right font-medium text-zinc-800">
                        {formatCurrency(p.total_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
