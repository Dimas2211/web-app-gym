// GYM-5C — reglas puras del panel del entrenador.
import { describe, expect, it } from "vitest";
import { summarizeCompliance, type ExecutionRef } from "./training-tracking-rules";
import {
  applyFollowUpFilters,
  attendanceByPlan,
  buildFollowUpRow,
  classifyOccurrences,
  compareFollowUpRows,
  FOLLOW_UP_PAGE_SIZE,
  normalizeSearch,
  parseFollowUpFilters,
  summarizeFollowUp,
  type FollowUpPlanInput,
  type FollowUpRow,
} from "./trainer-follow-up-rules";

const TODAY = "2026-03-11"; // miércoles

function exec(day: string, date: string, s: { c?: ExecutionRef["client_status"]; t?: ExecutionRef["trainer_status"] }): ExecutionRef {
  return { plan_day_id: day, local_date: date, client_status: s.c ?? null, trainer_status: s.t ?? null };
}

function plan(over: Partial<FollowUpPlanInput> & { id: string }): FollowUpPlanInput {
  return {
    clientId: `cli-${over.id}`,
    firstName: "Ana",
    lastName: `Pérez ${over.id}`,
    planName: "Fuerza",
    branchName: "Centro",
    start: "2026-03-02",
    end: "2026-03-29",
    status: "active",
    createdAt: 0,
    days: [
      { id: `${over.id}-mon`, weekday: 1, sessionName: "Piernas" },
      { id: `${over.id}-wed`, weekday: 3, sessionName: "Torso" },
    ],
    executions: [],
    ...over,
  };
}

const FILTERS = parseFollowUpFilters({});

describe("classifyOccurrences", () => {
  it("distingue sin registro, por revisar y revisado; las futuras no aparecen", () => {
    const p = plan({
      id: "a",
      executions: [exec("a-mon", "2026-03-02", { t: "completed" }), exec("a-wed", "2026-03-04", { c: "partial" }), exec("a-mon", "2026-03-09", { c: "completed", t: "skipped" })],
    });
    const out = classifyOccurrences(p, [{ start: p.start, end: p.end }], TODAY);
    expect(out.map((o) => `${o.date}:${o.state}`).sort()).toEqual([
      "2026-03-02:REVISADO",
      "2026-03-04:POR_REVISAR",
      "2026-03-09:REVISADO",
      "2026-03-11:SIN_REGISTRO",
    ]);
  });
});

describe("buildFollowUpRow — misma cifra que GYM-5A", () => {
  it("conteos y porcentaje iguales a summarizeCompliance del plan completo", () => {
    const p = plan({
      id: "b",
      executions: [exec("b-mon", "2026-03-02", { t: "completed" }), exec("b-wed", "2026-03-04", { t: "partial" }), exec("b-mon", "2026-03-09", { c: "completed" })],
    });
    const row = buildFollowUpRow(p, TODAY, { metrics: true, attendance: null });
    const a5 = summarizeCompliance(p.days, { start: p.start, end: p.end }, TODAY, p.executions);
    expect(row.counts).toMatchObject({ scheduled: a5.scheduled, completed: a5.completed, partial: a5.partial, skipped: a5.skipped, pending: a5.pending });
    expect(row.pct).toBe(a5.compliancePct); // (2 + 0,5) / 4 = 63 %
    expect(row.pct).toBe(63);
    expect(row.toReview).toBe(1);
    expect(row.oldestPending).toBe("2026-03-11");
    expect(row.lastRecord).toBe("2026-03-09");
    expect(row.phase).toBe("CURRENT");
  });

  it("sin registros: conteos pendientes y sin porcentaje (no 0 %)", () => {
    const row = buildFollowUpRow(plan({ id: "c" }), TODAY, { metrics: true, attendance: null });
    expect(row.counts?.pending).toBe(4);
    expect(row.pct).toBeNull();
  });

  it("todo omitido sí es un dato real: 0 %", () => {
    const p = plan({ id: "d", end: "2026-03-08", executions: [exec("d-mon", "2026-03-02", { t: "skipped" }), exec("d-wed", "2026-03-04", { t: "skipped" })] });
    expect(buildFollowUpRow(p, TODAY, { metrics: true, attendance: null }).pct).toBe(0);
  });

  it("sin métricas disponibles: sin conteos ni porcentaje", () => {
    const row = buildFollowUpRow(plan({ id: "e" }), TODAY, { metrics: false, attendance: null });
    expect(row.counts).toBeNull();
    expect(row.pct).toBeNull();
  });

  it("plan futuro: nada vencido", () => {
    const row = buildFollowUpRow(plan({ id: "f", start: "2026-03-16", end: "2026-04-12" }), TODAY, { metrics: true, attendance: null });
    expect(row.phase).toBe("UPCOMING");
    expect(row.counts?.scheduled).toBe(0);
    expect(row.oldestPending).toBeNull();
  });
});

describe("summarizeFollowUp — indicadores de planes vigentes", () => {
  const a = plan({ id: "a", clientId: "c1", executions: [exec("a-mon", "2026-03-02", { t: "completed" }), exec("a-wed", "2026-03-04", { c: "partial" })] });
  const b = plan({ id: "b", clientId: "c2", executions: [exec("b-mon", "2026-03-02", { t: "partial" })] });
  const finished = plan({ id: "old", clientId: "c3", start: "2026-02-02", end: "2026-02-22" });
  const inactive = plan({ id: "off", clientId: "c4", status: "inactive" });

  it("suma conteos (no promedia porcentajes) y excluye finalizados y desactivados", () => {
    const s = summarizeFollowUp([a, b, finished, inactive], TODAY);
    expect(s.students).toBe(2);
    expect(s.currentPlans).toBe(2);
    expect(s.counts.scheduled).toBe(8);
    // (1 + 0,5×2) / 8 = 25 %; el promedio de porcentajes (38 % y 13 %) daría otra cifra.
    expect(s.pct).toBe(25);
    expect(s.review).toHaveLength(1);
    expect(s.pending).toHaveLength(5);
    expect(s.trainerRecorded).toBe(2);
    expect(s.counts.pending).toBe(s.pending.length);
    expect(s.counts.selfReportedOnly).toBe(s.review.length);
  });

  it("colas ordenadas por fecha local, la más antigua primero", () => {
    const s = summarizeFollowUp([a, b], TODAY);
    const dates = s.pending.map((i) => i.date);
    expect(dates).toEqual([...dates].sort());
    expect(s.pending[0].date).toBe("2026-03-04");
  });

  it("dos planes del mismo alumno = un alumno", () => {
    const a2 = plan({ id: "a2", clientId: "c1", start: "2026-03-01", end: "2026-03-01" }); // finalizado: no cuenta
    const a3 = plan({ id: "a3", clientId: "c1", start: "2026-03-10", end: "2026-04-30", createdAt: 5 });
    const s = summarizeFollowUp([a, a2, a3], TODAY);
    expect(s.students).toBe(1);
    expect(s.currentPlans).toBe(2);
  });

  it("planes heredados solapados: cada fecha cuenta una vez, gobernada por el más reciente", () => {
    const older = plan({ id: "o", clientId: "c9", start: "2026-03-02", end: "2026-03-29", createdAt: 1 });
    const newer = plan({ id: "n", clientId: "c9", start: "2026-03-09", end: "2026-03-29", createdAt: 2 });
    const s = summarizeFollowUp([older, newer], TODAY);
    expect(s.overlap).toBe(true);
    // fechas vencidas distintas: 02, 04 (solo older) + 09, 11 (newer) = 4, no 6
    expect(s.counts.scheduled).toBe(4);
    expect(s.pct).toBeNull(); // sin registros ⇒ sin porcentaje
  });

  it("sin planes vigentes: ceros y sin porcentaje", () => {
    const s = summarizeFollowUp([finished], TODAY);
    expect(s.students).toBe(0);
    expect(s.counts.scheduled).toBe(0);
    expect(s.pct).toBeNull();
  });
});

describe("attendanceByPlan", () => {
  it("cuenta ids únicos dentro del período vencido del plan y del alumno correcto", () => {
    const p = plan({ id: "x", clientId: "c1" });
    const m = attendanceByPlan(
      [p],
      [
        { id: "1", clientId: "c1", date: "2026-03-02" },
        { id: "1", clientId: "c1", date: "2026-03-02" },
        { id: "2", clientId: "c1", date: "2026-03-01" }, // antes del plan
        { id: "3", clientId: "c1", date: "2026-03-12" }, // futura
        { id: "4", clientId: "c2", date: "2026-03-03" }, // otro alumno
        { id: "5", clientId: "c1", date: "2026-03-11" },
      ],
      TODAY
    );
    expect([...(m.get("x") ?? [])].sort()).toEqual(["1", "5"]);
  });
});

describe("filtros", () => {
  it("lista blanca: valores desconocidos caen en los valores por defecto", () => {
    expect(parseFollowUpFilters({ estado: "hackeado", pagina: "-3", pendientes: "si", trainer_id: "otro" })).toEqual({
      q: "",
      scope: "vigentes",
      pending: false,
      review: false,
      page: 1,
    });
    expect(parseFollowUpFilters({ estado: "finalizados", pagina: "2", pendientes: "1", revisar: "1", q: "  ana  " })).toEqual({
      q: "ana",
      scope: "finalizados",
      pending: true,
      review: true,
      page: 2,
    });
    expect(parseFollowUpFilters({ q: "x".repeat(500) }).q).toHaveLength(100);
  });

  it("búsqueda sin tildes ni mayúsculas, por nombre y apellido", () => {
    expect(normalizeSearch("  JOSÉ   Núñez ")).toBe("jose nunez");
    const rows = [plan({ id: "1", firstName: "José", lastName: "Núñez" }), plan({ id: "2", firstName: "Ana", lastName: "Gómez" })].map((p) =>
      buildFollowUpRow(p, TODAY, { metrics: true, attendance: null })
    );
    expect(applyFollowUpFilters(rows, { ...FILTERS, q: "nunez jose" }, true).rows.map((r) => r.planId)).toEqual(["1"]);
    expect(applyFollowUpFilters(rows, { ...FILTERS, q: "GOMEZ" }, true).rows.map((r) => r.planId)).toEqual(["2"]);
  });

  it("estado + pendientes + revisión combinables", () => {
    const rows = [
      plan({ id: "cur-review", executions: [exec("cur-review-mon", "2026-03-02", { c: "completed" })] }),
      plan({
        id: "cur-done",
        end: "2026-03-29",
        executions: ["2026-03-02", "2026-03-09"].map((d) => exec("cur-done-mon", d, { t: "completed" })).concat(
          ["2026-03-04", "2026-03-11"].map((d) => exec("cur-done-wed", d, { t: "completed" }))
        ),
      }),
      plan({ id: "fin", start: "2026-02-02", end: "2026-02-22" }),
    ].map((p) => buildFollowUpRow(p, TODAY, { metrics: true, attendance: null }));
    const ids = (f: Partial<typeof FILTERS>) => applyFollowUpFilters(rows, { ...FILTERS, ...f }, true).rows.map((r) => r.planId);
    expect(ids({})).toEqual(["cur-review", "cur-done"]);
    expect(ids({ scope: "finalizados" })).toEqual(["fin"]);
    expect(ids({ scope: "todos", pending: true })).toEqual(["cur-review", "fin"]);
    expect(ids({ scope: "todos", review: true })).toEqual(["cur-review"]);
    expect(ids({ scope: "todos", pending: true, review: true })).toEqual(["cur-review"]);
    // sin métricas los filtros de conteos no se aplican (no se filtra con datos que no existen)
    expect(applyFollowUpFilters(rows, { ...FILTERS, scope: "todos", review: true }, false).total).toBe(3);
  });

  it("paginación exacta y página fuera de rango acotada", () => {
    const rows = Array.from({ length: FOLLOW_UP_PAGE_SIZE + 3 }, (_, i) => buildFollowUpRow(plan({ id: `p${i}` }), TODAY, { metrics: true, attendance: null }));
    const p1 = applyFollowUpFilters(rows, FILTERS, true);
    expect(p1.total).toBe(FOLLOW_UP_PAGE_SIZE + 3);
    expect(p1.pages).toBe(2);
    expect(p1.rows).toHaveLength(FOLLOW_UP_PAGE_SIZE);
    const p9 = applyFollowUpFilters(rows, { ...FILTERS, page: 9 }, true);
    expect(p9.page).toBe(2);
    expect(p9.rows).toHaveLength(3);
  });
});

describe("orden del listado", () => {
  const row = (o: Partial<FollowUpRow>): FollowUpRow => ({
    planId: o.clientName ?? "x",
    clientId: "c",
    clientName: "Z",
    searchKey: "",
    planName: "P",
    branchName: "B",
    start: "2026-03-02",
    end: "2026-03-29",
    phase: "CURRENT",
    counts: null,
    pct: null,
    toReview: 0,
    oldestPending: null,
    lastRecord: null,
    attendance: null,
    ...o,
  });

  it("revisión > pendiente más antiguo > registro más reciente > nombre", () => {
    const rows = [
      row({ clientName: "E-nombre-b" }),
      row({ clientName: "D-nombre-a" }),
      row({ clientName: "C-reciente", lastRecord: "2026-03-10" }),
      row({ clientName: "B-pend-viejo", oldestPending: "2026-03-02" }),
      row({ clientName: "B2-pend-nuevo", oldestPending: "2026-03-09" }),
      row({ clientName: "A-revisar", toReview: 1, oldestPending: "2026-03-11" }),
    ];
    expect([...rows].sort(compareFollowUpRows).map((r) => r.clientName)).toEqual([
      "A-revisar",
      "B-pend-viejo",
      "B2-pend-nuevo",
      "C-reciente",
      "D-nombre-a",
      "E-nombre-b",
    ]);
  });
});
