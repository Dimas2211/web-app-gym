"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/reports — purchases-period-chart.tsx
// ─────────────────────────────────────────────────────────────────

import { VerticalBarChart } from "@/components/reports/ReportBarChart";
import type { PeriodDataPoint } from "../types/commerce-report.types";
import { shortCurrency } from "../utils/report-number-format";

interface Props {
  data: PeriodDataPoint[];
}

export function PurchasesPeriodChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-zinc-500">
        Sin compras confirmadas en el período.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    label: d.date.slice(5), // MM-DD
    value: d.total,
    color: "#3b82f6",
  }));

  return (
    <VerticalBarChart
      data={chartData}
      title="Compras por día"
      valueFormatter={shortCurrency}
    />
  );
}
