/**
 * XLSX export utility using SheetJS.
 * Called client-side with data already loaded in state.
 * The same dataset served by the API can be used here and in future Stimulsoft integration.
 */

import * as XLSX from "xlsx";

export interface XlsxSheet {
  /** Tab name in the workbook */
  name: string;
  headers: string[];
  rows: (string | number | null)[][];
}

export function downloadXlsx(filename: string, sheets: XlsxSheet[]): void {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const data = [sheet.headers, ...sheet.rows];
    const worksheet = XLSX.utils.aoa_to_sheet(data);

    // Auto-width columns based on content
    const colWidths = sheet.headers.map((h, colIdx) => {
      const maxLen = Math.max(
        h.length,
        ...sheet.rows.map((row) => String(row[colIdx] ?? "").length)
      );
      return { wch: Math.min(maxLen + 2, 40) };
    });
    worksheet["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }

  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
