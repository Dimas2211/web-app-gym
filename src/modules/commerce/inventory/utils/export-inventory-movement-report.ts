// ─────────────────────────────────────────────────────────────────
// commerce/inventory — export-inventory-movement-report.ts
//
// Exportación Excel/PDF de la consulta "Movimientos por producto".
//
// Reglas:
//   - Recibe el reporte COMPLETO devuelto por
//     GET /api/inventory/product-movements?mode=export (mismo filtro,
//     mismo orden y mismo mapper que la pantalla).
//   - Un solo producto por archivo; encabezado con producto, código,
//     sucursal, período, fecha de generación y cantidad de movimientos.
//   - Tipos y direcciones en español (inventory-movement-labels.ts).
//   - Documento y Correlativo en columnas separadas.
//   - Excel: cantidades, saldos y costo como números reales.
// ─────────────────────────────────────────────────────────────────

import type { ProductMovementReport } from "../queries/get-product-movement-report";
import type { InventoryMovementItem } from "../types/inventory-movement.types";
import { DOCUMENT_STATUS_LABELS, getMovementDirectionLabel, getMovementTypeLabel } from "./inventory-movement-labels";

export const MOVEMENT_REPORT_COLUMNS = [
  "Fecha y hora",
  "Tipo de movimiento",
  "Dirección",
  "Documento",
  "Correlativo",
  "Entrada",
  "Salida",
  "Existencia anterior",
  "Existencia resultante",
  "Costo unitario",
  "Usuario",
  "Observaciones",
] as const;

export interface MovementExportRow {
  date: string;
  type: string;
  direction: string;
  document: string | null;
  /** "Invalidado" / "Invalidación en curso"; null = documento vigente o sin documento. */
  document_status: string | null;
  correlative: string | null;
  qty_in: number | null;
  qty_out: number | null;
  stock_before: number;
  resulting_stock: number;
  unit_cost: number | null;
  user: string | null;
  notes: string | null;
}

/** Fila normalizada — idéntica en pantalla, Excel y PDF. */
export function toMovementExportRow(item: InventoryMovementItem): MovementExportRow {
  const additive = item.movement_direction === "ADDITIVE";
  return {
    date:            item.created_at_label,
    type:            getMovementTypeLabel(item.movement_type),
    direction:       getMovementDirectionLabel(item.movement_direction),
    document:        item.document_number,
    document_status: item.document_status ? DOCUMENT_STATUS_LABELS[item.document_status] : null,
    correlative:     item.correlative,
    qty_in:          additive ? item.quantity : null,
    qty_out:         additive ? null : item.quantity,
    stock_before:    item.stock_before,
    resulting_stock: item.resulting_stock,
    unit_cost:       item.unit_cost,
    user:            item.performed_by_name,
    notes:           item.notes,
  };
}

/** Documento con su estado fiscal, tal como se imprime en Excel/PDF. */
export function formatMovementDocument(row: Pick<MovementExportRow, "document" | "document_status">): string | null {
  if (!row.document) return null;
  return row.document_status ? `${row.document} (${row.document_status})` : row.document;
}

// ── Formato numérico El Salvador (1,234.56) ─────────────────────

const QTY_FMT  = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const COST_FMT = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMovementQty(value: number | null): string {
  return value === null ? "" : QTY_FMT.format(value);
}

export function formatMovementCost(value: number | null): string {
  return value === null ? "" : COST_FMT.format(value);
}

// ── Encabezado común ─────────────────────────────────────────────

export function describeMovementPeriod(report: Pick<ProductMovementReport, "date_from_label" | "date_to_label">): string {
  const { date_from_label: from, date_to_label: to } = report;
  if (from && to) return `${from} al ${to}`;
  if (from) return `Desde ${from}`;
  if (to) return `Hasta ${to}`;
  return "Todo el historial";
}

export function buildMovementReportHeader(report: ProductMovementReport, typeFilterLabel: string | null): [string, string][] {
  const lines: [string, string][] = [
    ["Producto", report.product.name],
    ["Código", report.product.product_code],
    ["Sucursal", report.location.name],
    ["Período", describeMovementPeriod(report)],
  ];
  if (typeFilterLabel) lines.push(["Tipo de movimiento", typeFilterLabel]);
  lines.push(
    ["Fecha de generación", report.generated_at_label],
    ["Cantidad de movimientos", String(report.total)],
  );
  return lines;
}

/** Neutraliza fórmulas en celdas de texto (CSV/Excel injection). */
function safeText(value: string | null | undefined): string {
  const s = value ?? "";
  return /^[=+@\-\t\r]/.test(s) ? "'" + s : s;
}

function filename(report: ProductMovementReport, ext: string): string {
  const code = report.product.product_code.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 40) || "producto";
  const stamp = report.generated_at_label.slice(0, 10).split("/").reverse().join("-");
  return `movimientos-inventario-${code}-${stamp}.${ext}`;
}

function assertComplete(report: ProductMovementReport): void {
  // Defensa: el endpoint de exportación ya rechaza filtros incompletos.
  if (report.items.length !== report.total) {
    throw new Error("La exportación no contiene todos los movimientos del filtro.");
  }
}

// ── Excel ────────────────────────────────────────────────────────

/** Construye el libro Excel (sin descargar) — reutilizado por la descarga y la verificación. */
export async function buildProductMovementsWorkbook(
  report: ProductMovementReport,
  typeFilterLabel: string | null,
) {
  assertComplete(report);
  const XLSX = await import("xlsx");

  const header = buildMovementReportHeader(report, typeFilterLabel);
  const rows = report.items.map(toMovementExportRow);

  const aoa: (string | number | null)[][] = [
    ["ZOLVI — MOVIMIENTOS DE INVENTARIO"],
    ...header.map(([k, v]) => [k, safeText(v)]),
    [],
    [...MOVEMENT_REPORT_COLUMNS],
    ...rows.map((r) => [
      r.date,
      r.type,
      r.direction,
      safeText(formatMovementDocument(r) ?? "—"),
      safeText(r.correlative ?? "—"),
      r.qty_in,
      r.qty_out,
      r.stock_before,
      r.resulting_stock,
      r.unit_cost,
      safeText(r.user ?? "—"),
      safeText(r.notes),
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Formato numérico real en columnas F..J (índices 5..9)
  const firstDataRow = header.length + 3; // 0-based: título + header + vacía + columnas
  for (let r = 0; r < rows.length; r++) {
    for (let c = 5; c <= 9; c++) {
      const ref = XLSX.utils.encode_cell({ r: firstDataRow + r, c });
      const cell = ws[ref];
      if (cell && cell.t === "n") cell.z = c === 9 ? "#,##0.00" : "#,##0.####";
    }
  }

  ws["!cols"] = [17, 22, 10, 24, 13, 11, 11, 13, 13, 13, 24, 40].map((wch) => ({ wch }));
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
  return wb;
}

export async function exportProductMovementsExcel(
  report: ProductMovementReport,
  typeFilterLabel: string | null,
): Promise<void> {
  const [XLSX, wb] = await Promise.all([import("xlsx"), buildProductMovementsWorkbook(report, typeFilterLabel)]);
  XLSX.writeFile(wb, filename(report, "xlsx"));
}

// ── PDF ──────────────────────────────────────────────────────────
//
// A4 horizontal, encabezado completo en la primera página y resumido
// en las siguientes, cabecera de tabla repetida y "Página X de Y".
// Fuente estándar Helvetica (WinAnsi): soporta acentos y ñ. Se evita
// el guion largo "—" (fuera de WinAnsi en jsPDF) usando "-".

/** Construye el PDF (sin descargar) — reutilizado por la descarga y la verificación. */
export async function buildProductMovementsPdf(
  report: ProductMovementReport,
  typeFilterLabel: string | null,
) {
  assertComplete(report);
  const [{ default: jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 10;

  // ── Encabezado completo (página 1) ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("ZOLVI", marginX, 11);
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 20);
  doc.text("MOVIMIENTOS DE INVENTARIO", marginX, 18);

  const header = buildMovementReportHeader(report, typeFilterLabel);
  doc.setFontSize(8.5);
  const colW = (pageWidth - marginX * 2) / 2;
  let y = 25;
  header.forEach(([k, v], i) => {
    const x = marginX + (i % 2) * colW;
    if (i > 0 && i % 2 === 0) y += 4.6;
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, x, y);
    doc.setFont("helvetica", "normal");
    const value = doc.splitTextToSize(v, colW - 42)[0] as string;
    doc.text(value, x + 40, y);
  });
  y += 3;
  doc.setDrawColor(200, 200, 200);
  doc.line(marginX, y, pageWidth - marginX, y);

  const compactHeader =
    `${report.product.product_code} - ${report.product.name}  |  ${report.location.name}  |  ${describeMovementPeriod(report)}`;

  const body = report.items.map(toMovementExportRow).map((r) => [
    r.date,
    r.type,
    r.direction,
    formatMovementDocument(r) ?? "-",
    r.correlative ?? "-",
    formatMovementQty(r.qty_in),
    formatMovementQty(r.qty_out),
    formatMovementQty(r.stock_before),
    formatMovementQty(r.resulting_stock),
    r.unit_cost === null ? "-" : formatMovementCost(r.unit_cost),
    r.user ?? "-",
    r.notes ?? "",
  ]);

  autoTable(doc, {
    startY: y + 3,
    head: [[...MOVEMENT_REPORT_COLUMNS]],
    body: body.length ? body : [[{ content: "No hay movimientos para los filtros seleccionados.", colSpan: 12, styles: { halign: "center" } }]],
    margin: { left: marginX, right: marginX, top: 18, bottom: 14 },
    theme: "striped",
    showHead: "everyPage",
    styles: { font: "helvetica", fontSize: 7, cellPadding: 1.3, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [39, 48, 62], textColor: 255, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: [246, 247, 249] },
    columnStyles: {
      // Documento ancho para números de control DTE (31 caracteres) y
      // Correlativo para códigos de venta (VTA-aaaa-mm-nnnn) sin cortes.
      0:  { cellWidth: 24 },
      1:  { cellWidth: 25 },
      2:  { cellWidth: 15 },
      3:  { cellWidth: 44, fontSize: 6.5 },
      4:  { cellWidth: 24 },
      5:  { cellWidth: 14, halign: "right" },
      6:  { cellWidth: 14, halign: "right" },
      7:  { cellWidth: 17, halign: "right" },
      8:  { cellWidth: 18, halign: "right" },
      9:  { cellWidth: 15, halign: "right" },
      10: { cellWidth: 25 },
      11: { cellWidth: "auto" },
    },
    // Títulos de columnas numéricas alineados con sus valores
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index >= 5 && data.column.index <= 9) {
        data.cell.styles.halign = "right";
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(20, 20, 20);
        doc.text("MOVIMIENTOS DE INVENTARIO", marginX, 10);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(90, 90, 90);
        doc.text(doc.splitTextToSize(compactHeader, pageWidth - marginX * 2)[0] as string, marginX, 14.5);
      }
    },
  });

  // Numeración "Página X de Y" + fecha de generación en el pie
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text(`Generado: ${report.generated_at_label}`, marginX, pageHeight - 6);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - marginX, pageHeight - 6, { align: "right" });
  }

  return doc;
}

export async function exportProductMovementsPdf(
  report: ProductMovementReport,
  typeFilterLabel: string | null,
): Promise<void> {
  const doc = await buildProductMovementsPdf(report, typeFilterLabel);
  doc.save(filename(report, "pdf"));
}
