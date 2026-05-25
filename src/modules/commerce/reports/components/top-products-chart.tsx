"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/reports — top-products-chart.tsx
// ─────────────────────────────────────────────────────────────────

import { useState } from "react";
import { HorizontalBarChart } from "@/components/reports/ReportBarChart";
import type { TopItemData } from "../types/commerce-report.types";
import { shortCurrency } from "../utils/report-number-format";

interface Props {
  byAmount: TopItemData[];
  byQty:    TopItemData[];
}

type SortMode = "amount" | "qty";

export function TopProductsChart({ byAmount, byQty }: Props) {
  const [mode, setMode] = useState<SortMode>("amount");

  const data = mode === "amount" ? byAmount : byQty;

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-zinc-500">
        Sin productos vendidos en el período.
      </div>
    );
  }

  const chartData = data.map((d) =>
    mode === "amount"
      ? { label: d.name, value: d.total,    color: "#6366f1" }
      : { label: d.name, value: d.quantity, color: "#8b5cf6" },
  );

  const fmt = mode === "amount"
    ? shortCurrency
    : (v: number) => `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)} uds`;

  return (
    <div className="space-y-2">
      <div className="flex gap-1 justify-end">
        <button
          type="button"
          onClick={() => setMode("amount")}
          className={`px-2 py-1 text-[11px] rounded transition-colors ${
            mode === "amount"
              ? "bg-indigo-600 text-white"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          }`}
        >
          Por monto
        </button>
        <button
          type="button"
          onClick={() => setMode("qty")}
          className={`px-2 py-1 text-[11px] rounded transition-colors ${
            mode === "qty"
              ? "bg-violet-600 text-white"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          }`}
        >
          Por cantidad
        </button>
      </div>
      <HorizontalBarChart
        data={chartData}
        valueFormatter={fmt}
      />
    </div>
  );
}
