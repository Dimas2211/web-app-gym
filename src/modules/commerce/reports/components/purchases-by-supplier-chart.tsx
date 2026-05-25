"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/reports — purchases-by-supplier-chart.tsx
// ─────────────────────────────────────────────────────────────────

import { HorizontalBarChart } from "@/components/reports/ReportBarChart";
import type { SupplierPurchaseData } from "../types/commerce-report.types";
import { shortCurrency } from "../utils/report-number-format";

interface Props {
  data: SupplierPurchaseData[];
}

export function PurchasesBySupplierChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-zinc-500">
        Sin compras confirmadas en el período.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    label: d.supplier_name,
    value: d.total,
    color: "#3b82f6",
  }));

  return (
    <HorizontalBarChart
      data={chartData}
      title="Compras por proveedor"
      valueFormatter={shortCurrency}
    />
  );
}
