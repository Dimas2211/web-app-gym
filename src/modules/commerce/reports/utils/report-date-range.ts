import { parseCalendarDate, businessDateKey } from "@/lib/utils/business-date";
// ─────────────────────────────────────────────────────────────────
// commerce/reports — report-date-range.ts
// ─────────────────────────────────────────────────────────────────

export type QuickPeriod = "today" | "week" | "month" | "quarter" | "year";

export function dateOnly(value: string): Date {
  return parseCalendarDate(value);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function getDefaultDateRange(): { date_from: string; date_to: string } {
  return getQuickPeriodRange("month");
}

export function getQuickPeriodRange(period: QuickPeriod): { date_from: string; date_to: string } {
  const now = parseCalendarDate(businessDateKey());
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  switch (period) {
    case "today": {
      const iso = toIso(now);
      return { date_from: iso, date_to: iso };
    }
    case "week": {
      const dayOfWeek = now.getUTCDay(); // 0=sun
      const monday = new Date(Date.UTC(y, m, d - ((dayOfWeek + 6) % 7)));
      const sunday = new Date(monday.getTime() + 6 * 86400000);
      return { date_from: toIso(monday), date_to: toIso(sunday) };
    }
    case "month": {
      const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      return {
        date_from: `${y}-${pad(m + 1)}-01`,
        date_to:   `${y}-${pad(m + 1)}-${pad(lastDay)}`,
      };
    }
    case "quarter": {
      const qStart = Math.floor(m / 3) * 3;
      const qEnd   = qStart + 2;
      const lastDayQ = new Date(Date.UTC(y, qEnd + 1, 0)).getUTCDate();
      return {
        date_from: `${y}-${pad(qStart + 1)}-01`,
        date_to:   `${y}-${pad(qEnd + 1)}-${pad(lastDayQ)}`,
      };
    }
    case "year": {
      return { date_from: `${y}-01-01`, date_to: `${y}-12-31` };
    }
  }
}
