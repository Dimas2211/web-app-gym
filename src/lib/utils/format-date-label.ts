import { formatBusinessDateTime } from "./business-date";

/** Audit timestamp in operational time, independent of server/browser timezone. */
export function formatDateLabel(date: Date): string {
  return formatBusinessDateTime(date, true);
}
