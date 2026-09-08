import { describe, it, expect } from "vitest";
import { resolveDteMonthlyPeriodKey, isValidIanaTimeZone } from "./dte-fiscal-period.util";

describe("isValidIanaTimeZone", () => {
  it("acepta America/El_Salvador", () => {
    expect(isValidIanaTimeZone("America/El_Salvador")).toBe(true);
  });

  it("acepta un timezone con DST (America/New_York)", () => {
    expect(isValidIanaTimeZone("America/New_York")).toBe(true);
  });

  it("rechaza null/undefined/vacío", () => {
    expect(isValidIanaTimeZone(null)).toBe(false);
    expect(isValidIanaTimeZone(undefined)).toBe(false);
    expect(isValidIanaTimeZone("")).toBe(false);
    expect(isValidIanaTimeZone("   ")).toBe(false);
  });

  it("rechaza una zona inventada", () => {
    expect(isValidIanaTimeZone("Mars/Colonia_Uno")).toBe(false);
    expect(isValidIanaTimeZone("UTC+5")).toBe(false);
  });
});

describe("resolveDteMonthlyPeriodKey", () => {
  it("resuelve 2026-09 para America/El_Salvador a mitad de mes", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    const result = resolveDteMonthlyPeriodKey(now, "America/El_Salvador");
    expect(result).toEqual({ ok: true, periodKey: "2026-09" });
  });

  it("borde: fin de mes local antes de medianoche UTC — El Salvador (UTC-6, sin DST) sigue en el mes local, no en el siguiente", () => {
    // 2026-09-30 23:59 America/El_Salvador == 2026-10-01 05:59 UTC
    const now = new Date("2026-10-01T05:59:00.000Z");
    const result = resolveDteMonthlyPeriodKey(now, "America/El_Salvador");
    expect(result).toEqual({ ok: true, periodKey: "2026-09" });
  });

  it("borde: primer instante del mes local siguiente ya cuenta como el mes nuevo", () => {
    // 2026-10-01 00:00 America/El_Salvador == 2026-10-01 06:00 UTC
    const now = new Date("2026-10-01T06:00:00.000Z");
    const result = resolveDteMonthlyPeriodKey(now, "America/El_Salvador");
    expect(result).toEqual({ ok: true, periodKey: "2026-10" });
  });

  it("timezone con DST (America/New_York) resuelve el mes local correctamente en horario de verano", () => {
    // 2026-07-04 04:30 UTC == 2026-07-04 00:30 EDT (UTC-4 en julio)
    const now = new Date("2026-07-04T04:30:00.000Z");
    const result = resolveDteMonthlyPeriodKey(now, "America/New_York");
    expect(result).toEqual({ ok: true, periodKey: "2026-07" });
  });

  it("timezone con DST (America/New_York) resuelve el mes local correctamente en horario estándar", () => {
    // 2026-01-04 04:30 UTC == 2026-01-03 23:30 EST (UTC-5 en enero)
    const now = new Date("2026-01-04T04:30:00.000Z");
    const result = resolveDteMonthlyPeriodKey(now, "America/New_York");
    expect(result).toEqual({ ok: true, periodKey: "2026-01" });
  });

  it("timezone inválido -> ok:false, error explícito, nunca asume UTC", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    const result = resolveDteMonthlyPeriodKey(now, "No/Existe");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/no es una zona IANA válida/);
    }
  });

  it("timezone faltante (null) -> ok:false, error explícito, nunca asume El Salvador", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    const result = resolveDteMonthlyPeriodKey(now, null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/no tiene timezone configurado/);
    }
  });

  it("timezone faltante (string vacío) -> ok:false", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    const result = resolveDteMonthlyPeriodKey(now, "");
    expect(result.ok).toBe(false);
  });
});
