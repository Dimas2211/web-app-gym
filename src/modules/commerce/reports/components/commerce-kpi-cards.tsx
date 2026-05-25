"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/reports — commerce-kpi-cards.tsx
// ─────────────────────────────────────────────────────────────────

import type { CommerceReportSummary } from "../types/commerce-report.types";
import { formatCurrency, formatNumber } from "../utils/report-number-format";

interface Props {
  summary: CommerceReportSummary;
}

interface KpiCardProps {
  label:    string;
  value:    string;
  sub?:     string;
  accent?:  "green" | "red" | "blue" | "default";
}

function KpiCard({ label, value, sub, accent = "default" }: KpiCardProps) {
  const accentClass = {
    green:   "border-l-2 border-l-emerald-500",
    red:     "border-l-2 border-l-rose-500",
    blue:    "border-l-2 border-l-blue-500",
    default: "",
  }[accent];

  return (
    <div className={`bg-zinc-900 border border-zinc-800 rounded-lg p-4 ${accentClass}`}>
      <p className="text-zinc-400 text-xs mb-1 leading-tight">{label}</p>
      <p className="text-white font-semibold text-lg leading-tight truncate">{value}</p>
      {sub && <p className="text-zinc-500 text-xs mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

export function CommerceKpiCards({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <KpiCard
        label="Total vendido"
        value={formatCurrency(summary.total_sales)}
        sub={`${formatNumber(summary.sales_count)} ventas confirmadas`}
        accent="green"
      />
      <KpiCard
        label="Total comprado"
        value={formatCurrency(summary.total_purchases)}
        sub={`${formatNumber(summary.purchases_count)} compras confirmadas`}
        accent="blue"
      />
      <KpiCard
        label="Margen estimado"
        value={formatCurrency(summary.estimated_margin)}
        sub={
          summary.total_sales > 0
            ? `${((summary.estimated_margin / summary.total_sales) * 100).toFixed(1)}% del total vendido`
            : undefined
        }
        accent={summary.estimated_margin >= 0 ? "green" : "red"}
      />
      <KpiCard
        label="Ticket promedio"
        value={formatCurrency(summary.avg_ticket)}
        sub="por venta confirmada"
      />
      <KpiCard
        label="Ventas confirmadas"
        value={formatNumber(summary.sales_count)}
      />
      <KpiCard
        label="Compras confirmadas"
        value={formatNumber(summary.purchases_count)}
      />
      <KpiCard
        label="Producto más vendido"
        value={summary.top_product_name ?? "Sin datos"}
        sub="por monto total"
      />
      <KpiCard
        label="Servicio más vendido"
        value={summary.top_service_name ?? "Sin datos"}
        sub="por monto total"
      />
    </div>
  );
}
