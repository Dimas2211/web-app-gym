// ─────────────────────────────────────────────────────────────────
// commerce/reports — export-report-excel.ts
//
// Client-side Excel export using xlsx (SheetJS) 0.18.x.
//
// Reportes listado: una fila por documento (venta/compra).
// Reportes detalle: filas de grupo intercaladas con ítems.
// ─────────────────────────────────────────────────────────────────

import * as XLSX from "xlsx";
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

const CURRENCY_FMT = '"$"#,##0.00';
const NUMBER_FMT   = '#,##0.##';

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

// Rows 0-4: title, period, filters, generated, empty
function metaBlock(reportName: string, f: TabularFilters): (string | null)[][] {
  return [
    [reportName],
    [`Período: ${f.date_from} — ${f.date_to}`],
    [`Filtros: ${filterDescription(f)}`],
    [`Generado: ${todayStr()}`],
    [null],
  ];
}

function applyFmt(ws: XLSX.WorkSheet, startRow: number, endRow: number, col: number, fmt: string): void {
  for (let r = startRow; r <= endRow; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: col });
    const cell = ws[addr] as XLSX.CellObject | undefined;
    if (cell && cell.t === "n") cell.z = fmt;
  }
}

function finalizeAndDownload(
  ws: XLSX.WorkSheet,
  sheetName: string,
  colWidths: number[],
  filename: string,
): void {
  ws["!cols"] = colWidths.map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

// ── Ventas listado (1 fila por venta) ────────────────────────────

export function exportSalesListExcel(rows: SalesListRow[], filters: TabularFilters): void {
  const meta = metaBlock("Ventas Listado", filters);

  const headers = ["Fecha", "N° Venta", "Cliente", "Estado pago", "Ítems", "Subtotal", "IVA", "Total"];

  const totSubtotal = rows.reduce((s, r) => s + r.subtotal, 0);
  const totTax      = rows.reduce((s, r) => s + r.tax_amount, 0);
  const totTotal    = rows.reduce((s, r) => s + r.total_amount, 0);
  const totItems    = rows.reduce((s, r) => s + r.item_count, 0);

  const dataRows = rows.map((r) => [
    r.sale_date,
    r.sale_code,
    r.customer_name ?? "",
    paymentStatusLabel(r.payment_status),
    r.item_count,
    r.subtotal,
    r.tax_amount,
    r.total_amount,
  ]);

  const totalRow = [
    `TOTAL — ${rows.length} ${rows.length === 1 ? "venta" : "ventas"}`,
    "", "", "",
    totItems, totSubtotal, totTax, totTotal,
  ];

  const aoa = [...meta, headers, ...dataRows, totalRow];
  const ws  = XLSX.utils.aoa_to_sheet(aoa);

  const dataStart   = meta.length + 1;
  const dataEnd     = dataStart + rows.length - 1;
  const totalRowIdx = dataEnd + 1;

  applyFmt(ws, dataStart, totalRowIdx, 4, NUMBER_FMT);
  applyFmt(ws, dataStart, totalRowIdx, 5, CURRENCY_FMT);
  applyFmt(ws, dataStart, totalRowIdx, 6, CURRENCY_FMT);
  applyFmt(ws, dataStart, totalRowIdx, 7, CURRENCY_FMT);

  finalizeAndDownload(ws, "Ventas Listado",
    [12, 12, 24, 14, 8, 12, 12, 12],
    `commerce-ventas-listado-${todayStr()}.xlsx`);
}

// ── Ventas detalle (ítems agrupados por venta) ────────────────────

export function exportSalesExcel(rows: SalesLineReportRow[], filters: TabularFilters): void {
  const hasCost = rows.some((r) => r.cost_estimate !== null);
  const meta    = metaBlock("Ventas Detalle", filters);

  const headers = [
    "Tipo", "Código", "Producto / Servicio", "Categoría", "Línea",
    "Cant.", "P. Unit.", "Subtotal", "IVA", "Total",
    ...(hasCost ? ["Costo est.", "Margen est."] : []),
  ];

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

  // Build aoa with group header rows
  const bodyRows: (string | number | null)[][] = [];
  for (const group of groups) {
    const groupTotal = group.items.reduce((s, r) => s + r.line_total, 0);
    const hdrText    = `${group.saleDate}  ·  ${group.saleCode}  ·  ${group.customer ?? "Sin cliente"}  ·  Total: $${groupTotal.toFixed(2)}`;
    // Group header — all string, no numeric formatting
    bodyRows.push([hdrText, ...Array(headers.length - 1).fill(null)]);

    for (const r of group.items) {
      bodyRows.push([
        r.product_type === "SERVICE" ? "Servicio" : "Producto",
        r.product_code,
        r.product_name,
        r.category_name ?? "",
        r.line_name ?? "",
        r.quantity,
        r.unit_price,
        r.line_subtotal,
        r.tax_amount,
        r.line_total,
        ...(hasCost ? [r.cost_estimate ?? 0, r.margin_estimate ?? 0] : []),
      ]);
    }
  }

  const totalRow: (string | number | null)[] = [
    `TOTAL — ${groups.length} ${groups.length === 1 ? "venta" : "ventas"}`,
    "", "", "", "",
    totQty, null, totSubtotal, totTax, totTotal,
    ...(hasCost ? [totCost, totMargin] : []),
  ];

  const aoa = [...meta, headers, ...bodyRows, totalRow];
  const ws  = XLSX.utils.aoa_to_sheet(aoa);

  // Apply numeric formats to item + total rows only (skip group header rows)
  const headerRowIdx = meta.length; // 0-based index of the headers row
  let   currentRow   = headerRowIdx + 1;

  for (const group of groups) {
    currentRow++; // skip group header row
    const itemStart = currentRow;
    const itemEnd   = currentRow + group.items.length - 1;
    applyFmt(ws, itemStart, itemEnd, 5, NUMBER_FMT);
    applyFmt(ws, itemStart, itemEnd, 6, CURRENCY_FMT);
    applyFmt(ws, itemStart, itemEnd, 7, CURRENCY_FMT);
    applyFmt(ws, itemStart, itemEnd, 8, CURRENCY_FMT);
    applyFmt(ws, itemStart, itemEnd, 9, CURRENCY_FMT);
    if (hasCost) {
      applyFmt(ws, itemStart, itemEnd, 10, CURRENCY_FMT);
      applyFmt(ws, itemStart, itemEnd, 11, CURRENCY_FMT);
    }
    currentRow += group.items.length;
  }

  // Total row numeric formats
  applyFmt(ws, currentRow, currentRow, 5, NUMBER_FMT);
  applyFmt(ws, currentRow, currentRow, 7, CURRENCY_FMT);
  applyFmt(ws, currentRow, currentRow, 8, CURRENCY_FMT);
  applyFmt(ws, currentRow, currentRow, 9, CURRENCY_FMT);
  if (hasCost) {
    applyFmt(ws, currentRow, currentRow, 10, CURRENCY_FMT);
    applyFmt(ws, currentRow, currentRow, 11, CURRENCY_FMT);
  }

  const colW = [10, 12, 30, 15, 15, 8, 12, 12, 12, 12];
  if (hasCost) colW.push(12, 12);
  finalizeAndDownload(ws, "Ventas Detalle", colW, `commerce-ventas-detalle-${todayStr()}.xlsx`);
}

// ── Compras listado (1 fila por compra) ──────────────────────────

export function exportPurchasesListExcel(rows: PurchasesListRow[], filters: TabularFilters): void {
  const meta = metaBlock("Compras Listado", filters);

  const headers = ["Fecha", "N° Compra", "Proveedor", "Origen", "Ítems", "Subtotal", "IVA", "Total"];

  const totSubtotal = rows.reduce((s, r) => s + r.subtotal, 0);
  const totTax      = rows.reduce((s, r) => s + r.tax_amount, 0);
  const totTotal    = rows.reduce((s, r) => s + r.total_amount, 0);
  const totItems    = rows.reduce((s, r) => s + r.item_count, 0);

  const dataRows = rows.map((r) => [
    r.purchase_date,
    r.purchase_code,
    r.supplier_name,
    sourceTypeLabel(r.source_type),
    r.item_count,
    r.subtotal,
    r.tax_amount,
    r.total_amount,
  ]);

  const totalRow = [
    `TOTAL — ${rows.length} ${rows.length === 1 ? "compra" : "compras"}`,
    "", "", "",
    totItems, totSubtotal, totTax, totTotal,
  ];

  const aoa = [...meta, headers, ...dataRows, totalRow];
  const ws  = XLSX.utils.aoa_to_sheet(aoa);

  const dataStart   = meta.length + 1;
  const dataEnd     = dataStart + rows.length - 1;
  const totalRowIdx = dataEnd + 1;

  applyFmt(ws, dataStart, totalRowIdx, 4, NUMBER_FMT);
  applyFmt(ws, dataStart, totalRowIdx, 5, CURRENCY_FMT);
  applyFmt(ws, dataStart, totalRowIdx, 6, CURRENCY_FMT);
  applyFmt(ws, dataStart, totalRowIdx, 7, CURRENCY_FMT);

  finalizeAndDownload(ws, "Compras Listado",
    [12, 12, 24, 10, 8, 12, 12, 12],
    `commerce-compras-listado-${todayStr()}.xlsx`);
}

// ── Compras detalle (ítems agrupados por compra) ──────────────────

export function exportPurchasesExcel(rows: PurchasesLineReportRow[], filters: TabularFilters): void {
  const meta = metaBlock("Compras Detalle", filters);

  const headers = [
    "Código", "Producto", "Categoría", "Línea",
    "Cant.", "C. Unit.", "Subtotal", "IVA", "Total",
  ];

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

  const bodyRows: (string | number | null)[][] = [];
  for (const group of groups) {
    const groupTotal = group.items.reduce((s, r) => s + r.line_total, 0);
    const hdrText    = `${group.purchaseDate}  ·  ${group.purchaseCode}  ·  ${group.supplier}  ·  Total: $${groupTotal.toFixed(2)}`;
    bodyRows.push([hdrText, ...Array(headers.length - 1).fill(null)]);

    for (const r of group.items) {
      bodyRows.push([
        r.product_code,
        r.product_name,
        r.category_name ?? "",
        r.line_name ?? "",
        r.quantity,
        r.unit_cost,
        r.line_subtotal,
        r.tax_amount,
        r.line_total,
      ]);
    }
  }

  const totalRow: (string | number | null)[] = [
    `TOTAL — ${groups.length} ${groups.length === 1 ? "compra" : "compras"}`,
    "", "", "",
    totQty, null, totSubtotal, totTax, totTotal,
  ];

  const aoa = [...meta, headers, ...bodyRows, totalRow];
  const ws  = XLSX.utils.aoa_to_sheet(aoa);

  // Apply formats to item rows only
  const headerRowIdx = meta.length;
  let   currentRow   = headerRowIdx + 1;

  for (const group of groups) {
    currentRow++; // skip group header row
    const itemStart = currentRow;
    const itemEnd   = currentRow + group.items.length - 1;
    applyFmt(ws, itemStart, itemEnd, 4, NUMBER_FMT);
    applyFmt(ws, itemStart, itemEnd, 5, CURRENCY_FMT);
    applyFmt(ws, itemStart, itemEnd, 6, CURRENCY_FMT);
    applyFmt(ws, itemStart, itemEnd, 7, CURRENCY_FMT);
    applyFmt(ws, itemStart, itemEnd, 8, CURRENCY_FMT);
    currentRow += group.items.length;
  }

  // Total row
  applyFmt(ws, currentRow, currentRow, 4, NUMBER_FMT);
  applyFmt(ws, currentRow, currentRow, 6, CURRENCY_FMT);
  applyFmt(ws, currentRow, currentRow, 7, CURRENCY_FMT);
  applyFmt(ws, currentRow, currentRow, 8, CURRENCY_FMT);

  finalizeAndDownload(ws, "Compras Detalle",
    [12, 30, 15, 15, 8, 12, 12, 12, 12],
    `commerce-compras-detalle-${todayStr()}.xlsx`);
}

// ── Product summary ───────────────────────────────────────────────

export function exportProductsExcel(rows: ProductSummaryRow[], filters: TabularFilters): void {
  const hasCost   = rows.some((r) => r.cost_avg !== null);
  const hasMargin = rows.some((r) => r.margin_estimate !== null);
  const meta      = metaBlock("Productos", filters);

  const headers = [
    "Código", "Producto", "Tipo", "Categoría", "Línea",
    "Cant. vendida", "Monto vendido", "Cant. comprada", "Monto comprado",
    ...(hasCost   ? ["Costo prom."] : []),
    ...(hasMargin ? ["Margen est."] : []),
    "Últ. venta", "Últ. compra",
  ];

  const totSold   = rows.reduce((s, r) => s + r.amount_sold, 0);
  const totPurch  = rows.reduce((s, r) => s + r.amount_purchased, 0);
  const totMargin = rows.reduce((s, r) => s + (r.margin_estimate ?? 0), 0);

  const dataRows = rows.map((r) => [
    r.product_code, r.product_name,
    r.product_type === "SERVICE" ? "Servicio" : "Producto",
    r.category_name ?? "", r.line_name ?? "",
    r.qty_sold, r.amount_sold, r.qty_purchased, r.amount_purchased,
    ...(hasCost   ? [r.cost_avg ?? 0] : []),
    ...(hasMargin ? [r.margin_estimate ?? 0] : []),
    r.last_sale_date ?? "", r.last_purchase_date ?? "",
  ]);

  const totalRow: (string | number | null)[] = [
    "TOTAL", "", "", "", "",
    null, totSold, null, totPurch,
    ...(hasCost   ? [null] : []),
    ...(hasMargin ? [totMargin] : []),
    "", "",
  ];

  const aoa = [...meta, headers, ...dataRows, totalRow];
  const ws  = XLSX.utils.aoa_to_sheet(aoa);

  const dataStart   = meta.length + 1;
  const dataEnd     = dataStart + rows.length - 1;
  const totalRowIdx = dataEnd + 1;

  let col = 5;
  applyFmt(ws, dataStart, dataEnd,     col++, NUMBER_FMT);
  applyFmt(ws, dataStart, totalRowIdx, col++, CURRENCY_FMT);
  applyFmt(ws, dataStart, dataEnd,     col++, NUMBER_FMT);
  applyFmt(ws, dataStart, totalRowIdx, col++, CURRENCY_FMT);
  if (hasCost)   applyFmt(ws, dataStart, dataEnd,     col++, CURRENCY_FMT);
  if (hasMargin) applyFmt(ws, dataStart, totalRowIdx, col++, CURRENCY_FMT);

  const colW = [12, 30, 10, 15, 15, 12, 14, 14, 14];
  if (hasCost)   colW.push(12);
  if (hasMargin) colW.push(12);
  colW.push(12, 12);

  finalizeAndDownload(ws, "Productos", colW, `commerce-reporte-productos-${todayStr()}.xlsx`);
}

// ── Customer summary ──────────────────────────────────────────────

export function exportCustomersExcel(rows: CustomerSummaryRow[], filters: TabularFilters): void {
  const meta = metaBlock("Clientes", filters);

  const headers = [
    "Cliente", "N° ventas", "Total vendido",
    "Ticket prom.", "Última venta", "Prod./Serv. más comprado",
  ];

  const totAmount = rows.reduce((s, r) => s + r.total_amount, 0);
  const totCount  = rows.reduce((s, r) => s + r.sale_count, 0);

  const dataRows = rows.map((r) => [
    r.customer_name, r.sale_count, r.total_amount,
    r.avg_ticket, r.last_sale_date ?? "", r.top_product_name ?? "",
  ]);

  const totalRow = [
    "TOTAL", totCount, totAmount,
    totCount > 0 ? totAmount / totCount : 0, "", "",
  ];

  const aoa = [...meta, headers, ...dataRows, totalRow];
  const ws  = XLSX.utils.aoa_to_sheet(aoa);

  const dataStart   = meta.length + 1;
  const dataEnd     = dataStart + rows.length - 1;
  const totalRowIdx = dataEnd + 1;

  applyFmt(ws, dataStart, totalRowIdx, 1, NUMBER_FMT);
  applyFmt(ws, dataStart, totalRowIdx, 2, CURRENCY_FMT);
  applyFmt(ws, dataStart, totalRowIdx, 3, CURRENCY_FMT);

  finalizeAndDownload(ws, "Clientes",
    [28, 12, 16, 14, 14, 30],
    `commerce-reporte-clientes-${todayStr()}.xlsx`);
}

// ── Supplier summary ──────────────────────────────────────────────

export function exportSuppliersExcel(rows: SupplierSummaryRow[], filters: TabularFilters): void {
  const meta = metaBlock("Proveedores", filters);

  const headers = [
    "Proveedor", "N° compras", "Total comprado",
    "Producto más comprado", "Última compra",
  ];

  const totAmount = rows.reduce((s, r) => s + r.total_amount, 0);
  const totCount  = rows.reduce((s, r) => s + r.purchase_count, 0);

  const dataRows = rows.map((r) => [
    r.supplier_name, r.purchase_count, r.total_amount,
    r.top_product_name ?? "", r.last_purchase_date ?? "",
  ]);

  const totalRow = ["TOTAL", totCount, totAmount, "", ""];

  const aoa = [...meta, headers, ...dataRows, totalRow];
  const ws  = XLSX.utils.aoa_to_sheet(aoa);

  const dataStart   = meta.length + 1;
  const dataEnd     = dataStart + rows.length - 1;
  const totalRowIdx = dataEnd + 1;

  applyFmt(ws, dataStart, totalRowIdx, 1, NUMBER_FMT);
  applyFmt(ws, dataStart, totalRowIdx, 2, CURRENCY_FMT);

  finalizeAndDownload(ws, "Proveedores",
    [28, 12, 16, 30, 14],
    `commerce-reporte-proveedores-${todayStr()}.xlsx`);
}
