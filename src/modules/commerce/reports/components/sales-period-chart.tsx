"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/reports — sales-period-chart.tsx
// ─────────────────────────────────────────────────────────────────

import { VerticalBarChart } from "@/components/reports/ReportBarChart";
import type { PeriodDataPoint } from "../types/commerce-report.types";
import { shortCurrency } from "../utils/report-number-format";

interface Props {
  data: PeriodDataPoint[];
}

export function SalesPeriodChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-zinc-500">
        Sin ventas confirmadas en el período.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    label: d.date.slice(5), // MM-DD
    value: d.total,
    color: "#10b981",
  }));

  return (
    <VerticalBarChart
      data={chartData}
      title="Ventas por día"
      valueFormatter={shortCurrency}
    />
  );
}
