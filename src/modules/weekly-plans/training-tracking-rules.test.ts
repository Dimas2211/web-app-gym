import { describe, expect, it } from "vitest";
import {
  CLIENT_REPORT_WINDOW_DAYS,
  addDays,
  checkClientReportDate,
  checkTrainerRecordDate,
  countDistinctActivities,
  effectiveStatus,
  gymToday,
  isIsoDate,
  occurrenceDates,
  summarizeCompliance,
  weekdayOf,
} from "./training-tracking-rules";

describe("calendario", () => {
  it("valida fechas reales y rechaza formatos ambiguos", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
    expect(isIsoDate("03/02/2026")).toBe(false);
  });

  it("weekday 0=domingo y aritmética de días sin saltos", () => {
    expect(weekdayOf("2026-03-01")).toBe(0);
    expect(weekdayOf("2026-03-02")).toBe(1);
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-03-08", -7)).toBe("2026-03-01");
  });

  it("ocurrencias semanales de un mismo weekday: lunes 5, 12 y 19 son entradas independientes", () => {
    expect(occurrenceDates("2026-01-01", "2026-01-31", 1)).toEqual(["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"]);
    expect(occurrenceDates("2026-01-06", "2026-01-31", 1)[0]).toBe("2026-01-12");
    expect(occurrenceDates("2026-02-01", "2026-01-01", 1)).toEqual([]);
  });

  it("el cambio de horario no duplica ni omite ocurrencias (semana de DST)", () => {
    expect(occurrenceDates("2026-03-01", "2026-03-31", 0)).toEqual(["2026-03-01", "2026-03-08", "2026-03-15", "2026-03-22", "2026-03-29"]);
    expect(occurrenceDates("2026-10-25", "2026-11-08", 0)).toEqual(["2026-10-25", "2026-11-01", "2026-11-08"]);
  });
});

describe("fecha local del gimnasio (zona IANA, no UTC del servidor)", () => {
  it("America/El_Salvador (UTC−6, sin DST): 03:00Z sigue siendo el día anterior", () => {
    expect(gymToday("America/El_Salvador", new Date("2026-03-01T03:00:00Z"))).toBe("2026-02-28");
    expect(gymToday("America/El_Salvador", new Date("2026-03-01T06:00:00Z"))).toBe("2026-03-01");
  });

  it("America/New_York alrededor del inicio de DST (2026-03-08)", () => {
    expect(gymToday("America/New_York", new Date("2026-03-09T03:59:00Z"))).toBe("2026-03-08"); // 23:59 EDT
    expect(gymToday("America/New_York", new Date("2026-03-09T04:00:00Z"))).toBe("2026-03-09"); // 00:00 EDT
    expect(gymToday("America/New_York", new Date("2026-03-02T04:59:00Z"))).toBe("2026-03-01"); // 23:59 EST
    expect(gymToday("America/New_York", new Date("2026-03-02T05:00:00Z"))).toBe("2026-03-02");
  });

  it("America/New_York al terminar DST (2026-11-01)", () => {
    expect(gymToday("America/New_York", new Date("2026-11-02T04:59:00Z"))).toBe("2026-11-01"); // 23:59 EST
    expect(gymToday("America/New_York", new Date("2026-11-02T05:00:00Z"))).toBe("2026-11-02");
  });

  it("zona al este de UTC (Pacific/Auckland, DST austral)", () => {
    expect(gymToday("Pacific/Auckland", new Date("2026-01-01T12:00:00Z"))).toBe("2026-01-02");
  });

  it("zona ausente o inválida falla cerrado (null), sin asumir UTC", () => {
    expect(gymToday(null)).toBeNull();
    expect(gymToday("")).toBeNull();
    expect(gymToday("Mars/Olympus")).toBeNull();
  });
});

describe("fecha de una ejecución", () => {
  const plan = { planStart: "2026-01-01", planEnd: "2026-01-31", weekday: 1 }; // lunes
  const today = "2026-01-20"; // martes

  it("autorreporte: ocurrencia pasada dentro de la ventana", () => {
    expect(checkClientReportDate({ ...plan, today, date: "2026-01-19" })).toEqual({ ok: true });
    expect(checkClientReportDate({ ...plan, today, date: "2026-01-12" })).toEqual({ ok: true });
  });

  it("rechaza futuro, fuera del plan, weekday distinto, formato y ventana vencida", () => {
    expect(checkClientReportDate({ ...plan, today, date: "2026-01-26" })).toEqual({ ok: false, code: "FUTURE" });
    expect(checkClientReportDate({ ...plan, today: "2026-02-10", date: "2026-02-02" })).toEqual({ ok: false, code: "OUTSIDE_PLAN" });
    expect(checkClientReportDate({ ...plan, today, date: "2026-01-14" })).toEqual({ ok: false, code: "WRONG_WEEKDAY" });
    expect(checkClientReportDate({ ...plan, today, date: "19/01/2026" })).toEqual({ ok: false, code: "INVALID" });
    expect(checkClientReportDate({ ...plan, today: "2026-01-30", date: "2026-01-05" })).toEqual({ ok: false, code: "TOO_OLD" });
    expect(CLIENT_REPORT_WINDOW_DAYS).toBe(14);
  });

  it("el entrenador no está limitado por la ventana de 14 días, pero sí por futuro y período", () => {
    expect(checkTrainerRecordDate({ ...plan, today: "2026-01-30", date: "2026-01-05" })).toEqual({ ok: true });
    expect(checkTrainerRecordDate({ ...plan, today, date: "2026-01-26" })).toEqual({ ok: false, code: "FUTURE" });
  });
});

describe("estado efectivo y cumplimiento", () => {
  it("el registro del entrenador prevalece sobre el autorreporte sin borrarlo", () => {
    expect(effectiveStatus({ client_status: "completed", trainer_status: "partial" })).toEqual({ status: "partial", source: "TRAINER" });
    expect(effectiveStatus({ client_status: "completed", trainer_status: null })).toEqual({ status: "completed", source: "CLIENT_SELF_REPORT" });
    expect(effectiveStatus({ client_status: null, trainer_status: null })).toBeNull();
    expect(effectiveStatus(null)).toBeNull();
  });

  const days = [
    { id: "d1", weekday: 1 }, // lunes
    { id: "d3", weekday: 3 }, // miércoles
  ];
  const period = { start: "2026-01-05", end: "2026-01-25" }; // lunes 5 → domingo 25
  // hoy: jueves 15 → vencidos: lun 5, mié 7, lun 12, mié 14 (4); futuros: lun 19, mié 21 (2)
  const today = "2026-01-15";

  it("Lunes 5 completado, lunes 12 parcial, miércoles 7 omitido y el resto pendiente", () => {
    const s = summarizeCompliance(days, period, today, [
      { plan_day_id: "d1", local_date: "2026-01-05", client_status: null, trainer_status: "completed" },
      { plan_day_id: "d1", local_date: "2026-01-12", client_status: null, trainer_status: "partial" },
      { plan_day_id: "d3", local_date: "2026-01-07", client_status: "skipped", trainer_status: null },
    ]);
    expect(s).toMatchObject({ scheduled: 4, completed: 1, partial: 1, skipped: 1, pending: 1, upcoming: 2, selfReportedOnly: 1 });
    expect(s.compliancePct).toBe(38); // (1 + 0,5) / 4 = 37,5 → 38
  });

  it("el autorreporte cuenta como cumplimiento declarado pero se identifica como no verificado", () => {
    const s = summarizeCompliance(days, period, today, [
      { plan_day_id: "d1", local_date: "2026-01-05", client_status: "completed", trainer_status: null },
    ]);
    expect(s.completed).toBe(1);
    expect(s.selfReportedOnly).toBe(1);
  });

  it("ejecuciones fuera de lo vencido o duplicadas por clave no inflan el resultado", () => {
    const e = { plan_day_id: "d1", local_date: "2026-01-05", client_status: "completed" as const, trainer_status: null };
    const s = summarizeCompliance(days, period, today, [e, e, { ...e, local_date: "2026-01-19" }]);
    expect(s.completed).toBe(1);
  });

  it("sin entrenamientos vencidos no hay porcentaje", () => {
    expect(summarizeCompliance(days, period, "2026-01-04", []).compliancePct).toBeNull();
    expect(summarizeCompliance(days, period, "2026-01-04", []).upcoming).toBe(6);
  });

  it("plan finalizado: hoy posterior al fin solo cuenta lo programado dentro del período", () => {
    const s = summarizeCompliance(days, period, "2026-03-01", []);
    expect(s.scheduled).toBe(6);
    expect(s.upcoming).toBe(0);
    expect(s.pending).toBe(6);
  });
});

describe("actividades GYM-4 sin duplicados", () => {
  it("una actividad común cuenta una vez por sesión, no por integrante, y no se duplica con la individual", () => {
    expect(
      countDistinctActivities([
        { sessionId: "s1", common: ["warm", "squat"], individual: ["squat", "bike"] },
        { sessionId: "s2", common: ["warm"], individual: [] },
      ])
    ).toBe(4); // s1: warm, squat, bike; s2: warm
  });

  it("la misma sesión repetida no infla el total", () => {
    const s = { sessionId: "s1", common: ["warm"], individual: [] };
    expect(countDistinctActivities([s, s])).toBe(1);
  });
});
