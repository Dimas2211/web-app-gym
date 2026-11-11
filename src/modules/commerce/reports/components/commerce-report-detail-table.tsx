"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/reports — commerce-report-detail-table.tsx
//
// Tabla resumen del período: ventas vs compras por día o agrupación.
// Muestra solo días con actividad.
// ─────────────────────────────────────────────────────────────────

import type { PeriodDataPoint } from "../types/commerce-report.types";
import { formatCurrency } from "../utils/report-number-format";

interface Props {
  sales:     PeriodDataPoint[];
  purchases: PeriodDataPoint[];
}

function buildRows(sales: PeriodDataPoint[], purchases: PeriodDataPoint[]) {
  const dateSet = new Set([...sales.map((s) => s.date), ...purchases.map((p) => p.date)]);
  const salesMap     = new Map(sales.map((s) => [s.date, s]));
  const purchasesMap = new Map(purchases.map((p) => [p.date, p.total]));

  return [...dateSet]
    .sort()
    .map((date) => {
      const sale_total     = salesMap.get(date)?.total ?? 0;
      const gross_sales = salesMap.get(date)?.gross_sales ?? sale_total;
      const cancelled_sales = salesMap.get(date)?.cancelled_sales ?? 0;
      const purchase_total = purchasesMap.get(date) ?? 0;
      return { date, gross_sales, cancelled_sales, sale_total, purchase_total, margin: sale_total - purchase_total };
    });
}

export function CommerceReportDetailTable({ sales, purchases }: Props) {
  const rows = buildRows(sales, purchases);

  if (!rows.length) {
    return (
      <div className="flex items-center justify-center h-16 text-sm text-zinc-500">
        Sin actividad en el período.
      </div>
    );
  }

  const totals = rows.reduce(
    (acc, r) => ({
      gross_sales: acc.gross_sales + r.gross_sales,
      cancelled_sales: acc.cancelled_sales + r.cancelled_sales,
      sale_total:     acc.sale_total     + r.sale_total,
      purchase_total: acc.purchase_total + r.purchase_total,
      margin:         acc.margin         + r.margin,
    }),
    { gross_sales: 0, cancelled_sales: 0, sale_total: 0, purchase_total: 0, margin: 0 },
  );

  return (
    <div className="overflow-x-auto">
      <table className="zv-table-dark w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="py-2 px-3 text-left text-zinc-400 font-medium">Fecha</th>
            <th className="py-2 px-3 text-right text-zinc-400 font-medium">Ventas brutas</th>
            <th className="py-2 px-3 text-right text-zinc-400 font-medium">Anulaciones</th>
            <th className="py-2 px-3 text-right text-zinc-400 font-medium">Ventas netas</th>
            <th className="py-2 px-3 text-right text-zinc-400 font-medium">Compras</th>
            <th className="py-2 px-3 text-right text-zinc-400 font-medium">Margen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
              <td className="py-1.5 px-3 text-zinc-300 font-mono">{r.date}</td>
              <td className="py-1.5 px-3 text-right text-emerald-400">{formatCurrency(r.gross_sales)}</td>
              <td className="py-1.5 px-3 text-right text-rose-400">{formatCurrency(r.cancelled_sales ? -r.cancelled_sales : 0)}</td>
              <td className="py-1.5 px-3 text-right text-emerald-400">
                {formatCurrency(r.sale_total)}
              </td>
              <td className="py-1.5 px-3 text-right text-blue-400">
                {r.purchase_total > 0 ? formatCurrency(r.purchase_total) : "—"}
              </td>
              <td className={`py-1.5 px-3 text-right ${r.margin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {formatCurrency(r.margin)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-700">
            <td className="py-2 px-3 text-zinc-300 font-semibold">Total</td>
            <td className="py-2 px-3 text-right text-emerald-400 font-semibold">{formatCurrency(totals.gross_sales)}</td>
            <td className="py-2 px-3 text-right text-rose-400 font-semibold">{formatCurrency(totals.cancelled_sales ? -totals.cancelled_sales : 0)}</td>
            <td className="py-2 px-3 text-right text-emerald-400 font-semibold">
              {formatCurrency(totals.sale_total)}
            </td>
            <td className="py-2 px-3 text-right text-blue-400 font-semibold">
              {formatCurrency(totals.purchase_total)}
            </td>
            <td className={`py-2 px-3 text-right font-semibold ${totals.margin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {formatCurrency(totals.margin)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
