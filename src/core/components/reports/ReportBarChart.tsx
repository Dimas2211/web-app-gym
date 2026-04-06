"use client";

/**
 * SVG-based bar chart components for reports.
 *
 * All charts render natively to SVG so they display correctly in dark-theme
 * and can be captured as PNG for PDF exports via captureChartAsPng().
 * Colors are hardcoded (not Tailwind classes) so the SVG serialization
 * preserves appearance when converted to a PNG image.
 *
 * Exports:
 *   VerticalBarChart   — comparison bars  (revenue by branch, distributions)
 *   HorizontalBarChart — ranking bars     (trainers, memberships per branch)
 *   StackedBarChart    — stacked bars     (attendance attended vs absent)
 */

import React from "react";

// ─── Shared dark-theme palette ─────────────────────────────────────────────
const C = {
  bg: "#18181b",       // zinc-900
  grid: "#3f3f46",     // zinc-700
  axis: "#52525b",     // zinc-600
  labelDim: "#71717a", // zinc-500
  label: "#a1a1aa",    // zinc-400
  value: "#e4e4e7",    // zinc-200
  rowAlt: "#27272a",   // zinc-800
};

// Abbreviated number for axis tick labels (Y/X axes)
function shortFmt(v: number): string {
  if (v === 0) return "0";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(Math.round(v));
}

// ─── Shared types ──────────────────────────────────────────────────────────

export interface BarItem {
  label: string;
  value: number;
  color?: string;
}

export interface StackedBarItem {
  label: string;
  /** Order: first value renders at BOTTOM of bar */
  values: { value: number; color: string; name: string }[];
}

// ─── Vertical Bar Chart ────────────────────────────────────────────────────

interface VerticalBarChartProps {
  data: BarItem[];
  defaultColor?: string;
  /** Formatter for value labels on top of bars (keep short for narrow bars) */
  valueFormatter?: (v: number) => string;
  title?: string;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}

export function VerticalBarChart({
  data,
  defaultColor = "#3b82f6",
  valueFormatter,
  title,
  svgRef,
}: VerticalBarChartProps) {
  if (!data.length) return null;

  const W = 560;
  const H = 220;
  const pad = { top: title ? 36 : 22, right: 20, bottom: 56, left: 68 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const nTicks = 4;
  const yTicks = Array.from({ length: nTicks + 1 }, (_, i) => (maxVal / nTicks) * i);

  const slotW = cW / data.length;
  const barW = Math.max(Math.min(slotW * 0.72, 56), 4);
  // Only show value labels when bars are wide enough to fit text
  const showValLabels = data.length <= 6;

  const fmt = valueFormatter ?? ((v: number) => v.toLocaleString("es-MX"));

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={W} height={H} fill={C.bg} rx="8" />

      {title && (
        <text x={pad.left} y={20} fill={C.label} fontSize="11" fontFamily="Arial, sans-serif">
          {title}
        </text>
      )}

      {/* Y grid lines + tick labels */}
      {yTicks.map((tick) => {
        const y = pad.top + cH - (tick / maxVal) * cH;
        return (
          <g key={tick}>
            <line x1={pad.left} y1={y} x2={pad.left + cW} y2={y} stroke={C.grid} strokeWidth="0.5" />
            <text
              x={pad.left - 6}
              y={y + 4}
              fill={C.labelDim}
              fontSize="9"
              textAnchor="end"
              fontFamily="Arial, sans-serif"
            >
              {shortFmt(tick)}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((item, i) => {
        const barH = Math.max((item.value / maxVal) * cH, item.value > 0 ? 2 : 0);
        const x = pad.left + i * slotW + (slotW - barW) / 2;
        const y = pad.top + cH - barH;
        const c = item.color ?? defaultColor;

        const maxChars = Math.max(Math.floor(slotW / 5.8), 3);
        const catLabel =
          item.label.length > maxChars
            ? item.label.slice(0, maxChars - 1) + "…"
            : item.label;

        return (
          <g key={`vbar-${i}`}>
            <rect x={x} y={y} width={barW} height={barH} fill={c} rx="2" opacity="0.9" />
            {showValLabels && item.value > 0 && (
              <text
                x={x + barW / 2}
                y={Math.max(y - 4, pad.top + 10)}
                fill={C.value}
                fontSize="9"
                textAnchor="middle"
                fontFamily="Arial, sans-serif"
              >
                {fmt(item.value)}
              </text>
            )}
            <text
              x={x + barW / 2}
              y={pad.top + cH + 14}
              fill={C.label}
              fontSize="9"
              textAnchor="end"
              transform={`rotate(-38,${x + barW / 2},${pad.top + cH + 14})`}
              fontFamily="Arial, sans-serif"
            >
              {catLabel}
            </text>
          </g>
        );
      })}

      {/* Axes */}
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + cH} stroke={C.axis} strokeWidth="1" />
      <line x1={pad.left} y1={pad.top + cH} x2={pad.left + cW} y2={pad.top + cH} stroke={C.axis} strokeWidth="1" />
    </svg>
  );
}

// ─── Horizontal Bar Chart ──────────────────────────────────────────────────

interface HorizontalBarChartProps {
  data: BarItem[];
  defaultColor?: string;
  valueFormatter?: (v: number) => string;
  title?: string;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}

export function HorizontalBarChart({
  data,
  defaultColor = "#6366f1",
  valueFormatter,
  title,
  svgRef,
}: HorizontalBarChartProps) {
  if (!data.length) return null;

  const ROW_H = 30;
  const W = 560;
  const padTop = title ? 34 : 14;
  const padBot = 22;
  const padLeft = 130;
  const padRight = 16;
  const H = padTop + data.length * ROW_H + padBot;
  const cW = W - padLeft - padRight;

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const fmt = valueFormatter ?? ((v: number) => v.toLocaleString("es-MX"));

  const nTicks = 4;
  const xTicks = Array.from({ length: nTicks + 1 }, (_, i) => (maxVal / nTicks) * i);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={W} height={H} fill={C.bg} rx="8" />

      {title && (
        <text x={padLeft} y={20} fill={C.label} fontSize="11" fontFamily="Arial, sans-serif">
          {title}
        </text>
      )}

      {/* X grid + bottom tick labels */}
      {xTicks.map((tick) => {
        const x = padLeft + (tick / maxVal) * cW;
        return (
          <g key={tick}>
            <line
              x1={x}
              y1={padTop}
              x2={x}
              y2={padTop + data.length * ROW_H}
              stroke={C.grid}
              strokeWidth="0.5"
            />
            <text
              x={x}
              y={H - 5}
              fill={C.labelDim}
              fontSize="8"
              textAnchor="middle"
              fontFamily="Arial, sans-serif"
            >
              {shortFmt(tick)}
            </text>
          </g>
        );
      })}

      {/* Rows + bars */}
      {data.map((item, i) => {
        const bW = Math.max((item.value / maxVal) * cW, item.value > 0 ? 2 : 0);
        const rowY = padTop + i * ROW_H;
        const barY = rowY + (ROW_H - 16) / 2;
        const c = item.color ?? defaultColor;

        const maxChars = Math.floor((padLeft - 10) / 6);
        const label =
          item.label.length > maxChars
            ? item.label.slice(0, maxChars - 1) + "…"
            : item.label;

        return (
          <g key={`hbar-${i}`}>
            {i % 2 === 1 && (
              <rect x={0} y={rowY} width={W} height={ROW_H} fill={C.rowAlt} opacity="0.35" />
            )}
            <text
              x={padLeft - 8}
              y={barY + 12}
              fill={C.label}
              fontSize="9"
              textAnchor="end"
              fontFamily="Arial, sans-serif"
            >
              {label}
            </text>
            <rect x={padLeft} y={barY} width={bW} height={16} fill={c} rx="2" opacity="0.9" />
            {item.value > 0 && (
              <text
                x={padLeft + bW + 5}
                y={barY + 12}
                fill={C.value}
                fontSize="9"
                fontFamily="Arial, sans-serif"
              >
                {fmt(item.value)}
              </text>
            )}
          </g>
        );
      })}

      {/* Y axis line */}
      <line
        x1={padLeft}
        y1={padTop}
        x2={padLeft}
        y2={padTop + data.length * ROW_H}
        stroke={C.axis}
        strokeWidth="1"
      />
    </svg>
  );
}

// ─── Stacked Bar Chart ─────────────────────────────────────────────────────

interface StackedBarChartProps {
  data: StackedBarItem[];
  title?: string;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}

export function StackedBarChart({ data, title, svgRef }: StackedBarChartProps) {
  if (!data.length) return null;

  const W = 600;
  const H = 220;
  const pad = { top: title ? 34 : 22, right: 20, bottom: 52, left: 44 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  const maxTotal = Math.max(
    ...data.map((d) => d.values.reduce((s, v) => s + v.value, 0)),
    1
  );
  const nTicks = 4;
  const yTicks = Array.from({ length: nTicks + 1 }, (_, i) =>
    Math.round((maxTotal / nTicks) * i)
  );

  const slotW = cW / data.length;
  const barW = Math.max(Math.min(slotW * 0.78, 40), 3);
  const showDateLabels = data.length <= 18;

  // Legend from first item
  const legend = data[0]?.values ?? [];

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={W} height={H} fill={C.bg} rx="8" />

      {title && (
        <text x={pad.left} y={20} fill={C.label} fontSize="11" fontFamily="Arial, sans-serif">
          {title}
        </text>
      )}

      {/* Y grid + tick labels */}
      {yTicks.map((tick) => {
        const y = pad.top + cH - (tick / maxTotal) * cH;
        return (
          <g key={tick}>
            <line x1={pad.left} y1={y} x2={pad.left + cW} y2={y} stroke={C.grid} strokeWidth="0.5" />
            <text
              x={pad.left - 4}
              y={y + 4}
              fill={C.labelDim}
              fontSize="9"
              textAnchor="end"
              fontFamily="Arial, sans-serif"
            >
              {shortFmt(tick)}
            </text>
          </g>
        );
      })}

      {/* Stacked bars — first value renders at BOTTOM */}
      {data.map((item, i) => {
        const x = pad.left + i * slotW + (slotW - barW) / 2;
        let stackY = pad.top + cH;

        const segments = item.values.map((seg) => {
          const segH = Math.max((seg.value / maxTotal) * cH, seg.value > 0 ? 1 : 0);
          const segY = stackY - segH;
          stackY = segY;
          return { seg, segH, segY };
        });

        return (
          <g key={`sbar-${i}`}>
            {segments.map(({ seg, segH, segY }) => (
              <rect
                key={seg.name}
                x={x}
                y={segY}
                width={barW}
                height={segH}
                fill={seg.color}
                opacity="0.9"
              />
            ))}
            {showDateLabels && (
              <text
                x={x + barW / 2}
                y={pad.top + cH + 14}
                fill={C.label}
                fontSize="8"
                textAnchor="end"
                transform={`rotate(-40,${x + barW / 2},${pad.top + cH + 14})`}
                fontFamily="Arial, sans-serif"
              >
                {item.label.slice(5)}
              </text>
            )}
          </g>
        );
      })}

      {/* Axes */}
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + cH} stroke={C.axis} strokeWidth="1" />
      <line x1={pad.left} y1={pad.top + cH} x2={pad.left + cW} y2={pad.top + cH} stroke={C.axis} strokeWidth="1" />

      {/* Legend */}
      {legend.map((item, i) => (
        <g key={item.name} transform={`translate(${pad.left + i * 110}, ${H - 12})`}>
          <rect x={0} y={-8} width={8} height={8} fill={item.color} rx="1" />
          <text x={12} y={0} fill={C.label} fontSize="9" fontFamily="Arial, sans-serif">
            {item.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
