// ─────────────────────────────────────────────────────────────────
// commerce/reports — report-date-range.ts
// ─────────────────────────────────────────────────────────────────

export type QuickPeriod = "today" | "week" | "month" | "quarter" | "year";

export function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getDefaultDateRange(): { date_from: string; date_to: string } {
  return getQuickPeriodRange("month");
}

export function getQuickPeriodRange(period: QuickPeriod): { date_from: string; date_to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  switch (period) {
    case "today": {
      const iso = toIso(now);
      return { date_from: iso, date_to: iso };
    }
    case "week": {
      const dayOfWeek = now.getDay(); // 0=sun
      const monday = new Date(y, m, d - ((dayOfWeek + 6) % 7));
      const sunday = new Date(y, m, monday.getDate() + 6);
      return { date_from: toIso(monday), date_to: toIso(sunday) };
    }
    case "month": {
      const lastDay = new Date(y, m + 1, 0).getDate();
      return {
        date_from: `${y}-${pad(m + 1)}-01`,
        date_to:   `${y}-${pad(m + 1)}-${pad(lastDay)}`,
      };
    }
    case "quarter": {
      const qStart = Math.floor(m / 3) * 3;
      const qEnd   = qStart + 2;
      const lastDayQ = new Date(y, qEnd + 1, 0).getDate();
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
