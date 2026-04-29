// ─────────────────────────────────────────────────────────────────
// lib/utils — format-date-label.ts
//
// Formateador de fecha estable para campos preformateados en mappers.
//
// Problema resuelto:
//   Intl.DateTimeFormat con opciones de hora produce caracteres Unicode
//   distintos entre Node.js (SSR) y el navegador (hydration) para
//   marcadores AM/PM y separadores de tiempo en el locale "es-CL".
//   React 18 detecta la diferencia y lanza hydration mismatch.
//
// Solución:
//   Generar el string en el mapper del servidor (una vez, entorno estable)
//   usando aritmética de Date sin Intl. El componente renderiza el string
//   directamente — sin formateo en cliente.
//
// Formato de salida: dd/mm/yy HH:mm (24h, sin locale, sin AM/PM)
//   Ejemplo: 14/04/26 15:37
// ─────────────────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Convierte un Date en un string legible, estable entre SSR y cliente.
 * Formato: dd/mm/yy HH:mm — 24h, sin dependencia de locale ni de Intl.
 *
 * Usar exclusivamente en mappers de queries (servidor).
 * Los Client Components reciben el string ya formateado y lo renderizan
 * directamente, sin llamar a ningún formateador en el cliente.
 */
export function formatDateLabel(date: Date): string {
  const d     = new Date(date);
  const day   = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year  = String(d.getFullYear()).slice(2);
  const hours = pad(d.getHours());
  const mins  = pad(d.getMinutes());
  return `${day}/${month}/${year} ${hours}:${mins}`;
}
