// ─────────────────────────────────────────────────────────────────
// commerce/reports — export-report-pdf.ts
//
// Client-side PDF export using jsPDF 4.x + jspdf-autotable 5.x.
// Tables with many columns use landscape A4 automatically.
// ─────────────────────────────────────────────────────────────────

import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import type {
  SalesLineReportRow,
  PurchasesLineReportRow,
  ProductSummaryRow,
  CustomerSummaryRow,
  SupplierSummaryRow,
  TabularFilters,
} from "../types/commerce-report.types";

// ── helpers ───────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

function filterDescription(f: TabularFilters): string {
  const parts: string[] = [];
  if (f.customer_id)  parts.push(`Cliente: ${f.customer_id}`);
  if (f.supplier_id)  parts.push(`Proveedor: ${f.supplier_id}`);
  if (f.product_id)   parts.push(`Producto: ${f.product_id}`);
  if (f.product_type) parts.push(`Tipo: ${f.product_type === "SERVICE" ? "Servicio" : "Producto"}`);
  if (f.limit)        parts.push(`Límite: ${f.limit}`);
  return parts.length > 0 ? parts.join(" | ") : "Sin filtros adicionales";
}

function c(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("es-SV", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
}

function n(v: number, dec = 0): string {
  return v % 1 === 0
    ? v.toFixed(0)
    : v.toFixed(dec);
}

type Orientation = "p" | "l";

function createDoc(orientation: Orientation): jsPDF {
  return new jsPDF({ orientation, unit: "mm", format: "a4" });
}

// Renders title block at top; returns Y position after the block
function renderHeader(doc: jsPDF, title: string, filters: TabularFilters): number {
  const marginX   = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y           = 14;

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(title, marginX, y);
  y += 6;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Período: ${filters.date_from} — ${filters.date_to}`, marginX, y);
  y += 5;
  doc.text(`Filtros: ${filterDescription(filters)}`, marginX, y);
  y += 5;
  doc.text(`Generado: ${todayStr()}`, marginX, y);
  doc.setTextColor(0);

  // horizontal rule
  y += 3;
  doc.setDrawColor(180);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 4;

  return y;
}

const TABLE_STYLES = {
  headStyles:     { fillColor: [39, 39, 42] as [number, number, number], textColor: [161, 161, 170] as [number, number, number], fontSize: 7, fontStyle: "bold" as const },
  bodyStyles:     { fontSize: 7, textColor: [228, 228, 231] as [number, number, number] },
  alternateRowStyles: { fillColor: [24, 24, 27] as [number, number, number] },
  footStyles:     { fillColor: [63, 63, 70] as [number, number, number], textColor: [228, 228, 231] as [number, number, number], fontSize: 7, fontStyle: "bold" as const },
  styles:         { overflow: "linebreak" as const, cellPadding: 1.5 },
  margin:         { left: 14, right: 14 },
};

// ── Sales lines ───────────────────────────────────────────────────

export function exportSalesPdf(rows: SalesLineReportRow[], filters: TabularFilters): void {
  const hasCost = rows.some((r) => r.cost_estimate !== null);
  const doc     = createDoc("l");
  const startY  = renderHeader(doc, "Ventas Detalle", filters);

  const totQty      = rows.reduce((s, r) => s + r.quantity, 0);
  const totSubtotal = rows.reduce((s, r) => s + r.line_subtotal, 0);
  const totTax      = rows.reduce((s, r) => s + r.tax_amount, 0);
  const totTotal    = rows.reduce((s, r) => s + r.line_total, 0);
  const totCost     = rows.reduce((s, r) => s + (r.cost_estimate ?? 0), 0);
  const totMargin   = rows.reduce((s, r) => s + (r.margin_estimate ?? 0), 0);

  const head = [[
    "Fecha", "N° Venta", "Cliente", "Tipo", "Código",
    "Producto / Servicio", "Categoría", "Línea",
    "Cant.", "P. Unit.", "Subtotal", "IVA", "Total",
    ...(hasCost ? ["Costo est.", "Margen est."] : []),
  ]];

  const body = rows.map((r) => [
    r.sale_date, r.sale_code,
    r.customer_name ?? "—",
    r.product_type === "SERVICE" ? "Serv." : "Prod.",
    r.product_code, r.product_name,
    r.category_name ?? "—", r.line_name ?? "—",
    n(r.quantity), c(r.unit_price), c(r.line_subtotal), c(r.tax_amount), c(r.line_total),
    ...(hasCost ? [c(r.cost_estimate), c(r.margin_estimate)] : []),
  ]);

  const foot = [[
    "TOTAL", "", "", "", "", "", "", "",
    n(totQty), "", c(totSubtotal), c(totTax), c(totTotal),
    ...(hasCost ? [c(totCost), c(totMargin)] : []),
  ]];

  autoTable(doc, {
    head, body, foot,
    startY,
    ...TABLE_STYLES,
    columnStyles: {
      8:  { halign: "right" },
      9:  { halign: "right" },
      10: { halign: "right" },
      11: { halign: "right" },
      12: { halign: "right" },
      ...(hasCost ? { 13: { halign: "right" }, 14: { halign: "right" } } : {}),
    },
  });

  doc.save(`commerce-reporte-ventas-${todayStr()}.pdf`);
}

// ── Purchase lines ────────────────────────────────────────────────

export function exportPurchasesPdf(rows: PurchasesLineReportRow[], filters: TabularFilters): void {
  const doc    = createDoc("l");
  const startY = renderHeader(doc, "Compras Detalle", filters);

  const totQty      = rows.reduce((s, r) => s + r.quantity, 0);
  const totSubtotal = rows.reduce((s, r) => s + r.line_subtotal, 0);
  const totTax      = rows.reduce((s, r) => s + r.tax_amount, 0);
  const totTotal    = rows.reduce((s, r) => s + r.line_total, 0);

  const head = [["Fecha", "N° Compra", "Proveedor", "Código", "Producto", "Categoría", "Línea", "Cant.", "C. Unit.", "Subtotal", "IVA", "Total"]];

  const body = rows.map((r) => [
    r.purchase_date, r.purchase_code, r.supplier_name,
    r.product_code, r.product_name,
    r.category_name ?? "—", r.line_name ?? "—",
    n(r.quantity), c(r.unit_cost), c(r.line_subtotal), c(r.tax_amount), c(r.line_total),
  ]);

  const foot = [["TOTAL", "", "", "", "", "", "", n(totQty), "", c(totSubtotal), c(totTax), c(totTotal)]];

  autoTable(doc, {
    head, body, foot,
    startY,
    ...TABLE_STYLES,
    columnStyles: {
      7:  { halign: "right" },
      8:  { halign: "right" },
      9:  { halign: "right" },
      10: { halign: "right" },
      11: { halign: "right" },
    },
  });

  doc.save(`commerce-reporte-compras-${todayStr()}.pdf`);
}

// ── Product summary ───────────────────────────────────────────────

export function exportProductsPdf(rows: ProductSummaryRow[], filters: TabularFilters): void {
  const hasCost   = rows.some((r) => r.cost_avg !== null);
  const hasMargin = rows.some((r) => r.margin_estimate !== null);
  const doc       = createDoc("l");
  const startY    = renderHeader(doc, "Productos", filters);

  const totSold   = rows.reduce((s, r) => s + r.amount_sold, 0);
  const totPurch  = rows.reduce((s, r) => s + r.amount_purchased, 0);
  const totMargin = rows.reduce((s, r) => s + (r.margin_estimate ?? 0), 0);

  const head = [[
    "Código", "Producto", "Tipo", "Categoría", "Línea",
    "Cant. vend.", "Monto vend.", "Cant. comp.", "Monto comp.",
    ...(hasCost   ? ["Costo prom."] : []),
    ...(hasMargin ? ["Margen est."] : []),
    "Últ. venta", "Últ. compra",
  ]];

  const body = rows.map((r) => [
    r.product_code, r.product_name,
    r.product_type === "SERVICE" ? "Serv." : "Prod.",
    r.category_name ?? "—", r.line_name ?? "—",
    n(r.qty_sold), c(r.amount_sold),
    n(r.qty_purchased), c(r.amount_purchased),
    ...(hasCost   ? [c(r.cost_avg)] : []),
    ...(hasMargin ? [c(r.margin_estimate)] : []),
    r.last_sale_date ?? "—", r.last_purchase_date ?? "—",
  ]);

  let colOffset = 9;
  const foot: string[][] = [[
    "TOTAL", "", "", "", "",
    "", c(totSold), "", c(totPurch),
    ...(hasCost   ? [""] : []),
    ...(hasMargin ? [c(totMargin)] : []),
    "", "",
  ]];

  const colStyles: Record<number, { halign: "right" }> = {};
  [5, 6, 7, 8].forEach((i) => { colStyles[i] = { halign: "right" }; });
  if (hasCost)   { colStyles[colOffset] = { halign: "right" }; colOffset++; }
  if (hasMargin) { colStyles[colOffset] = { halign: "right" }; }

  autoTable(doc, { head, body, foot, startY, ...TABLE_STYLES, columnStyles: colStyles });

  doc.save(`commerce-reporte-productos-${todayStr()}.pdf`);
}

// ── Customer summary ──────────────────────────────────────────────

export function exportCustomersPdf(rows: CustomerSummaryRow[], filters: TabularFilters): void {
  const doc    = createDoc("p");
  const startY = renderHeader(doc, "Clientes", filters);

  const totAmount = rows.reduce((s, r) => s + r.total_amount, 0);
  const totCount  = rows.reduce((s, r) => s + r.sale_count, 0);

  const head = [["Cliente", "N° ventas", "Total vendido", "Ticket prom.", "Última venta", "Prod./Serv. más comprado"]];

  const body = rows.map((r) => [
    r.customer_name,
    r.sale_count,
    c(r.total_amount),
    c(r.avg_ticket),
    r.last_sale_date ?? "—",
    r.top_product_name ?? "—",
  ]);

  const foot = [[
    "TOTAL", totCount, c(totAmount),
    totCount > 0 ? c(totAmount / totCount) : "—",
    "", "",
  ]];

  autoTable(doc, {
    head, body, foot,
    startY,
    ...TABLE_STYLES,
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });

  doc.save(`commerce-reporte-clientes-${todayStr()}.pdf`);
}

// ── Supplier summary ──────────────────────────────────────────────

export function exportSuppliersPdf(rows: SupplierSummaryRow[], filters: TabularFilters): void {
  const doc    = createDoc("p");
  const startY = renderHeader(doc, "Proveedores", filters);

  const totAmount = rows.reduce((s, r) => s + r.total_amount, 0);
  const totCount  = rows.reduce((s, r) => s + r.purchase_count, 0);

  const head = [["Proveedor", "N° compras", "Total comprado", "Producto más comprado", "Última compra"]];

  const body = rows.map((r) => [
    r.supplier_name,
    r.purchase_count,
    c(r.total_amount),
    r.top_product_name ?? "—",
    r.last_purchase_date ?? "—",
  ]);

  const foot = [["TOTAL", totCount, c(totAmount), "", ""]];

  autoTable(doc, {
    head, body, foot,
    startY,
    ...TABLE_STYLES,
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
    },
  });

  doc.save(`commerce-reporte-proveedores-${todayStr()}.pdf`);
}
