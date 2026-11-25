import { formatBusinessDateTime } from "@/lib/utils/business-date";
// ─────────────────────────────────────────────────────────────────
// commerce/inventory — sv-datetime.ts
//
// Fechas de la consulta de movimientos en hora de El Salvador
// (America/El_Salvador = UTC-6, sin horario de verano).
//
// Comparte el formateador explícito de commerce y auditoría; no depende
// de la zona del servidor ni del navegador. Los límites de filtros cubren
// el día local completo. Las fechas SQL DATE usan un helper distinto.
// ─────────────────────────────────────────────────────────────────

const DATE_PARAM_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** dd/mm/aaaa HH:mm en hora de El Salvador. */
export function formatSvDateTime(date: Date): string {
  return formatBusinessDateTime(date);
}

/** "aaaa-mm-dd" → "dd/mm/aaaa" (sin conversión de zona: es una fecha de calendario). */
export function formatSvDateParam(value: string): string {
  const m = DATE_PARAM_RE.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

/** Valida un parámetro "aaaa-mm-dd" con fecha de calendario real. */
export function isValidDateParam(value: string): boolean {
  const m = DATE_PARAM_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

/** Inicio del día local de El Salvador (00:00:00.000) como instante UTC. */
export function svStartOfDay(value: string): Date {
  return new Date(`${value}T00:00:00.000-06:00`);
}

/** Fin del día local de El Salvador (23:59:59.999) como instante UTC. */
export function svEndOfDay(value: string): Date {
  return new Date(`${value}T23:59:59.999-06:00`);
}
