/** Calendar dates (@db.Date) and instants have different conversion rules.
 * Commerce currently operates in El Salvador. Never use the host/browser zone.
 */
export const BUSINESS_TIME_ZONE = "America/El_Salvador";

/** Canonical YYYY-MM-DD for a SQL DATE; no timezone conversion. */
export function calendarDateKey(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

export function parseCalendarDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** dd-mm-yyyy, identical in the server, browser, reports and exports. */
export function formatCalendarDate(value: Date | string): string {
  const [year, month, day] = calendarDateKey(value).split("-");
  return `${day}-${month}-${year}`;
}

/** Calendar day of a real instant in the operational timezone. */
export function businessDateKey(value: Date | string = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Stable 24-hour display for audit/transaction timestamps. */
export function formatBusinessDateTime(value: Date | string, shortYear = false): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const year = shortYear ? part("year").slice(-2) : part("year");
  return `${part("day")}/${part("month")}/${year} ${part("hour")}:${part("minute")}`;
}
