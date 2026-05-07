// ─────────────────────────────────────────────────────────────────
// commerce/purchases — parse-dte-control-number.ts
//
// Deriva document_series y document_number a partir del número de
// control DTE. Formato esperado: DTE-01-S001P002-000000000057584
//   series  = todo hasta el último guion: "DTE-01-S001P002"
//   number  = último segmento sin ceros a la izquierda: "57584"
// ─────────────────────────────────────────────────────────────────

export function parseDteControlNumber(controlNumber: string | null | undefined): {
  series: string | null;
  number: string | null;
} {
  if (!controlNumber) return { series: null, number: null };

  const lastDash = controlNumber.lastIndexOf("-");
  if (lastDash === -1 || lastDash === controlNumber.length - 1) {
    return { series: null, number: null };
  }

  const series  = controlNumber.substring(0, lastDash);
  const rawNum  = controlNumber.substring(lastDash + 1);
  const parsed  = parseInt(rawNum, 10);
  const number  = isNaN(parsed) ? null : String(parsed);

  return { series, number };
}
