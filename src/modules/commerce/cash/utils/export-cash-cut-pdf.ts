// ─────────────────────────────────────────────────────────────────
// commerce/cash — export-cash-cut-pdf.ts
//
// Exportación PDF profesional de un corte de caja.
// Usa jsPDF 4.x + jspdf-autotable 5.x.
// NO usa window.print, html2canvas, ni capturas del DOM.
// Se construye desde datos estructurados de CashSessionCutReport.
// ─────────────────────────────────────────────────────────────────

import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { CashSessionCutReport, CashCutStatus } from "../types/cash.types";
import { formatMhPaymentForm } from "./cash-payment-method-labels";

// ── Constantes de layout ──────────────────────────────────────────

const MX = 14;   // margen izquierdo/derecho
const PW = 210;  // ancho A4 portrait (mm)

const HEAD_COLOR: [number, number, number] = [39, 39, 42];
const HEAD_TEXT:  [number, number, number] = [200, 200, 200];
const ALT_ROW:    [number, number, number] = [248, 248, 248];

// ── Labels ────────────────────────────────────────────────────────

const CUT_STATUS_LABELS: Record<CashCutStatus, string> = {
  OPEN:             "Abierta",
  CLOSED_BALANCED:  "Cerrada cuadrada",
  CLOSED_OVER:      "Cerrada con sobrante",
  CLOSED_SHORT:     "Cerrada con faltante",
  CANCELLED:        "Cancelada",
};

// ── Helpers ───────────────────────────────────────────────────────

function fMoney(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "$0.00";
  return new Intl.NumberFormat("es-SV", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
}

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

// ── Primitivas de dibujo ──────────────────────────────────────────

function hRule(doc: jsPDF, y: number): void {
  doc.setDrawColor(190, 190, 190);
  doc.line(MX, y, PW - MX, y);
  doc.setDrawColor(0);
}

function sectionHeader(doc: jsPDF, title: string, y: number): number {
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(90, 90, 90);
  doc.text(title.toUpperCase(), MX, y);
  y += 1.5;
  hRule(doc, y);
  doc.setTextColor(0);
  return y + 5;
}

// Bloque clave-valor en cuadrícula de 2 columnas (label arriba, valor abajo)
function kvBlock(doc: jsPDF, pairs: [string, string][], startY: number): number {
  const colW = (PW - MX * 2) / 2;
  let y = startY;
  doc.setFontSize(8);
  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i]!;
    const b = pairs[i + 1];
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130);
    doc.text(a[0], MX, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30);
    doc.text(a[1], MX, y + 4);
    if (b) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(130);
      doc.text(b[0], MX + colW, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30);
      doc.text(b[1], MX + colW, y + 4);
    }
    y += 9;
  }
  doc.setTextColor(0);
  return y;
}

function italicNote(doc: jsPDF, text: string, y: number): number {
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(150);
  doc.text(text, MX, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);
  return y + 8;
}

// Y final del último autoTable
function lastTableY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } })
    .lastAutoTable.finalY;
}

// ── Función exportadora principal ─────────────────────────────────

export function exportCashCutPdf(report: CashSessionCutReport): void {
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  let y = MX;

  // ── A. Encabezado ─────────────────────────────────────────────

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20);
  doc.text("CORTE DE CAJA", MX, y);
  y += 7;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(70);
  doc.text(`Caja: ${report.cash_register_code} — ${report.cash_register_name}`, MX, y);
  y += 5;
  doc.text(`Sesión: ${report.session_id}`, MX, y);
  y += 5;

  const statusLabel = CUT_STATUS_LABELS[report.cut_status] ?? report.cut_status;
  doc.setFontSize(7.5);
  doc.setTextColor(100);
  doc.text(
    `Estado: ${statusLabel}   |   Generado: ${new Date().toLocaleString("es-SV")}`,
    MX,
    y,
  );
  doc.setTextColor(0);
  y += 6;
  hRule(doc, y);
  y += 6;

  // ── B. Apertura y cierre ──────────────────────────────────────

  y = sectionHeader(doc, "Apertura y cierre", y);
  y = kvBlock(doc, [
    ["Abrió",          safeStr(report.opened_by_name)],
    ["Cerró",          safeStr(report.closed_by_name)],
    ["Fecha apertura", fDate(report.opened_at)],
    ["Fecha cierre",   fDate(report.closed_at)],
    ["Estado sesión",  report.status],
  ], y);
  y += 4;

  // ── C. Resumen de efectivo ────────────────────────────────────

  y = sectionHeader(doc, "Resumen de efectivo", y);

  const diff     = report.difference_amount;
  const diffStr  = diff == null
    ? "Pendiente"
    : (diff >= 0 ? "+" : "") + fMoney(diff);
  const cutLabel = report.cut_status === "OPEN"
    ? "Sesión abierta"
    : (CUT_STATUS_LABELS[report.cut_status] ?? report.cut_status);

  y = kvBlock(doc, [
    ["Monto inicial",      fMoney(report.opening_amount)],
    ["Entradas manuales",  "+" + fMoney(report.manual_in_total)],
    ["Salidas manuales",   report.manual_out_total > 0.005 ? "-" + fMoney(report.manual_out_total) : fMoney(0)],
    ["Efectivo esperado",  fMoney(report.expected_cash_amount)],
    ["Efectivo declarado", report.declared_cash_amount != null
      ? fMoney(report.declared_cash_amount)
      : "Pendiente"],
    ["Diferencia",         diffStr],
    ["Resultado",          cutLabel],
  ], y);
  y += 4;

  // ── D. Ventas asociadas ───────────────────────────────────────

  y = sectionHeader(doc, "Ventas asociadas", y);
  if (report.sales_summary.sales_count > 0) {
    y = kvBlock(doc, [
      ["Ventas confirmadas", String(report.sales_summary.sales_count)],
      ["Total ventas",        fMoney(report.sales_summary.total_amount)],
      ["Total pagado",        fMoney(report.sales_summary.paid_amount)],
      ["Total pendiente",     fMoney(report.sales_summary.unpaid_amount)],
    ], y);
  } else {
    y = italicNote(
      doc,
      "Ventas y pagos se integrarán completamente en una fase posterior.",
      y,
    );
  }
  y += 4;

  // ── E. Formas de pago ─────────────────────────────────────────

  y = sectionHeader(doc, "Formas de pago", y);
  if (report.payments_summary.length === 0) {
    y = italicNote(doc, "Sin pagos asociados a esta sesión.", y);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Forma de pago", "Transacciones", "Total"]],
      body: report.payments_summary.map((p) => [
        p.label || formatMhPaymentForm(p.mh_payment_form_code ?? p.payment_method_code),
        String(p.count),
        fMoney(p.total_amount),
      ]),
      headStyles:         { fillColor: HEAD_COLOR, textColor: HEAD_TEXT, fontSize: 7.5, fontStyle: "bold" },
      bodyStyles:         { fontSize: 7.5, textColor: [40, 40, 40] },
      alternateRowStyles: { fillColor: ALT_ROW },
      columnStyles:       { 1: { halign: "right" }, 2: { halign: "right" } },
      styles:             { cellPadding: 2, overflow: "linebreak" },
      margin:             { left: MX, right: MX },
    });
    y = lastTableY(doc) + 6;
  }

  // ── E2. Detalle de transacciones ──────────────────────────────

  y = sectionHeader(doc, "Detalle de transacciones", y);
  if (report.payment_details.length === 0) {
    y = italicNote(doc, "No hay transacciones de pago asociadas a esta sesión.", y);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Hora", "Venta", "Forma de pago", "Referencia", "Monto"]],
      body: report.payment_details.map((d) => {
        const formLabel = d.mh_payment_form_code
          ? formatMhPaymentForm(d.mh_payment_form_code)
          : formatMhPaymentForm(d.payment_method_code);
        const ref = d.reference
          ? d.reference
          : d.mh_payment_form_code === "01" ? "—" : "Sin referencia";
        return [
          d.paid_time_label,
          d.sale_code ?? "—",
          formLabel,
          ref,
          fMoney(d.amount),
        ];
      }),
      headStyles:         { fillColor: HEAD_COLOR, textColor: HEAD_TEXT, fontSize: 7, fontStyle: "bold" },
      bodyStyles:         { fontSize: 7, textColor: [40, 40, 40] },
      alternateRowStyles: { fillColor: ALT_ROW },
      columnStyles:       { 4: { halign: "right" } },
      styles:             { cellPadding: 1.5, overflow: "linebreak" },
      margin:             { left: MX, right: MX },
    });
    y = lastTableY(doc) + 6;
  }

  // ── F. Movimientos manuales ───────────────────────────────────

  y = sectionHeader(doc, `Movimientos manuales (${report.movements_count})`, y);
  if (report.movements.length === 0) {
    y = italicNote(doc, "Sin movimientos manuales registrados.", y);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Fecha", "Tipo", "Dir.", "Monto", "Motivo", "Ref.", "Usuario", "Notas"]],
      body: report.movements.map((m) => [
        fDate(m.performed_at),
        m.movement_type_label,
        m.direction === "IN" ? "Entrada" : "Salida",
        fMoney(m.amount),
        m.reason    ?? "—",
        m.reference ?? "—",
        safeStr(m.performed_by_name, "—"),
        m.notes     ?? "—",
      ]),
      headStyles:         { fillColor: HEAD_COLOR, textColor: HEAD_TEXT, fontSize: 7, fontStyle: "bold" },
      bodyStyles:         { fontSize: 7, textColor: [40, 40, 40] },
      alternateRowStyles: { fillColor: ALT_ROW },
      columnStyles:       { 3: { halign: "right" } },
      styles:             { cellPadding: 1.5, overflow: "linebreak" },
      margin:             { left: MX, right: MX },
    });
    y = lastTableY(doc) + 6;
  }

  // ── G. Firmas y observaciones ─────────────────────────────────

  if (y > 245) {
    doc.addPage();
    y = MX;
  }

  y = sectionHeader(doc, "Firmas y observaciones", y);

  const lineLen = 60;
  const midX    = PW / 2;
  const lineY   = y + 14;

  doc.setDrawColor(100);
  doc.line(MX,   lineY, MX   + lineLen, lineY);
  doc.line(midX, lineY, midX + lineLen, lineY);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text("Cajero responsable",    MX,   lineY + 5);
  doc.text("Supervisor / Gerencia", midX, lineY + 5);

  y = lineY + 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(80);
  doc.text("Observaciones:", MX, y);
  y += 4;
  doc.setDrawColor(180);
  doc.rect(MX, y, PW - MX * 2, 18);

  // ── Guardar ───────────────────────────────────────────────────

  const code = sanitizeFilename(report.cash_register_code);
  doc.save(`corte-caja-${code}-${nowStr()}.pdf`);
}
