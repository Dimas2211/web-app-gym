// ─────────────────────────────────────────────────────────────────
// commerce/cash — export-cash-cut-excel.ts
//
// Exportación Excel real de un corte de caja.
// Usa xlsx (SheetJS) 0.18.x.
// Genera un .xlsx con 4 hojas: Resumen, Movimientos, Pagos, Ventas.
// NO usa window.print, html2canvas, ni capturas del DOM.
// ─────────────────────────────────────────────────────────────────

import * as XLSX from "xlsx";
import type { CashSessionCutReport, CashCutStatus } from "../types/cash.types";

// ── Formatos numéricos ────────────────────────────────────────────

const CURRENCY_FMT = '"$"#,##0.00';

// ── Labels ────────────────────────────────────────────────────────

const CUT_STATUS_LABELS: Record<CashCutStatus, string> = {
  OPEN:             "Abierta",
  CLOSED_BALANCED:  "Cerrada cuadrada",
  CLOSED_OVER:      "Cerrada con sobrante",
  CLOSED_SHORT:     "Cerrada con faltante",
  CANCELLED:        "Cancelada",
};

// ── Helpers ───────────────────────────────────────────────────────

function fDate(v: Date | string | null | undefined): string {
  if (!v) return "Pendiente";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "Pendiente";
  return d.toLocaleString("es-SV", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function safeStr(v: string | null | undefined, fallback = "Pendiente"): string {
  return v?.trim() ? v.trim() : fallback;
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function nowStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

// Aplica formato numérico a celdas de una columna en un rango de filas
function applyFmt(
  ws: XLSX.WorkSheet,
  startRow: number,
  endRow: number,
  col: number,
  fmt: string,
): void {
  for (let r = startRow; r <= endRow; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: col });
    const cell = ws[addr] as XLSX.CellObject | undefined;
    if (cell && cell.t === "n") cell.z = fmt;
  }
}

function setColWidths(ws: XLSX.WorkSheet, widths: number[]): void {
  ws["!cols"] = widths.map((w) => ({ wch: w }));
}

// ── Hoja 1: Resumen ───────────────────────────────────────────────

function buildResumenSheet(report: CashSessionCutReport): XLSX.WorkSheet {
  const statusLabel = CUT_STATUS_LABELS[report.cut_status] ?? report.cut_status;
  const diff        = report.difference_amount;
  const cutLabel    = report.cut_status === "OPEN"
    ? "Sesión abierta"
    : statusLabel;

  // Fila genérica label+valor; los valores numéricos van como numbers
  type Row = (string | number | null)[];

  const aoa: Row[] = [
    ["CORTE DE CAJA"],
    ["Caja", `${report.cash_register_code} — ${report.cash_register_name}`],
    ["Sesión", report.session_id],
    ["Estado", statusLabel],
    ["Generado", nowStr()],
    [],
    ["APERTURA Y CIERRE"],
    ["Abrió",          safeStr(report.opened_by_name)],
    ["Cerró",          safeStr(report.closed_by_name)],
    ["Fecha apertura", fDate(report.opened_at)],
    ["Fecha cierre",   fDate(report.closed_at)],
    ["Estado sesión",  report.status],
    [],
    ["RESUMEN DE EFECTIVO"],
    ["Monto inicial",      report.opening_amount],
    ["Entradas manuales",  report.manual_in_total],
    ["Salidas manuales",   report.manual_out_total],
    ["Efectivo esperado",  report.expected_cash_amount],
    ["Efectivo declarado", report.declared_cash_amount ?? "Pendiente"],
    ["Diferencia",         diff ?? "Pendiente"],
    ["Resultado",          cutLabel],
    [],
    ["VENTAS ASOCIADAS"],
    ...(report.sales_summary.sales_count > 0
      ? [
          ["Ventas confirmadas", report.sales_summary.sales_count],
          ["Total ventas",        report.sales_summary.total_amount],
          ["Total pagado",        report.sales_summary.paid_amount],
          ["Total pendiente",     report.sales_summary.unpaid_amount],
        ] as Row[]
      : [["Ventas y pagos se integrarán completamente en una fase posterior."]] as Row[]),
    [],
    ["FIRMAS Y OBSERVACIONES"],
    ["Cajero responsable",    ""],
    ["Supervisor / Gerencia", ""],
    ["Observaciones",         ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Aplicar formato moneda a filas de montos (índices basados en aoa)
  // Monto inicial = fila 14 (0-based)
  const moneyRows = [14, 15, 16, 17];
  for (const r of moneyRows) {
    applyFmt(ws, r, r, 1, CURRENCY_FMT);
  }
  // Efectivo declarado (fila 18) y Diferencia (fila 19) pueden ser string o number
  applyFmt(ws, 18, 19, 1, CURRENCY_FMT);

  // Ventas (si existen): filas 23-26
  if (report.sales_summary.sales_count > 0) {
    applyFmt(ws, 24, 26, 1, CURRENCY_FMT);
  }

  setColWidths(ws, [26, 40]);
  return ws;
}

// ── Hoja 2: Movimientos ───────────────────────────────────────────

function buildMovimientosSheet(report: CashSessionCutReport): XLSX.WorkSheet {
  if (report.movements.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Sin movimientos manuales registrados."],
    ]);
    setColWidths(ws, [45]);
    return ws;
  }

  const headers = [
    "Fecha", "Tipo", "Dirección", "Monto",
    "Motivo", "Referencia", "Usuario", "Notas",
  ];

  const rows = report.movements.map((m) => [
    fDate(m.performed_at),
    m.movement_type_label,
    m.direction === "IN" ? "Entrada" : "Salida",
    m.amount,
    m.reason    ?? "",
    m.reference ?? "",
    safeStr(m.performed_by_name, "—"),
    m.notes     ?? "",
  ]);

  const aoa = [headers, ...rows];
  const ws  = XLSX.utils.aoa_to_sheet(aoa);

  // Formato moneda en columna Monto (índice 3), filas 1..n
  applyFmt(ws, 1, rows.length, 3, CURRENCY_FMT);

  setColWidths(ws, [18, 18, 12, 14, 22, 16, 20, 22]);
  return ws;
}

// ── Hoja 3: Pagos ─────────────────────────────────────────────────

function buildPagosSheet(report: CashSessionCutReport): XLSX.WorkSheet {
  if (report.payments_summary.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Sin pagos asociados a esta sesión."],
    ]);
    setColWidths(ws, [40]);
    return ws;
  }

  const headers = ["Método", "Código MH", "Cantidad", "Total"];

  const rows = report.payments_summary.map((p) => [
    p.label,
    p.mh_payment_form_code ?? "",
    p.count,
    p.total_amount,
  ]);

  const aoa = [headers, ...rows];
  const ws  = XLSX.utils.aoa_to_sheet(aoa);

  // Formato moneda en columna Total (índice 3), filas 1..n
  applyFmt(ws, 1, rows.length, 3, CURRENCY_FMT);

  setColWidths(ws, [24, 14, 12, 14]);
  return ws;
}

// ── Hoja 4: Ventas ────────────────────────────────────────────────

function buildVentasSheet(report: CashSessionCutReport): XLSX.WorkSheet {
  type Row = (string | number)[];
  let aoa: Row[];

  if (report.sales_summary.sales_count > 0) {
    aoa = [
      ["VENTAS ASOCIADAS"],
      [],
      ["Ventas confirmadas", report.sales_summary.sales_count],
      ["Total ventas",        report.sales_summary.total_amount],
      ["Total pagado",        report.sales_summary.paid_amount],
      ["Total pendiente",     report.sales_summary.unpaid_amount],
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    applyFmt(ws, 3, 5, 1, CURRENCY_FMT);
    setColWidths(ws, [22, 18]);
    return ws;
  }

  aoa = [
    ["VENTAS ASOCIADAS"],
    [],
    ["Ventas y pagos se integrarán completamente en una fase posterior."],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  setColWidths(ws, [55]);
  return ws;
}

// ── Función exportadora principal ─────────────────────────────────

export function exportCashCutExcel(report: CashSessionCutReport): void {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildResumenSheet(report),     "Resumen");
  XLSX.utils.book_append_sheet(wb, buildMovimientosSheet(report), "Movimientos");
  XLSX.utils.book_append_sheet(wb, buildPagosSheet(report),       "Pagos");
  XLSX.utils.book_append_sheet(wb, buildVentasSheet(report),      "Ventas");

  const code = sanitizeFilename(report.cash_register_code);
  XLSX.writeFile(wb, `corte-caja-${code}-${nowStr()}.xlsx`);
}
