// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-fiscal-year.ts
//
// COR-01 / COR-02 — ejercicio fiscal de un DTE según la hora de
// El Salvador (UTC−6, sin horario de verano), nunca según la zona
// horaria del proceso.
//
// Conectado a dte-correlative.service.ts (reserva, piso, estado y
// alineación por año) y a los generadores JSON (guarda de año fiscal).
// Ver docs/fiscal/mh-normativa-2.0/decisiones/COR-01-reinicio-anual.md.
// Puro y sin BD.
// ─────────────────────────────────────────────────────────────────

const SV_OFFSET_MS = 6 * 60 * 60 * 1000; // America/El_Salvador = UTC−6 fijo

/** Año fiscal (ejercicio impositivo) en hora de El Salvador. */
export function fiscalYearInElSalvador(now: Date): number {
  return new Date(now.getTime() - SV_OFFSET_MS).getUTCFullYear();
}

/** Año fiscal desde `identificacion.fecEmi` (YYYY-MM-DD). */
export function fiscalYearFromFecEmi(fecEmi: string | null | undefined): number | null {
  if (!fecEmi || !/^\d{4}-\d{2}-\d{2}$/.test(fecEmi)) return null;
  return Number(fecEmi.slice(0, 4));
}

export const DTE_FISCAL_YEAR_MISMATCH = "DTE_FISCAL_YEAR_MISMATCH" as const;

/**
 * Guarda de generación (COR-01): el numeroControl de un documento se reservó
 * en la secuencia de un ejercicio fiscal concreto. No se puede emitir con un
 * `fecEmi` de otro ejercicio, porque ese número pertenece a la secuencia del
 * año anterior y podría coincidir con uno del año nuevo.
 *
 * - `fiscal_year` persistido → manda.
 * - Documento heredado sin `fiscal_year` (anterior a M-COR-01 y ambiguo en el
 *   backfill) → se usa el año SV de `created_at` (momento de la reserva) solo
 *   para comparar; no se escribe nada.
 *
 * El documento NO se renumera ni se regenera con otro número: el operador debe
 * cancelarlo (CANCELLED, previo a generación) y emitir uno nuevo.
 */
export function checkDteFiscalYearForGeneration(
  doc: { fiscal_year?: number | null; created_at?: Date | null; control_number?: string | null },
  now: Date,
): { ok: true; fiscal_year: number } | { ok: false; code: typeof DTE_FISCAL_YEAR_MISMATCH; error: string } {
  const emissionYear = fiscalYearInElSalvador(now);
  const reservedYear = doc.fiscal_year ?? (doc.created_at ? fiscalYearInElSalvador(doc.created_at) : null);
  if (reservedYear == null || reservedYear === emissionYear) return { ok: true, fiscal_year: emissionYear };
  return {
    ok:    false,
    code:  DTE_FISCAL_YEAR_MISMATCH,
    error:
      `El numeroControl ${doc.control_number ?? ""} se reservó en el ejercicio fiscal ${reservedYear} ` +
      `y la emisión caería en ${emissionYear} (hora de El Salvador). El correlativo reinicia cada año: ` +
      `cancele este documento pendiente y genere uno nuevo. No se renumera automáticamente.`,
  };
}
