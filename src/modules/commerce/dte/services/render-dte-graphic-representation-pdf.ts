// ─────────────────────────────────────────────────────────────────
// commerce/dte — render-dte-graphic-representation-pdf.ts
//
// MH20 (Fase 6.1, IMP20-021) — PDF de la representación gráfica a partir
// del modelo puro (build-dte-graphic-representation.service.ts).
//
// Reutiliza la infraestructura existente del repositorio:
//   - jsPDF 4 + jspdf-autotable 5 (mismo patrón que
//     commerce/cash/utils/export-cash-cut-pdf.ts: datos estructurados, sin
//     window.print ni capturas del DOM);
//   - qrcode (ya usado por core/components/ui/qr-code-display.tsx) para el
//     QR de consulta pública (Manual Técnico v2 §5).
// Funciona en servidor (route handler) y no escribe en disco ni en red.
// ─────────────────────────────────────────────────────────────────

import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import QRCode from "qrcode";
import type { DteGraphicRepresentation } from "./build-dte-graphic-representation.service";

const MX = 12;
const PW = 210;
const HEAD: [number, number, number] = [39, 39, 42];
const HEAD_TXT: [number, number, number] = [235, 235, 235];

export async function renderDteGraphicRepresentationPdf(rep: DteGraphicRepresentation): Promise<Uint8Array> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(rep.versionLabel, PW - MX, y, { align: "right" });
  doc.setFontSize(12);
  if (rep.kind !== "INV" && rep.kind !== "18") {
    doc.text("DOCUMENTO TRIBUTARIO ELECTRÓNICO", MX, y);
    y += 6;
  }
  doc.text(rep.title, MX, y);
  y += 4;

  const qrDataUrl = await QRCode.toDataURL(rep.qrUrl, { margin: 1, width: 240 });
  doc.addImage(qrDataUrl, "PNG", PW - MX - 30, y, 30, 30);

  if (rep.stampStatus === "TRANSITORIO") {
    doc.setTextColor(180, 40, 40);
    doc.setFontSize(8);
    doc.text("SIN SELLO DE RECEPCIÓN — ESTADO TRANSITORIO", MX, y + 4);
    doc.setTextColor(0, 0, 0);
  }
  y += 8;

  for (const s of rep.sections) {
    autoTable(doc, {
      startY: y,
      margin: { left: MX, right: s.heading === "IDENTIFICACIÓN" ? MX + 34 : MX },
      head: [[{ content: s.heading, colSpan: 2 }]],
      body: s.rows,
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 1.2 },
      headStyles: { fillColor: HEAD, textColor: HEAD_TXT, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 52, fontStyle: "bold" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
  }

  for (const t of rep.tables) {
    autoTable(doc, {
      startY: y,
      margin: { left: MX, right: MX },
      head: [[{ content: t.heading, colSpan: t.columns.length }], t.columns],
      body: t.rows.length ? t.rows : [[{ content: "-", colSpan: t.columns.length }]],
      theme: "grid",
      styles: { fontSize: 6.5, cellPadding: 1 },
      headStyles: { fillColor: HEAD, textColor: HEAD_TXT, fontStyle: "bold" },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
  }

  if (rep.totals.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: PW / 2, right: MX },
      head: [[{ content: "RESUMEN", colSpan: 2 }]],
      body: rep.totals,
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 1.2 },
      headStyles: { fillColor: HEAD, textColor: HEAD_TXT, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  for (const n of rep.notes) {
    const lines = doc.splitTextToSize(n, PW - 2 * MX) as string[];
    doc.text(lines, MX, y);
    y += 3 * lines.length + 1;
  }
  doc.text(`Consulta pública: ${rep.qrUrl}`, MX, Math.min(y + 2, 287));

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.text(`Página ${i} de ${pages}`, PW - MX, 292, { align: "right" });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
