"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/reports — product-vs-service-chart.tsx
// ─────────────────────────────────────────────────────────────────

import { VerticalBarChart } from "@/components/reports/ReportBarChart";
import type { ProductVsServiceData } from "../types/commerce-report.types";
import { shortCurrency } from "../utils/report-number-format";

interface Props {
  data: ProductVsServiceData;
}

export function ProductVsServiceChart({ data }: Props) {
  const hasData = data.products_total > 0 || data.services_total > 0;

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-zinc-500">
        Sin ventas confirmadas en el período.
      </div>
    );
  }

  const chartData = [
    { label: "Productos", value: data.products_total, color: "#6366f1" },
    { label: "Servicios", value: data.services_total, color: "#f59e0b" },
  ];

  return (
    <VerticalBarChart
      data={chartData}
      title="Productos vs Servicios"
      valueFormatter={shortCurrency}
    />
  );
}
