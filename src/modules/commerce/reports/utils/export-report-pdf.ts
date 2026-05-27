// ─────────────────────────────────────────────────────────────────
// commerce/reports — export-report-pdf.ts
//
// Client-side PDF export using jsPDF 4.x + jspdf-autotable 5.x.
//
// Reportes listado: una fila por documento (venta/compra).
// Reportes detalle: ítems agrupados por documento.
// ─────────────────────────────────────────────────────────────────

import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import type {
  SalesListRow,
  SalesLineReportRow,
  PurchasesListRow,
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
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
}

function n(v: number, dec = 0): string {
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(dec);
}

function paymentStatusLabel(status: string): string {
  switch (status) {
    case "PAID":    return "Pagado";
    case "PARTIAL": return "Parcial";
    case "UNPAID":  return "Pendiente";
    default:        return status;
  }
}

function sourceTypeLabel(source: string): string {
  switch (source) {
    case "DTE_IMPORT": return "DTE";
    case "MANUAL":     return "Manual";
    default:           return source;
  }
}

type Orientation = "p" | "l";

function createDoc(orientation: Orientation): jsPDF {
  return new jsPDF({ orientation, unit: "mm", format: "a4" });
}

function renderHeader(doc: jsPDF, title: string, filters: TabularFilters): number {
  const marginX   = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y           = 16;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 35);
  doc.text(title, marginX, y);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(`Generado: ${todayStr()}`, pageWidth - marginX, 16, { align: "right" });

  y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(70);
  doc.text(`Período: ${filters.date_from} — ${filters.date_to}`, marginX, y);
  y += 5;
  doc.text(`Filtros: ${filterDescription(filters)}`, marginX, y);
  doc.setTextColor(0);

  y += 4;
  doc.setDrawColor(200);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 5;

  return y;
}

const TABLE_STYLES = {
  headStyles:         { fillColor: [30, 30, 35] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontSize: 8, fontStyle: "bold" as const },
  bodyStyles:         { fontSize: 8, textColor: [35, 35, 35] as [number, number, number] },
  alternateRowStyles: { fillColor: [245, 245, 245] as [number, number, number] },
  footStyles:         { fillColor: [230, 230, 230] as [number, number, number], textColor: [30, 30, 35] as [number, number, number], fontSize: 8, fontStyle: "bold" as const },
  styles:             { overflow: "linebreak" as const, cellPadding: 2 },
  margin:             { left: 14, right: 14 },
  showFoot:           "lastPage" as const,
};

// Fills in "Página X/Y" at the bottom-right of every page.
// Must be called after autoTable, before doc.save().
function addPageNumbers(doc: jsPDF): void {
  const marginRight = 14;
  const pageCount   = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(140, 140, 140);
    doc.text(
      `Página ${i}/${pageCount}`,
      doc.internal.pageSize.getWidth() - marginRight,
      doc.internal.pageSize.getHeight() - 7,
      { align: "right" },
    );
  }
  doc.setTextColor(0);
}

// ── Ventas listado (1 fila por venta) ────────────────────────────

export function exportSalesListPdf(rows: SalesListRow[], filters: TabularFilters): void {
  const doc    = createDoc("l");
  const startY = renderHeader(doc, "Ventas Listado", filters);

  const totSubtotal = rows.reduce((s, r) => s + r.subtotal, 0);
  const totTax      = rows.reduce((s, r) => s + r.tax_amount, 0);
  const totTotal    = rows.reduce((s, r) => s + r.total_amount, 0);
  const totItems    = rows.reduce((s, r) => s + r.item_count, 0);

  const head = [["Fecha", "N° Venta", "Cliente", "Estado pago", "Ítems", "Subtotal", "IVA", "Total"]];

  const body = rows.map((r) => [
    r.sale_date,
    r.sale_code,
    r.customer_name ?? "—",
    paymentStatusLabel(r.payment_status),
    String(r.item_count),
    c(r.subtotal),
    c(r.tax_amount),
    c(r.total_amount),
  ]);

  const foot = [[
    `TOTAL — ${rows.length} ${rows.length === 1 ? "venta" : "ventas"}`,
    "", "", "",
    String(totItems),
    c(totSubtotal),
    c(totTax),
    c(totTotal),
  ]];

  autoTable(doc, {
    head, body, foot,
    startY,
    ...TABLE_STYLES,
    columnStyles: {
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
    },
    didParseCell: (data) => {
      if ([4, 5, 6, 7].includes(data.column.index)) {
        data.cell.styles.halign = "right";
      }
    },
  });

  addPageNumbers(doc);
  doc.save(`commerce-ventas-listado-${todayStr()}.pdf`);
}

// ── Ventas detalle (ítems agrupados por venta) ────────────────────

export function exportSalesPdf(rows: SalesLineReportRow[], filters: TabularFilters): void {
  const hasCost  = rows.some((r) => r.cost_estimate !== null);
  const colCount = 10 + (hasCost ? 2 : 0);

  const doc    = createDoc("l");
  const startY = renderHeader(doc, "Ventas Detalle", filters);

  const totQty      = rows.reduce((s, r) => s + r.quantity, 0);
  const totSubtotal = rows.reduce((s, r) => s + r.line_subtotal, 0);
  const totTax      = rows.reduce((s, r) => s + r.tax_amount, 0);
  const totTotal    = rows.reduce((s, r) => s + r.line_total, 0);
  const totCost     = rows.reduce((s, r) => s + (r.cost_estimate ?? 0), 0);
  const totMargin   = rows.reduce((s, r) => s + (r.margin_estimate ?? 0), 0);

  // Group consecutive rows by sale_code
  type Group = { saleCode: string; saleDate: string; customer: string | null; items: SalesLineReportRow[] };
  const groups: Group[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.saleCode === row.sale_code) {
      last.items.push(row);
    } else {
      groups.push({ saleCode: row.sale_code, saleDate: row.sale_date, customer: row.customer_name, items: [row] });
    }
  }

  // Build body with group header rows interleaved
  const body:         string[][] = [];
  const isGroupHeader: boolean[] = [];

  for (const group of groups) {
    const groupTotal = group.items.reduce((s, r) => s + r.line_total, 0);
    const hdr        = `${group.saleDate}   ${group.saleCode}   ${group.customer ?? "Sin cliente"}   Total: ${c(groupTotal)}`;
    body.push([hdr, ...Array(colCount - 1).fill("")]);
    isGroupHeader.push(true);

    for (const r of group.items) {
      body.push([
        r.product_type === "SERVICE" ? "Serv." : "Prod.",
        r.product_code,
        r.product_name,
        r.category_name ?? "—",
        r.line_name ?? "—",
        n(r.quantity),
        c(r.unit_price),
        c(r.line_subtotal),
        c(r.tax_amount),
        c(r.line_total),
        ...(hasCost ? [c(r.cost_estimate), c(r.margin_estimate)] : []),
      ]);
      isGroupHeader.push(false);
    }
  }

  const head = [[
    "Tipo", "Código", "Producto / Servicio", "Categoría", "Línea",
    "Cant.", "P. Unit.", "Subtotal", "IVA", "Total",
    ...(hasCost ? ["Costo est.", "Margen est."] : []),
  ]];

  const foot = [[
    `TOTAL — ${groups.length} ${groups.length === 1 ? "venta" : "ventas"}`,
    "", "", "", "",
    n(totQty), "",
    c(totSubtotal), c(totTax), c(totTotal),
    ...(hasCost ? [c(totCost), c(totMargin)] : []),
  ]];

  autoTable(doc, {
    head, body, foot,
    startY,
    ...TABLE_STYLES,
    // Suppress alternating row colors on group header rows
    didParseCell: (data) => {
      if (data.section === "body" && isGroupHeader[data.row.index]) {
        data.cell.styles.fillColor    = [45, 50, 60] as [number, number, number];
        data.cell.styles.textColor    = [200, 210, 230] as [number, number, number];
        data.cell.styles.fontStyle    = "bold";
        data.cell.styles.cellPadding  = 3;
      }
      const numericBase = [5, 6, 7, 8, 9];
      if (hasCost) numericBase.push(10, 11);
      if (numericBase.includes(data.column.index)) {
        data.cell.styles.halign = "right";
      }
    },
    columnStyles: {
      5:  { halign: "right" },
      6:  { halign: "right" },
      7:  { halign: "right" },
      8:  { halign: "right" },
      9:  { halign: "right" },
      ...(hasCost ? { 10: { halign: "right" }, 11: { halign: "right" } } : {}),
    },
  });

  addPageNumbers(doc);
  doc.save(`commerce-ventas-detalle-${todayStr()}.pdf`);
}

// ── Compras listado (1 fila por compra) ──────────────────────────

export function exportPurchasesListPdf(rows: PurchasesListRow[], filters: TabularFilters): void {
  const doc    = createDoc("l");
  const startY = renderHeader(doc, "Compras Listado", filters);

  const totSubtotal = rows.reduce((s, r) => s + r.subtotal, 0);
  const totTax      = rows.reduce((s, r) => s + r.tax_amount, 0);
  const totTotal    = rows.reduce((s, r) => s + r.total_amount, 0);
  const totItems    = rows.reduce((s, r) => s + r.item_count, 0);

  const head = [["Fecha", "N° Compra", "Proveedor", "Origen", "Ítems", "Subtotal", "IVA", "Total"]];

  const body = rows.map((r) => [
    r.purchase_date,
    r.purchase_code,
    r.supplier_name,
    sourceTypeLabel(r.source_type),
    String(r.item_count),
    c(r.subtotal),
    c(r.tax_amount),
    c(r.total_amount),
  ]);

  const foot = [[
    `TOTAL — ${rows.length} ${rows.length === 1 ? "compra" : "compras"}`,
    "", "", "",
    String(totItems),
    c(totSubtotal),
    c(totTax),
    c(totTotal),
  ]];

  autoTable(doc, {
    head, body, foot,
    startY,
    ...TABLE_STYLES,
    columnStyles: {
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
    },
    didParseCell: (data) => {
      if ([4, 5, 6, 7].includes(data.column.index)) {
        data.cell.styles.halign = "right";
      }
    },
  });

  addPageNumbers(doc);
  doc.save(`commerce-compras-listado-${todayStr()}.pdf`);
}

// ── Compras detalle (ítems agrupados por compra) ──────────────────

export function exportPurchasesPdf(rows: PurchasesLineReportRow[], filters: TabularFilters): void {
  const colCount = 9;

  const doc    = createDoc("l");
  const startY = renderHeader(doc, "Compras Detalle", filters);

  const totQty      = rows.reduce((s, r) => s + r.quantity, 0);
  const totSubtotal = rows.reduce((s, r) => s + r.line_subtotal, 0);
  const totTax      = rows.reduce((s, r) => s + r.tax_amount, 0);
  const totTotal    = rows.reduce((s, r) => s + r.line_total, 0);

  // Group consecutive rows by purchase_code
  type Group = { purchaseCode: string; purchaseDate: string; supplier: string; items: PurchasesLineReportRow[] };
  const groups: Group[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.purchaseCode === row.purchase_code) {
      last.items.push(row);
    } else {
      groups.push({ purchaseCode: row.purchase_code, purchaseDate: row.purchase_date, supplier: row.supplier_name, items: [row] });
    }
  }

  const body:         string[][] = [];
  const isGroupHeader: boolean[] = [];

  for (const group of groups) {
    const groupTotal = group.items.reduce((s, r) => s + r.line_total, 0);
    const hdr        = `${group.purchaseDate}   ${group.purchaseCode}   ${group.supplier}   Total: ${c(groupTotal)}`;
    body.push([hdr, ...Array(colCount - 1).fill("")]);
    isGroupHeader.push(true);

    for (const r of group.items) {
      body.push([
        r.product_code,
        r.product_name,
        r.category_name ?? "—",
        r.line_name ?? "—",
        n(r.quantity),
        c(r.unit_cost),
        c(r.line_subtotal),
        c(r.tax_amount),
        c(r.line_total),
      ]);
      isGroupHeader.push(false);
    }
  }

  const head = [["Código", "Producto", "Categoría", "Línea", "Cant.", "C. Unit.", "Subtotal", "IVA", "Total"]];

  const foot = [[
    `TOTAL — ${groups.length} ${groups.length === 1 ? "compra" : "compras"}`,
    "", "", "",
    n(totQty), "",
    c(totSubtotal), c(totTax), c(totTotal),
  ]];

  autoTable(doc, {
    head, body, foot,
    startY,
    ...TABLE_STYLES,
    didParseCell: (data) => {
      if (data.section === "body" && isGroupHeader[data.row.index]) {
        data.cell.styles.fillColor   = [45, 50, 60] as [number, number, number];
        data.cell.styles.textColor   = [200, 210, 230] as [number, number, number];
        data.cell.styles.fontStyle   = "bold";
        data.cell.styles.cellPadding = 3;
      }
      if ([4, 5, 6, 7, 8].includes(data.column.index)) {
        data.cell.styles.halign = "right";
      }
    },
    columnStyles: {
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
    },
  });

  addPageNumbers(doc);
  doc.save(`commerce-compras-detalle-${todayStr()}.pdf`);
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

  const numericProductCols = new Set([5, 6, 7, 8]);
  let pidx = 9;
  if (hasCost)   { numericProductCols.add(pidx); pidx++; }
  if (hasMargin) { numericProductCols.add(pidx); }

  autoTable(doc, {
    head, body, foot,
    startY,
    ...TABLE_STYLES,
    columnStyles: colStyles,
    didParseCell: (data) => {
      if (numericProductCols.has(data.column.index)) {
        data.cell.styles.halign = "right";
      }
    },
  });

  addPageNumbers(doc);
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
    r.customer_name, r.sale_count,
    c(r.total_amount), c(r.avg_ticket),
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
    didParseCell: (data) => {
      if ([1, 2, 3].includes(data.column.index)) {
        data.cell.styles.halign = "right";
      }
    },
  });

  addPageNumbers(doc);
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
    r.supplier_name, r.purchase_count,
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
    didParseCell: (data) => {
      if ([1, 2].includes(data.column.index)) {
        data.cell.styles.halign = "right";
      }
    },
  });

  addPageNumbers(doc);
  doc.save(`commerce-reporte-proveedores-${todayStr()}.pdf`);
}
