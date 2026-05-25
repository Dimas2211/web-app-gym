"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/reports — service-sales-pie-chart.tsx
//
// Gráfica de pastel SVG nativa. No usa librerías externas.
// Mantiene el mismo estilo dark-theme que ReportBarChart.
// ─────────────────────────────────────────────────────────────────

import type { ServiceDistributionItem } from "../types/commerce-report.types";
import { formatCurrency } from "../utils/report-number-format";

const COLORS = [
  "#f59e0b", "#6366f1", "#10b981", "#3b82f6", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
];

interface Props {
  data: ServiceDistributionItem[];
}

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function slicePath(cx: number, cy: number, r: number, start: number, end: number): string {
  const s = polarToCartesian(cx, cy, r, start);
  const e = polarToCartesian(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M${cx},${cy} L${s.x},${s.y} A${r},${r} 0 ${large},1 ${e.x},${e.y} Z`;
}

export function ServiceSalesPieChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-zinc-500">
        Sin servicios vendidos en el período.
      </div>
    );
  }

  const W = 480;
  const H = 220;
  const cx = 110;
  const cy = 108;
  const r  = 88;

  const C = {
    bg:       "#18181b",
    label:    "#a1a1aa",
    labelDim: "#71717a",
    value:    "#e4e4e7",
  };

  // Build slices
  let cumDeg = 0;
  const slices = data.map((item, i) => {
    const deg    = (item.percentage / 100) * 360;
    const start  = cumDeg;
    const end    = cumDeg + deg;
    cumDeg       = end;
    return { ...item, start, end, color: COLORS[i % COLORS.length] };
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={W} height={H} fill={C.bg} rx="8" />

      <text x={cx} y={16} fill={C.label} fontSize="11" textAnchor="middle" fontFamily="Arial, sans-serif">
        Distribución de servicios
      </text>

      {/* Slices */}
      {slices.map((s) => (
        <path
          key={s.name}
          d={slicePath(cx, cy, r, s.start, s.end)}
          fill={s.color}
          opacity="0.88"
          stroke="#18181b"
          strokeWidth="1.5"
        />
      ))}

      {/* Legend */}
      {slices.map((s, i) => {
        const legendY = 28 + i * 22;
        return (
          <g key={s.name} transform={`translate(220, ${legendY})`}>
            <rect x={0} y={-9} width={10} height={10} fill={s.color} rx="1.5" />
            <text x={15} y={0} fill={C.label} fontSize="9" fontFamily="Arial, sans-serif">
              {s.name.length > 28 ? s.name.slice(0, 27) + "…" : s.name}
            </text>
            <text x={255} y={0} fill={C.value} fontSize="9" textAnchor="end" fontFamily="Arial, sans-serif">
              {s.percentage.toFixed(1)}%
            </text>
            <text x={255} y={11} fill={C.labelDim} fontSize="8" textAnchor="end" fontFamily="Arial, sans-serif">
              {formatCurrency(s.total)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
