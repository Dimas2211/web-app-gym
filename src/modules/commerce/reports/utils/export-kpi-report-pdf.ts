// ─────────────────────────────────────────────────────────────────
// commerce/reports — export-kpi-report-pdf.ts
//
// PDF ejecutivo de KPIs y gráficas del dashboard commerce.
// Construido desde datos (no captura de pantalla).
// Fondo blanco, texto oscuro, apto para impresión.
//
// La paleta de colores es seleccionada externamente y pasada como
// parámetro para garantizar consistencia en todo el documento.
// ─────────────────────────────────────────────────────────────────

import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { CommerceDashboardData } from "../types/commerce-report.types";
import type { KpiReportPalette } from "./kpi-report-palettes";
import { resolvePalette, getDefaultKpiReportPalette, type ResolvedPalette } from "./kpi-report-palettes";

// ── Formatters ────────────────────────────────────────────────────

function c(v: number): string {
  return new Intl.NumberFormat("en-US", {
    style:                 "currency",
    currency:              "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

function shortDate(d: string): string {
  return d.length >= 7 ? d.slice(5) : d;
}

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ── Fixed structural colors (non-palette) ────────────────────────
// Only typography, backgrounds, borders and the "red = negative"
// semantic color live here. Chart/accent colors come from the palette.

const CLR = {
  title:     [20,  20,  25]  as [number, number, number],
  body:      [55,  55,  60]  as [number, number, number],
  dim:       [120, 120, 130] as [number, number, number],
  border:    [210, 210, 215] as [number, number, number],
  cardBg:    [248, 248, 250] as [number, number, number],
  grid:      [228, 228, 232] as [number, number, number],
  sectionBg: [235, 240, 255] as [number, number, number],
  white:     [255, 255, 255] as [number, number, number],
  // Red is kept as a fixed semantic color (negative margin = always red)
  red:       [220, 38,  38]  as [number, number, number],
};

// ── Font helper ───────────────────────────────────────────────────

function setf(
  doc: jsPDF,
  style: "bold" | "normal",
  size: number,
  color: [number, number, number],
): void {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

// ── Page break helper ─────────────────────────────────────────────

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - 14) {
    doc.addPage();
    return 14;
  }
  return y;
}

// ── Page numbers ──────────────────────────────────────────────────

function addPageNumbers(doc: jsPDF): void {
  const pageW     = doc.internal.pageSize.getWidth();
  const pageH     = doc.internal.pageSize.getHeight();
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    setf(doc, "normal", 7, CLR.dim);
    doc.text(
      `Reporte Ejecutivo Commerce  ·  Página ${i}/${pageCount}`,
      pageW / 2,
      pageH - 6,
      { align: "center" },
    );
  }
}

// ── Section header bar ────────────────────────────────────────────

function drawSectionTitle(
  doc: jsPDF,
  title: string,
  marginX: number,
  pageW: number,
  y: number,
): number {
  doc.setFillColor(...CLR.sectionBg);
  doc.rect(marginX, y, pageW - marginX * 2, 7, "F");
  setf(doc, "bold", 8, CLR.title);
  doc.text(title.toUpperCase(), marginX + 3, y + 5);
  return y + 10;
}

// ── Header ────────────────────────────────────────────────────────

function drawHeader(
  doc: jsPDF,
  pageW: number,
  marginX: number,
  y: number,
  filters: { date_from: string; date_to: string },
  paletteName: string,
): number {
  setf(doc, "bold", 17, CLR.title);
  doc.text("Reporte Ejecutivo Commerce", marginX, y);

  setf(doc, "normal", 7, CLR.dim);
  doc.text(`Generado: ${todayStr()}`, pageW - marginX, y, { align: "right" });

  y += 7;
  setf(doc, "normal", 9, CLR.body);
  doc.text(`Período: ${filters.date_from} — ${filters.date_to}`, marginX, y);

  setf(doc, "normal", 7, CLR.dim);
  doc.text(`Paleta: ${paletteName}`, pageW - marginX, y, { align: "right" });

  y += 4;
  doc.setDrawColor(...CLR.border);
  doc.setLineWidth(0.3);
  doc.line(marginX, y, pageW - marginX, y);

  return y + 5;
}

// ── KPI cards (2 rows × 4 cols) ───────────────────────────────────

function drawKpiCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  sub: string | null,
  accent: [number, number, number] | null,
): void {
  doc.setFillColor(...CLR.cardBg);
  doc.setDrawColor(...CLR.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, "FD");

  if (accent) {
    doc.setFillColor(...accent);
    doc.rect(x, y + 0.6, 1.8, h - 1.2, "F");
  }

  const px = accent ? x + 4.5 : x + 3;

  setf(doc, "normal", 6.5, CLR.dim);
  doc.text(label, px, y + 5);

  setf(doc, "bold", 9.5, CLR.title);
  doc.text(trunc(value, 22), px, y + 11);

  if (sub) {
    setf(doc, "normal", 6, CLR.dim);
    doc.text(trunc(sub, 30), px, y + 16.5);
  }
}

function drawKpiSection(
  doc: jsPDF,
  summary: CommerceDashboardData["summary"],
  pageW: number,
  marginX: number,
  y: number,
  rp: ResolvedPalette,
): number {
  y = drawSectionTitle(doc, "Indicadores clave", marginX, pageW, y);

  const availW = pageW - marginX * 2;
  const cols   = 4;
  const gapH   = 3;
  const gapV   = 3;
  const cardW  = (availW - gapH * (cols - 1)) / cols;
  const cardH  = 21;

  const marginPct =
    summary.total_sales > 0
      ? `${((summary.estimated_margin / summary.total_sales) * 100).toFixed(1)}% del total vendido`
      : null;

  const marginAccent = summary.estimated_margin >= 0 ? rp.primary : CLR.red;

  const cards: { label: string; value: string; sub: string | null; accent: [number, number, number] | null }[] = [
    { label: "Total vendido",        value: c(summary.total_sales),         sub: `${summary.sales_count} ventas confirmadas`,     accent: rp.primary    },
    { label: "Total comprado",       value: c(summary.total_purchases),      sub: `${summary.purchases_count} compras confirmadas`, accent: rp.secondary  },
    { label: "Margen estimado",      value: c(summary.estimated_margin),     sub: marginPct,                                        accent: marginAccent  },
    { label: "Ticket promedio",      value: c(summary.avg_ticket),           sub: "por venta confirmada",                           accent: null          },
    { label: "Ventas confirmadas",   value: String(summary.sales_count),     sub: null,                                             accent: null          },
    { label: "Compras confirmadas",  value: String(summary.purchases_count), sub: null,                                             accent: null          },
    { label: "Producto más vendido", value: summary.top_product_name ?? "Sin datos", sub: "por monto total",                        accent: null          },
    { label: "Servicio más vendido", value: summary.top_service_name ?? "Sin datos", sub: "por monto total",                        accent: null          },
  ];

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < cols; col++) {
      const card = cards[row * cols + col];
      if (!card) continue;
      const cx = marginX + col * (cardW + gapH);
      const cy = y + row * (cardH + gapV);
      drawKpiCard(doc, cx, cy, cardW, cardH, card.label, card.value, card.sub, card.accent);
    }
  }

  return y + 2 * (cardH + gapV) + 5;
}

// ── Vertical bar chart (period data) ─────────────────────────────

function drawVerticalBars(
  doc: jsPDF,
  items: { label: string; value: number }[],
  color: [number, number, number],
  pageW: number,
  marginX: number,
  y: number,
  chartH = 42,
): number {
  if (!items.length) return y;

  const chartW  = pageW - marginX * 2;
  const yAxisW  = 12;
  const axisL   = marginX + yAxisW;
  const innerW  = chartW - yAxisW;
  const axisB   = y + chartH;
  const maxVal  = Math.max(...items.map((i) => i.value), 1);
  const nTicks  = 4;

  // Grid + Y labels
  doc.setLineWidth(0.15);
  for (let t = 0; t <= nTicks; t++) {
    const tv  = (maxVal / nTicks) * t;
    const ty  = axisB - (tv / maxVal) * chartH;
    doc.setDrawColor(...CLR.grid);
    doc.line(axisL, ty, axisL + innerW, ty);
    const lbl = tv >= 1_000_000
      ? `$${(tv / 1_000_000).toFixed(1)}M`
      : tv >= 1_000
      ? `$${(tv / 1_000).toFixed(0)}K`
      : tv > 0
      ? `$${tv.toFixed(0)}`
      : "0";
    setf(doc, "normal", 5, CLR.dim);
    doc.text(lbl, axisL - 1, ty + 1.5, { align: "right" });
  }

  // Bars
  const slotW = innerW / items.length;
  const barW  = Math.max(Math.min(slotW * 0.68, 9), 0.8);
  const every = Math.ceil(items.length / 22);

  items.forEach((item, i) => {
    const barH = Math.max((item.value / maxVal) * chartH, item.value > 0 ? 0.5 : 0);
    const bx   = axisL + i * slotW + (slotW - barW) / 2;
    const by   = axisB - barH;
    doc.setFillColor(...color);
    doc.rect(bx, by, barW, barH, "F");

    if (i % every === 0) {
      setf(doc, "normal", 4.5, CLR.dim);
      doc.text(item.label, bx + barW / 2, axisB + 4, { align: "center" });
    }
  });

  // Axes
  doc.setDrawColor(...CLR.border);
  doc.setLineWidth(0.3);
  doc.line(axisL, y, axisL, axisB);
  doc.line(axisL, axisB, axisL + innerW, axisB);

  return axisB + 8;
}

// ── Horizontal bar chart (top items ranking) ──────────────────────

function drawHorizontalBars(
  doc: jsPDF,
  items: { label: string; value: number; formatted: string }[],
  color: [number, number, number],
  pageW: number,
  marginX: number,
  y: number,
): number {
  if (!items.length) return y;

  const chartW   = pageW - marginX * 2;
  const labelW   = 58;
  const valueW   = 24;
  const barAreaW = chartW - labelW - valueW;
  const rowH     = 6.5;
  const maxVal   = Math.max(...items.map((i) => i.value), 1);

  items.forEach((item, i) => {
    const rowY = y + i * rowH;
    const bW   = Math.max((item.value / maxVal) * barAreaW, item.value > 0 ? 0.5 : 0);
    const barX = marginX + labelW;

    if (i % 2 === 1) {
      doc.setFillColor(245, 245, 248);
      doc.rect(marginX, rowY, chartW, rowH, "F");
    }

    setf(doc, "normal", 6, CLR.body);
    doc.text(trunc(item.label, 26), marginX + labelW - 2, rowY + rowH - 1.8, { align: "right" });

    doc.setFillColor(...color);
    doc.rect(barX, rowY + 1.2, bW, rowH - 2.4, "F");

    setf(doc, "normal", 6, CLR.dim);
    doc.text(item.formatted, barX + barAreaW + 2, rowY + rowH - 1.8);
  });

  return y + items.length * rowH + 5;
}

// ── Product vs Service stacked bar ────────────────────────────────
// Uses primary (products) and secondary (services) from the palette
// so the two segments are always highly contrasting.
// A thin white gap separates segments for extra legibility.

function drawProductVsService(
  doc: jsPDF,
  productsTotal: number,
  servicesTotal: number,
  colorA: [number, number, number],   // products  — palette.primary
  colorB: [number, number, number],   // services  — palette.secondary
  pageW: number,
  marginX: number,
  y: number,
): number {
  const total = productsTotal + servicesTotal;
  if (total === 0) return y;

  const chartW  = pageW - marginX * 2;
  const barH    = 10;
  const gap     = 0.8; // white separator between segments
  const prodPct = productsTotal / total;
  const servPct = servicesTotal / total;

  const prodW = chartW * prodPct;
  const servW = chartW * servPct;

  // Products segment
  doc.setFillColor(...colorA);
  doc.rect(marginX, y, Math.max(prodW - gap / 2, 0), barH, "F");

  // Services segment
  doc.setFillColor(...colorB);
  doc.rect(marginX + prodW + gap / 2, y, Math.max(servW - gap / 2, 0), barH, "F");

  // White gap line
  doc.setFillColor(...CLR.white);
  doc.rect(marginX + prodW - gap / 2, y, gap, barH, "F");

  y += barH + 4;

  // Legend row
  doc.setFillColor(...colorA);
  doc.rect(marginX, y, 5, 4, "F");
  setf(doc, "normal", 7, CLR.body);
  doc.text(
    `Productos: ${c(productsTotal)}  (${(prodPct * 100).toFixed(1)}%)`,
    marginX + 7, y + 3.5,
  );

  doc.setFillColor(...colorB);
  doc.rect(marginX + 85, y, 5, 4, "F");
  doc.text(
    `Servicios: ${c(servicesTotal)}  (${(servPct * 100).toFixed(1)}%)`,
    marginX + 92, y + 3.5,
  );

  return y + 9;
}

// ── Main export ───────────────────────────────────────────────────

export function exportExecutiveKpiPdf(
  data: CommerceDashboardData,
  filters: { date_from: string; date_to: string },
  palette?: KpiReportPalette,
): void {
  // Palette is resolved once per export call — consistent throughout the document.
  const activePalette = palette ?? getDefaultKpiReportPalette();
  const rp            = resolvePalette(activePalette);

  const doc     = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageW   = doc.internal.pageSize.getWidth();
  const marginX = 14;
  let y         = 14;

  // ── Header ──────────────────────────────────────────────────────
  y = drawHeader(doc, pageW, marginX, y, filters, activePalette.name);

  // ── KPI cards ───────────────────────────────────────────────────
  y = ensureSpace(doc, y, 55);
  y = drawKpiSection(doc, data.summary, pageW, marginX, y, rp);

  // ── Ventas por día ───────────────────────────────────────────────
  if (data.sales_by_period.length > 0) {
    y = ensureSpace(doc, y, 62);
    y = drawSectionTitle(doc, "Ventas por día", marginX, pageW, y);
    y = drawVerticalBars(
      doc,
      data.sales_by_period.map((d) => ({ label: shortDate(d.date), value: d.total })),
      rp.primary,
      pageW, marginX, y, 45,
    );
  }

  // ── Compras por día ──────────────────────────────────────────────
  if (data.purchases_by_period.length > 0) {
    y = ensureSpace(doc, y, 62);
    y = drawSectionTitle(doc, "Compras por día", marginX, pageW, y);
    y = drawVerticalBars(
      doc,
      data.purchases_by_period.map((d) => ({ label: shortDate(d.date), value: d.total })),
      rp.secondary,
      pageW, marginX, y, 45,
    );
  }

  // ── Top productos ────────────────────────────────────────────────
  const topProd = data.top_products_by_amount.slice(0, 10);
  if (topProd.length > 0) {
    y = ensureSpace(doc, y, topProd.length * 6.5 + 22);
    y = drawSectionTitle(doc, "Top productos vendidos (por monto)", marginX, pageW, y);
    y = drawHorizontalBars(
      doc,
      topProd.map((d) => ({ label: d.name, value: d.total, formatted: c(d.total) })),
      rp.primary,
      pageW, marginX, y,
    );
  }

  // ── Top servicios ────────────────────────────────────────────────
  const topServ = data.top_services_by_amount.slice(0, 10);
  if (topServ.length > 0) {
    y = ensureSpace(doc, y, topServ.length * 6.5 + 22);
    y = drawSectionTitle(doc, "Top servicios vendidos (por monto)", marginX, pageW, y);
    y = drawHorizontalBars(
      doc,
      topServ.map((d) => ({ label: d.name, value: d.total, formatted: c(d.total) })),
      rp.tertiary,
      pageW, marginX, y,
    );
  }

  // ── Productos vs Servicios ───────────────────────────────────────
  const pvs = data.product_vs_service;
  if (pvs.products_total > 0 || pvs.services_total > 0) {
    y = ensureSpace(doc, y, 32);
    y = drawSectionTitle(doc, "Productos vs Servicios", marginX, pageW, y);
    y = drawProductVsService(
      doc,
      pvs.products_total,
      pvs.services_total,
      rp.primary,    // productos  — contrasta fuerte vs secondary
      rp.secondary,  // servicios
      pageW, marginX, y,
    );
  }

  // ── Distribución de servicios ────────────────────────────────────
  const servDist = data.service_distribution.slice(0, 10);
  if (servDist.length > 0) {
    y = ensureSpace(doc, y, servDist.length * 6.5 + 22);
    y = drawSectionTitle(doc, "Distribución de servicios vendidos", marginX, pageW, y);
    y = drawHorizontalBars(
      doc,
      servDist.map((d) => ({
        label:     d.name,
        value:     d.total,
        formatted: `${c(d.total)}  (${d.percentage.toFixed(1)}%)`,
      })),
      rp.tertiary,
      pageW, marginX, y,
    );
  }

  // ── Compras por proveedor ────────────────────────────────────────
  const topSuppliers = data.purchases_by_supplier.slice(0, 10);
  if (topSuppliers.length > 0) {
    y = ensureSpace(doc, y, topSuppliers.length * 6.5 + 22);
    y = drawSectionTitle(doc, "Compras por proveedor (top 10)", marginX, pageW, y);
    y = drawHorizontalBars(
      doc,
      topSuppliers.map((d) => ({
        label:     d.supplier_name,
        value:     d.total,
        formatted: `${c(d.total)}  (${d.count} comp.)`,
      })),
      rp.quaternary,
      pageW, marginX, y,
    );
  }

  // ── Resumen diario: top 10 días por venta ────────────────────────
  const topDays = data.sales_by_period
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  if (topDays.length > 0) {
    y = ensureSpace(doc, y, 55);
    y = drawSectionTitle(doc, "Top 10 días por venta", marginX, pageW, y);

    const purchMap = Object.fromEntries(
      data.purchases_by_period.map((p) => [p.date, p.total]),
    );

    autoTable(doc, {
      startY: y,
      head:   [["Fecha", "Total ventas", "Total compras", "Diferencia"]],
      body:   topDays.map((d) => {
        const purch = purchMap[d.date] ?? 0;
        return [d.date, c(d.total), c(purch), c(d.total - purch)];
      }),
      headStyles:         { fillColor: [30, 30, 35], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
      bodyStyles:         { fontSize: 7.5, textColor: [35, 35, 35] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      styles:             { overflow: "linebreak", cellPadding: 2 },
      margin:             { left: marginX, right: marginX },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
    });

    const docWithTable = doc as jsPDF & { lastAutoTable: { finalY: number } };
    y = docWithTable.lastAutoTable.finalY + 6;
  }

  addPageNumbers(doc);
  doc.save(`commerce-ejecutivo-${filters.date_from}-${filters.date_to}.pdf`);
}
