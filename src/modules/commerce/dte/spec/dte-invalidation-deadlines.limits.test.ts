// MH20 — Fase 9.0: límites temporales del Evento de Invalidación v3.
// Fuentes verificadas visualmente (Fase 9.0): N2.0 regla 13.1.1 y Cuadro 6
// (p.28), Anexo V campo 9 núm. 4-8 (pp.123-124), MF pp. impresas 11-12.
//
//   Fecha del EVENTO (generación):
//     - distintos de FE/FEXE/FSEE → misma fecha que la generación del invalidado
//     - FE/FEXE/FSEE → desde la generación hasta 3 meses después
//   Plazo de TRANSMISIÓN:
//     - FE/FEXE/FSEE → 3 meses desde el sello (campo 9 núm. 6)
//     - resto → INC-004 abierto (solo advertencia PROVISIONAL en TEST)
//   Ninguna regla de PRODUCTION se resuelve aquí (INV_DEADLINE_UNSET).

import { describe, expect, it } from "vitest";
import { addMonthsClampedIso, evaluateInvalidationDeadline, resolveInvalidationEventDate } from "./dte-invalidation-deadlines";

/** Instante UTC para una hora local de El Salvador (UTC-6). */
const sv = (date: string, time = "12:00:00") => new Date(`${date}T${time}-06:00`);

describe("addMonthsClampedIso (ejemplos oficiales MF p. impresa 12)", () => {
  it.each([
    ["2025-10-09", "2026-01-09"],
    ["2025-11-25", "2026-02-25"],
    ["2025-11-30", "2026-02-28"],   // MF: 30-11-2025 → 28-02-2026
    ["2026-01-09", "2026-04-09"],   // MF p.11: 09-01-2026 → 09-04-2026
    ["2027-11-30", "2028-02-29"],   // año bisiesto
    ["2026-08-31", "2026-11-30"],
  ])("%s + 3 meses = %s", (from, to) => expect(addMonthsClampedIso(from, 3)).toBe(to));
});

describe("Fecha del evento — FE/FEXE/FSEE (hasta 3 meses desde la generación)", () => {
  it.each(["01", "11", "14"])("tipo %s: mismo día de generación → permitido", (t) => {
    expect(resolveInvalidationEventDate({ targetType: t, targetFecEmi: "2025-10-09", now: sv("2025-10-09", "00:00:01") }))
      .toEqual({ ok: true, fecEmi: "2025-10-09", rule: "WITHIN_3_MONTHS" });
  });
  it.each(["01", "11", "14"])("tipo %s: último día de la ventana (09-01-2026) permitido; día siguiente fuera", (t) => {
    expect(resolveInvalidationEventDate({ targetType: t, targetFecEmi: "2025-10-09", now: sv("2026-01-09", "23:59:59") }))
      .toMatchObject({ ok: true, fecEmi: "2026-01-09" });
    expect(resolveInvalidationEventDate({ targetType: t, targetFecEmi: "2025-10-09", now: sv("2026-01-10", "00:00:00") }))
      .toMatchObject({ ok: false, code: "INV_EVENT_DATE_OUT_OF_WINDOW" });
  });
  it("fin de mes: generación 30-11-2025 → límite 28-02-2026 (antes desbordaba a 02-03)", () => {
    expect(resolveInvalidationEventDate({ targetType: "01", targetFecEmi: "2025-11-30", now: sv("2026-02-28") })).toMatchObject({ ok: true });
    expect(resolveInvalidationEventDate({ targetType: "01", targetFecEmi: "2025-11-30", now: sv("2026-03-01") }))
      .toMatchObject({ ok: false, code: "INV_EVENT_DATE_OUT_OF_WINDOW" });
  });
  it("zona horaria: 23:59:59 SV del último día es válido aunque en UTC ya sea el día siguiente", () => {
    const now = sv("2026-01-09", "23:59:59");
    expect(now.toISOString().slice(0, 10)).toBe("2026-01-10");
    expect(resolveInvalidationEventDate({ targetType: "11", targetFecEmi: "2025-10-09", now })).toMatchObject({ ok: true, fecEmi: "2026-01-09" });
  });
  it("evento anterior a la generación → error", () => {
    expect(resolveInvalidationEventDate({ targetType: "14", targetFecEmi: "2026-11-26", now: sv("2026-11-25", "23:00:00") }))
      .toMatchObject({ ok: false, code: "INV_EVENT_DATE_BEFORE_TARGET" });
  });
});

describe("Fecha del evento — distintos de FE/FEXE/FSEE (misma fecha que la generación)", () => {
  it.each(["03", "05", "18", "17"])("tipo %s: se consigna la fecha de generación aunque se transmita días después", (t) => {
    // MF p.11: generación 29-03-2026, transmitido 04-04-2026 → fecha del evento 29-03-2026.
    expect(resolveInvalidationEventDate({ targetType: t, targetFecEmi: "2026-03-29", now: sv("2026-04-04") }))
      .toEqual({ ok: true, fecEmi: "2026-03-29", rule: "SAME_AS_TARGET" });
  });
  it("fecha mal formada → error explícito", () => {
    expect(resolveInvalidationEventDate({ targetType: "03", targetFecEmi: "29-03-2026", now: sv("2026-04-04") }))
      .toMatchObject({ ok: false, code: "INV_EVENT_DATE_INVALID_TARGET" });
  });
});

describe("Plazo de transmisión (TEST, solo advertencias PROVISIONAL)", () => {
  const base = { profile: "MH_2_0" as const, environment: "TEST" };

  it("FE/FEXE/FSEE: se mide desde el SELLO, no desde la generación (campo 9 núm. 6)", () => {
    // MF p.12: generación 09-10-2025, transmitido 25-11-2025 → transmitir hasta 25-02-2026.
    const p = { ...base, targetFecEmi: "2025-10-09", stampedAt: sv("2025-11-25", "08:00:00") };
    for (const t of ["01", "11", "14"]) {
      expect(evaluateInvalidationDeadline({ ...p, targetType: t, now: sv("2026-02-25", "23:59:59") }))
        .toEqual({ ok: true, enforced: false, warnings: [] });
      const late = evaluateInvalidationDeadline({ ...p, targetType: t, now: sv("2026-02-26", "00:00:01") });
      expect(late.ok && late.warnings.join(" ")).toMatch(/3 meses desde el sello \(límite 2026-02-25\)/);
    }
  });
  it("fin de mes en el sello: 30-11-2025 → límite 28-02-2026 (MF p.12)", () => {
    const p = { ...base, targetType: "01", targetFecEmi: "2025-10-09", stampedAt: sv("2025-11-30") };
    expect(evaluateInvalidationDeadline({ ...p, now: sv("2026-02-28") })).toEqual({ ok: true, enforced: false, warnings: [] });
    const late = evaluateInvalidationDeadline({ ...p, now: sv("2026-03-01") });
    expect(late.ok && late.warnings.length).toBe(1);
  });
  it("CCF/NC: INC-004 sigue abierto — se conserva la advertencia más restrictiva (1 día) sin bloquear", () => {
    const stampedAt = sv("2026-03-09", "07:30:00");
    const r = evaluateInvalidationDeadline({ ...base, targetType: "03", targetFecEmi: "2026-03-09", stampedAt, now: sv("2026-03-12") });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.join(" ")).toMatch(/PROVISIONAL \(INC-004\)/);
  });
  it.each(["01", "03", "05", "11", "14", "18"])("PRODUCTION tipo %s: siempre INV_DEADLINE_UNSET (no se resuelve INC-004)", (t) => {
    const r = evaluateInvalidationDeadline({ profile: "MH_2_0", environment: "PRODUCTION", targetType: t, targetFecEmi: "2026-03-09", stampedAt: sv("2026-03-09"), now: sv("2026-03-09") });
    expect(r).toMatchObject({ ok: false, code: "INV_DEADLINE_UNSET" });
  });
  it("MH_1_2 sin cambios: no evalúa plazos", () => {
    expect(evaluateInvalidationDeadline({ profile: "MH_1_2", environment: "PRODUCTION", targetType: "01", targetFecEmi: "2020-01-01", stampedAt: sv("2020-01-01"), now: sv("2026-11-25") }))
      .toEqual({ ok: true, enforced: false, warnings: [] });
  });
});
