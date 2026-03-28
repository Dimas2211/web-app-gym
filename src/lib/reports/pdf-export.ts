/**
 * PDF export utility using jsPDF + jspdf-autotable.
 * Called client-side with data already loaded in state.
 *
 * STIMULSOFT NOTE:
 * This is a provisional implementation. When Stimulsoft is integrated:
 * - Replace `downloadPdf()` with a Stimulsoft renderer call
 * - The `PdfReportConfig` interface is designed to map 1:1 to Stimulsoft datasets
 * - `headers` + `rows` become the Stimulsoft DataStore table
 * - `kpis` become Stimulsoft summary variables
 * - `filters` become Stimulsoft report parameters
 * Everything else in the module (queries, API, types) stays unchanged.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PdfKpi {
  label: string;
  value: string;
}

export interface PdfReportConfig {
  title: string;
  subtitle?: string;
  /** Key-value pairs of active filters shown in the header */
  filters: Record<string, string>;
  generatedAt?: Date;
  kpis?: PdfKpi[];
  /** Base64 PNG data URL of a chart image to embed between KPIs and table */
  chartImage?: string;
  headers: string[];
  rows: (string | number | null)[][];
  filename?: string;
}

export function downloadPdf(config: PdfReportConfig): void {
  const {
    title,
    subtitle,
    filters,
    generatedAt = new Date(),
    kpis,
    chartImage,
    headers,
    rows,
    filename,
  } = config;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  let cursorY = 14;

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, cursorY);
  cursorY += 7;

  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(subtitle, 14, cursorY);
    cursorY += 6;
    doc.setTextColor(0);
  }

  // Generated at
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(130);
  doc.text(
    `Generado: ${generatedAt.toLocaleString("es-MX")}`,
    pageW - 14,
    14,
    { align: "right" }
  );
  doc.setTextColor(0);

  // Active filters
  const filterEntries = Object.entries(filters).filter(([, v]) => v && v !== "Todos");
  if (filterEntries.length > 0) {
    doc.setFontSize(8);
    doc.setTextColor(80);
    const filterText = filterEntries.map(([k, v]) => `${k}: ${v}`).join("   ");
    doc.text(`Filtros aplicados — ${filterText}`, 14, cursorY);
    cursorY += 5;
    doc.setTextColor(0);
  }

  // KPI summary row
  if (kpis && kpis.length > 0) {
    cursorY += 2;
    const kpiColW = (pageW - 28) / kpis.length;
    kpis.forEach((kpi, i) => {
      const x = 14 + i * kpiColW;
      doc.setFontSize(7);
      doc.setTextColor(100);
      doc.text(kpi.label.toUpperCase(), x, cursorY);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text(kpi.value, x, cursorY + 5);
      doc.setFont("helvetica", "normal");
    });
    cursorY += 12;
  }

  // Chart image — embedded between KPIs and table
  if (chartImage) {
    cursorY += 4;
    const imgW = pageW - 28;
    const imgH = 68; // fixed height in mm; chart stretches to fill
    try {
      doc.addImage(chartImage, "PNG", 14, cursorY, imgW, imgH);
      cursorY += imgH + 4;
    } catch {
      // Skip chart silently if image fails to render
    }
  }

  // Main table
  autoTable(doc, {
    startY: cursorY + 2,
    head: [headers],
    body: rows.map((row) =>
      row.map((cell) => (cell === null || cell === undefined ? "" : String(cell)))
    ),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: {
      fillColor: [39, 39, 42], // zinc-800
      textColor: [228, 228, 231], // zinc-200
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [244, 244, 245] }, // zinc-100
    margin: { left: 14, right: 14 },
  });

  const outFilename = filename ?? title.toLowerCase().replace(/\s+/g, "_");
  doc.save(`${outFilename}.pdf`);
}
