import { describe, expect, it } from "vitest";
import { gymToday, summarizeCompliance, type ExecutionRef } from "@/modules/weekly-plans/training-tracking-rules";
import {
  addMonths,
  attendanceFrequency,
  attendanceQueryStart,
  complianceInRange,
  displayablePct,
  governingSegments,
  parseProgressRange,
  planPhase,
  progressBuckets,
  upcomingOccurrences,
  type ProgressPlanInput,
} from "./progress-rules";

const exec = (day: string, date: string, s: { c?: ExecutionRef["client_status"]; t?: ExecutionRef["trainer_status"] }): ExecutionRef => ({
  plan_day_id: day,
  local_date: date,
  client_status: s.c ?? null,
  trainer_status: s.t ?? null,
});

// Plan de lunes (weekday 1) del 2026-03-02 al 2026-03-30; hoy miércoles 2026-03-11.
const MONDAYS: ProgressPlanInput = {
  id: "p1",
  start: "2026-03-02",
  end: "2026-03-30",
  days: [{ id: "d1", weekday: 1 }],
  executions: [],
};
const TODAY = "2026-03-11";

describe("GYM-5B — períodos", () => {
  it("lista blanca del período; cualquier otro valor cae en el defecto", () => {
    expect(parseProgressRange("meses")).toBe("meses");
    expect(parseProgressRange("anio")).toBe("anio");
    expect(parseProgressRange("toString")).toBe("semanas");
    expect(parseProgressRange("__proto__")).toBe("semanas");
    expect(parseProgressRange(["meses"])).toBe("semanas");
    expect(parseProgressRange(undefined)).toBe("semanas");
  });

  it("8 semanas lun–dom; la actual contiene hoy", () => {
    const b = progressBuckets("semanas", TODAY);
    expect(b).toHaveLength(8);
    expect(b[7]).toMatchObject({ start: "2026-03-09", end: "2026-03-15", isCurrent: true });
    expect(b[0]).toMatchObject({ start: "2026-01-19", end: "2026-01-25", isCurrent: false });
  });

  it("semanas que cruzan el año y un domingo como hoy", () => {
    const b = progressBuckets("semanas", "2026-01-04"); // domingo
    expect(b[7]).toMatchObject({ start: "2025-12-29", end: "2026-01-04" });
    expect(b[0].start).toBe("2025-11-10");
  });

  it("meses calendario entre años, con bisiesto", () => {
    const b = progressBuckets("anio", "2028-02-10");
    expect(b).toHaveLength(12);
    expect(b[0]).toMatchObject({ start: "2027-03-01", end: "2027-03-31" });
    expect(b[11]).toMatchObject({ start: "2028-02-01", end: "2028-02-29", isCurrent: true });
    expect(progressBuckets("meses", "2026-01-31")[0]).toMatchObject({ start: "2025-08-01", end: "2025-08-31" });
    expect(addMonths("2026-01-01", -13)).toBe("2024-12-01");
  });

  it("DST: el día local sale de la zona del gimnasio, nunca de UTC", () => {
    // 2026-03-08 cambio de horario en New York. 03:30Z del 9 = 23:30 EDT del 8.
    expect(gymToday("America/New_York", new Date("2026-03-09T03:30:00Z"))).toBe("2026-03-08");
    expect(progressBuckets("semanas", "2026-03-08")[7].start).toBe("2026-03-02");
    // El Salvador (UTC−6): 05:30Z del 12 sigue siendo el 11 local.
    expect(gymToday("America/El_Salvador", new Date("2026-03-12T05:30:00Z"))).toBe("2026-03-11");
    expect(gymToday(null)).toBeNull();
  });
});

describe("GYM-5B — cumplimiento (fórmula única de GYM-5A)", () => {
  it("parcial = 0,5; autorreporte sin entrenador cuenta y se marca como no verificado", () => {
    const c = complianceInRange(
      [{ ...MONDAYS, executions: [exec("d1", "2026-03-02", { t: "completed" }), exec("d1", "2026-03-09", { c: "partial" })] }],
      { start: "2026-01-01", end: TODAY },
      TODAY
    );
    expect(c).toMatchObject({ scheduled: 2, completed: 1, partial: 1, skipped: 0, pending: 0, selfReportedOnly: 1, compliancePct: 75, sufficiency: "OK" });
  });

  it("el estado del entrenador prevalece sobre el autorreporte", () => {
    const c = complianceInRange(
      [{ ...MONDAYS, executions: [exec("d1", "2026-03-02", { c: "completed", t: "skipped" })] }],
      { start: "2026-03-01", end: TODAY },
      TODAY
    );
    expect(c).toMatchObject({ completed: 0, skipped: 1, selfReportedOnly: 0, pending: 1, compliancePct: 0, sufficiency: "OK" });
  });

  it("coincide exactamente con summarizeCompliance de GYM-5A en el período completo", () => {
    const executions = [exec("d1", "2026-03-02", { t: "partial" }), exec("d1", "2026-03-09", { c: "skipped" })];
    const s = summarizeCompliance(MONDAYS.days, { start: MONDAYS.start, end: MONDAYS.end }, TODAY, executions);
    const c = complianceInRange([{ ...MONDAYS, executions }], { start: MONDAYS.start, end: MONDAYS.end }, TODAY);
    expect(c).toMatchObject({ scheduled: s.scheduled, completed: s.completed, partial: s.partial, skipped: s.skipped, pending: s.pending, compliancePct: s.compliancePct });
  });

  it("las fechas futuras no entran en el denominador", () => {
    const c = complianceInRange([MONDAYS], { start: "2026-03-01", end: "2026-03-31" }, TODAY);
    expect(c.scheduled).toBe(2); // 02 y 09; 16, 23, 30 son futuros
    expect(upcomingOccurrences(MONDAYS, TODAY)).toBe(3);
  });

  it("sin registros: hay conteo pero el porcentaje no se muestra (no un 0% engañoso)", () => {
    const c = complianceInRange([MONDAYS], { start: "2026-03-01", end: TODAY }, TODAY);
    expect(c).toMatchObject({ scheduled: 2, pending: 2, compliancePct: 0, sufficiency: "NO_RECORDS" });
    expect(displayablePct(c)).toBeNull();
  });

  it("sin plan o plan futuro: sin datos suficientes", () => {
    expect(complianceInRange([], { start: "2026-01-01", end: TODAY }, TODAY).sufficiency).toBe("NONE_SCHEDULED");
    const future = { ...MONDAYS, start: "2026-04-06", end: "2026-04-27" };
    const c = complianceInRange([future], { start: "2026-01-01", end: TODAY }, TODAY);
    expect(c).toMatchObject({ scheduled: 0, compliancePct: null, sufficiency: "NONE_SCHEDULED" });
  });

  it("varios planes: cada uno con su período; se suman conteos (no se promedian %)", () => {
    const a: ProgressPlanInput = { ...MONDAYS, executions: [exec("d1", "2026-03-02", { t: "completed" }), exec("d1", "2026-03-09", { t: "completed" })] };
    // Febrero: martes y viernes (8 ocurrencias), solo 1 completada.
    const b: ProgressPlanInput = {
      id: "p2",
      start: "2026-02-02",
      end: "2026-02-27",
      days: [{ id: "e2", weekday: 2 }, { id: "e5", weekday: 5 }],
      executions: [exec("e5", "2026-02-06", { t: "completed" })],
    };
    const c = complianceInRange([a, b], { start: "2026-01-01", end: TODAY }, TODAY);
    expect(c).toMatchObject({ scheduled: 10, completed: 3 });
    expect(c.compliancePct).toBe(30); // 3/10, no (100 + 12,5) / 2
  });

  it("recorta al intervalo: una semana solo cuenta sus ocurrencias", () => {
    const a: ProgressPlanInput = { ...MONDAYS, executions: [exec("d1", "2026-03-02", { t: "completed" })] };
    expect(complianceInRange([a], { start: "2026-03-09", end: "2026-03-15" }, TODAY)).toMatchObject({ scheduled: 1, completed: 0, sufficiency: "NO_RECORDS" });
    expect(complianceInRange([a], { start: "2026-03-02", end: "2026-03-08" }, TODAY)).toMatchObject({ scheduled: 1, completed: 1, compliancePct: 100 });
  });

  it("ejecuciones fuera del período del plan (plan acortado) no cuentan", () => {
    const a: ProgressPlanInput = { ...MONDAYS, end: "2026-03-05", executions: [exec("d1", "2026-03-09", { t: "completed" })] };
    expect(complianceInRange([a], { start: "2026-03-01", end: TODAY }, TODAY)).toMatchObject({ scheduled: 1, completed: 0 });
  });

  it("fase del plan", () => {
    expect(planPhase({ start: "2026-03-02", end: "2026-03-30", status: "active" }, TODAY)).toBe("CURRENT");
    expect(planPhase({ start: "2026-03-12", end: "2026-03-30", status: "active" }, TODAY)).toBe("UPCOMING");
    expect(planPhase({ start: "2026-02-02", end: "2026-03-10", status: "active" }, TODAY)).toBe("FINISHED");
    expect(planPhase({ start: "2026-03-02", end: "2026-03-30", status: "inactive" }, TODAY)).toBe("INACTIVE");
  });
});

describe("GYM-5B — frecuencia de asistencia confirmada", () => {
  const buckets = progressBuckets("semanas", TODAY);

  it("attended y late cuentan; absent aparte; cancelled no; duplicados una vez; futuras no", () => {
    const f = attendanceFrequency(
      [
        { id: "a1", date: "2026-03-02", status: "attended" },
        { id: "a1", date: "2026-03-02", status: "attended" },
        { id: "a2", date: "2026-03-04", status: "late" },
        { id: "a3", date: "2026-03-09", status: "absent" },
        { id: "a4", date: "2026-03-10", status: "cancelled" },
        { id: "a5", date: "2026-03-12", status: "attended" },
        { id: "a6", date: "2026-02-10", status: "attended" },
      ],
      buckets,
      TODAY
    );
    expect(f).toMatchObject({ confirmed: 3, late: 1, absent: 1, thisWeek: 0, thisMonth: 2, weeks: 8 });
    expect(f.weeklyAverage).toBe(0.4); // 3 / 8
    expect(f.perBucket[6]).toMatchObject({ start: "2026-03-02", confirmed: 2, late: 1 });
    expect(f.perBucket.reduce((n, b) => n + b.confirmed, 0)).toBe(3);
  });

  it("sin asistencias: promedio null (no se presenta como frecuencia 0)", () => {
    const f = attendanceFrequency([], buckets, TODAY);
    expect(f).toMatchObject({ confirmed: 0, weeklyAverage: null });
  });

  it("límite de período: lo anterior al primer intervalo no suma al período pero sí al mes", () => {
    const monthly = progressBuckets("meses", TODAY);
    const f = attendanceFrequency([{ id: "x", date: "2025-09-30", status: "attended" }, { id: "y", date: "2025-10-01", status: "late" }], monthly, TODAY);
    expect(f).toMatchObject({ confirmed: 1, late: 1 });
    expect(f.weeks).toBe(24); // semanas lun–dom del 2025-09-29 al 2026-03-09
    const w = progressBuckets("semanas", "2026-03-31");
    expect(attendanceQueryStart(w, "2026-03-31")).toBe("2026-02-09");
    expect(attendanceQueryStart(progressBuckets("semanas", "2026-01-31"), "2026-01-31")).toBe("2025-12-08");
  });
});

describe("GYM-5B — inicio del seguimiento (métricas históricas)", () => {
  const plan: ProgressPlanInput = {
    ...MONDAYS,
    executions: [exec("d1", "2026-03-02", { t: "completed" })],
  };

  it("antes del inicio solo cuentan las ocurrencias con registro; el resto va a untracked", () => {
    // Lunes vencidos: 02 (completado) y 09 (sin registro). Inicio del seguimiento: 05-mar.
    const c = complianceInRange([plan], { start: "2026-03-02", end: "2026-03-30" }, TODAY, { trackingStart: "2026-03-05" });
    expect(c).toMatchObject({ scheduled: 2, completed: 1, pending: 1, untracked: 0, compliancePct: 50 });
    const late = complianceInRange([{ ...plan, executions: [] }], { start: "2026-03-02", end: "2026-03-30" }, TODAY, { trackingStart: "2026-03-05" });
    expect(late).toMatchObject({ scheduled: 1, pending: 1, untracked: 1, sufficiency: "NO_RECORDS" });
  });

  it("inicio posterior a hoy (sin registros en el tenant): nada vencido cuenta sin registro", () => {
    const c = complianceInRange([{ ...plan, executions: [] }], { start: "2026-03-02", end: "2026-03-30" }, TODAY, { trackingStart: "2026-03-12" });
    expect(c).toMatchObject({ scheduled: 0, untracked: 2, compliancePct: null, sufficiency: "NONE_SCHEDULED" });
  });

  it("un registro retroactivo anterior al inicio sí cuenta (en numerador y denominador)", () => {
    const c = complianceInRange([plan], { start: "2026-03-02", end: "2026-03-30" }, TODAY, { trackingStart: "2026-03-10" });
    expect(c).toMatchObject({ scheduled: 1, completed: 1, untracked: 1, compliancePct: 100 });
  });

  it("sin corte el resultado es idéntico a summarizeCompliance (GYM-5A)", () => {
    const base = summarizeCompliance(plan.days, { start: plan.start, end: plan.end }, TODAY, plan.executions);
    const c = complianceInRange([plan], { start: plan.start, end: plan.end }, TODAY, { trackingStart: plan.start });
    expect(c.scheduled).toBe(base.scheduled);
    expect(c.compliancePct).toBe(base.compliancePct);
    expect(c.untracked).toBe(0);
  });
});

describe("GYM-5B — planes solapados", () => {
  it("el plan de mayor precedencia gobierna las fechas compartidas", () => {
    const seg = governingSegments([
      { id: "new", start: "2026-03-09", end: "2026-04-05" },
      { id: "old", start: "2026-03-02", end: "2026-03-29" },
      { id: "inner", start: "2026-03-01", end: "2026-04-30" },
    ]);
    expect(seg.get("new")).toEqual([{ start: "2026-03-09", end: "2026-04-05" }]);
    expect(seg.get("old")).toEqual([{ start: "2026-03-02", end: "2026-03-08" }]);
    expect(seg.get("inner")).toEqual([
      { start: "2026-03-01", end: "2026-03-01" },
      { start: "2026-04-06", end: "2026-04-30" },
    ]);
  });

  it("planes sin solape conservan su período completo; plan totalmente cubierto queda sin tramos", () => {
    const seg = governingSegments([
      { id: "a", start: "2026-03-01", end: "2026-03-31" },
      { id: "b", start: "2026-02-01", end: "2026-02-28" },
      { id: "c", start: "2026-03-10", end: "2026-03-20" },
    ]);
    expect(seg.get("b")).toEqual([{ start: "2026-02-01", end: "2026-02-28" }]);
    expect(seg.get("c")).toEqual([]);
  });

  it("una fecha compartida cuenta una sola vez en el agregado", () => {
    const newer: ProgressPlanInput = { id: "n", start: "2026-03-09", end: "2026-04-05", days: [{ id: "dn", weekday: 1 }], executions: [exec("dn", "2026-03-09", { t: "completed" })] };
    const older: ProgressPlanInput = {
      ...MONDAYS,
      executions: [exec("d1", "2026-03-02", { t: "completed" }), exec("d1", "2026-03-09", { t: "skipped" })],
    };
    const seg = governingSegments([newer, older]);
    const plans = [newer, older].map((p) => ({ ...p, segments: seg.get(p.id) }));
    const c = complianceInRange(plans, { start: "2026-03-01", end: "2026-03-31" }, TODAY);
    expect(c).toMatchObject({ scheduled: 2, completed: 2, skipped: 0, compliancePct: 100 });
    const naive = complianceInRange([newer, older], { start: "2026-03-01", end: "2026-03-31" }, TODAY);
    expect(naive.scheduled).toBe(3);
  });
});
