import { afterEach, describe, expect, it, vi } from "vitest";
import { businessDateKey, calendarDateKey, formatBusinessDateTime, formatCalendarDate, parseCalendarDate } from "./business-date";
import { formatDateLabel } from "./format-date-label";
import { getQuickPeriodRange, dateOnly } from "@/modules/commerce/reports/utils/report-date-range";
import { formatSvDateTime, svStartOfDay, svEndOfDay } from "@/modules/commerce/inventory/utils/sv-datetime";

afterEach(() => vi.useRealTimers());
describe("fechas documentales y horas operativas", () => {
  it.each(["2026-11-16", "2026-11-04", "2026-01-01", "2024-02-29"])("conserva la fecha SQL %s sin conversión de zona", key => {
    expect(calendarDateKey(parseCalendarDate(key))).toBe(key);
    const [y, m, d] = key.split("-");
    expect(formatCalendarDate(parseCalendarDate(key))).toBe(`${d}-${m}-${y}`);
    expect(formatCalendarDate(`${key}T00:00:00.000Z`)).toBe(`${d}-${m}-${y}`);
    expect(dateOnly(key).toISOString()).toBe(`${key}T00:00:00.000Z`);
  });
  it("reproduce las capturas de REC y muestra la actualización en la misma zona que movimientos", () => {
    expect(formatCalendarDate("2026-11-16T00:00:00.000Z")).toBe("16-11-2026");
    const instant = new Date("2026-11-17T19:17:00Z");
    expect(formatDateLabel(instant)).toBe("17/11/26 13:17");
    expect(formatSvDateTime(instant)).toBe("17/11/2026 13:17");
  });
  it("respeta medianoche local sin depender del día UTC", () => {
    expect(businessDateKey("2026-11-18T02:00:00Z")).toBe("2026-11-17");
    expect(formatBusinessDateTime("2026-11-18T05:59:00Z")).toBe("17/11/2026 23:59");
    expect(formatBusinessDateTime("2026-11-18T06:00:00Z")).toBe("18/11/2026 00:00");
    expect(svStartOfDay("2026-11-17").toISOString()).toBe("2026-11-17T06:00:00.000Z");
    expect(svEndOfDay("2026-11-17").toISOString()).toBe("2026-11-18T05:59:59.999Z");
  });
  it("hoy y semana respetan el día local y el cruce de mes/año", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2027-01-01T02:00:00Z"));
    expect(getQuickPeriodRange("today")).toEqual({ date_from: "2026-12-31", date_to: "2026-12-31" });
    vi.setSystemTime(new Date("2026-11-01T20:00:00Z"));
    expect(getQuickPeriodRange("week")).toEqual({ date_from: "2026-10-26", date_to: "2026-11-01" });
  });
});
