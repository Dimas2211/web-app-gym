// ─────────────────────────────────────────────────────────────────
// commerce/inventory — sv-datetime.ts
//
// Fechas de la consulta de movimientos en hora de El Salvador
// (America/El_Salvador = UTC-6, sin horario de verano).
//
// Por qué aritmética fija y no la zona del servidor:
//   formatDateLabel() usa la zona local del proceso Node. En
//   producción el servidor corre en UTC, por lo que un movimiento
//   registrado a las 17:30 en San Salvador se mostraba como 23:30.
//   Aquí se fija el desfase para que pantalla, Excel y PDF muestren
//   la misma hora operativa, y para que el filtro Desde/Hasta cubra
//   el día local completo.
// ─────────────────────────────────────────────────────────────────

const SV_OFFSET_MS = -6 * 60 * 60 * 1000;
const DATE_PARAM_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** dd/mm/aaaa HH:mm en hora de El Salvador. */
export function formatSvDateTime(date: Date): string {
  const d = new Date(new Date(date).getTime() + SV_OFFSET_MS);
  return (
    `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
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
