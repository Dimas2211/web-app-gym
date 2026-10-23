import { describe, expect, it } from "vitest";
import { complianceInRange, progressBuckets } from "@/modules/client-portal/progress-rules";
import { summarizeCompliance, type ExecutionRef } from "./training-tracking-rules";
import { summarizeFollowUp, type FollowUpPlanInput } from "./trainer-follow-up-rules";
import {
  attendanceAnalytics,
  bucketBeforeTracking,
  currentAnalytics,
  evolution,
  governPlans,
  groupMetrics,
  NO_TRAINER,
  parseAnalyticsFilters,
  resolveBranchFilter,
  type AnalyticsAttendanceRef,
  type AnalyticsPlanInput,
} from "./training-analytics-rules";

const TODAY = "2026-03-11"; // miércoles

let seq = 0;
function plan(over: Partial<AnalyticsPlanInput> & { start: string; end: string }): AnalyticsPlanInput {
  seq++;
  return {
    id: over.id ?? `p${seq}`,
    clientId: over.clientId ?? `c${seq}`,
    branchId: over.branchId ?? "B1",
    trainerId: over.trainerId === undefined ? "T1" : over.trainerId,
    modality: over.modality ?? "NORMAL",
    status: over.status ?? "active",
    createdAt: over.createdAt ?? seq,
    days: over.days ?? [{ id: `d${seq}-1`, weekday: 1 }],
    executions: over.executions ?? [],
    start: over.start,
    end: over.end,
  };
}

const ex = (dayId: string, date: string, s: Partial<Pick<ExecutionRef, "client_status" | "trainer_status">>): ExecutionRef => ({
  plan_day_id: dayId,
  local_date: date,
  client_status: s.client_status ?? null,
  trainer_status: s.trainer_status ?? null,
});

describe("GYM-5D reglas — cumplimiento (contrato 5A/5B/5C)", () => {
  it("R1 un plan: mismos conteos que summarizeCompliance (5A)", () => {
    const p = plan({
      start: "2026-03-02",
      end: "2026-03-29",
      days: [{ id: "a1", weekday: 1 }, { id: "a3", weekday: 3 }],
      executions: [ex("a1", "2026-03-02", { trainer_status: "completed" }), ex("a3", "2026-03-04", { client_status: "partial" })],
    });
    const m = groupMetrics(governPlans([p]).governed, TODAY);
    const s = summarizeCompliance(p.days, { start: p.start, end: p.end }, TODAY, p.executions);
    expect(m.counts).toMatchObject({ scheduled: s.scheduled, completed: s.completed, partial: s.partial, skipped: s.skipped, pending: s.pending });
    expect(m.pct).toBe(s.compliancePct);
    expect(m.pct).toBe(38); // (1 + 0,5) / 4
  });

  it("R2 dos planes: suma conteos, nunca promedia porcentajes", () => {
    const a = plan({ start: "2026-03-09", end: "2026-03-29", days: [{ id: "x", weekday: 1 }], executions: [ex("x", "2026-03-09", { trainer_status: "completed" })] });
    const b = plan({
      start: "2026-03-02",
      end: "2026-03-29",
      days: [{ id: "y1", weekday: 1 }, { id: "y3", weekday: 3 }],
      executions: [ex("y1", "2026-03-02", { trainer_status: "skipped" })],
    });
    const { overview } = currentAnalytics([a, b], TODAY);
    // a = 100 %, b = 0 % (1 omitido de 4) → promedio 50 %; agregado = 1 / 5 = 20 %
    expect(overview.counts.scheduled).toBe(5);
    expect(overview.pct).toBe(20);
  });

  it("R3 planes heredados solapados: cada fecha una vez (gobierna el más reciente) y grupos suman el panorama", () => {
    const old = plan({
      clientId: "lu",
      trainerId: "T1",
      branchId: "B1",
      start: "2026-02-23",
      end: "2026-03-15",
      days: [{ id: "o1", weekday: 1 }],
      executions: [ex("o1", "2026-03-02", { trainer_status: "completed" })],
      createdAt: 1,
    });
    const recent = plan({
      clientId: "lu",
      trainerId: "T2",
      branchId: "B2",
      start: "2026-03-02",
      end: "2026-03-29",
      days: [{ id: "n1", weekday: 1 }],
      executions: [ex("n1", "2026-03-02", { trainer_status: "skipped" })],
      createdAt: 2,
    });
    const r = currentAnalytics([old, recent], TODAY);
    expect(r.overlap).toBe(true);
    // old: 23-feb (pendiente); recent: 02 y 09-mar → 3 programados; el completado de old en 02-mar no cuenta
    expect(r.overview.counts).toMatchObject({ scheduled: 3, completed: 0, skipped: 1, pending: 2 });
    expect(r.overview.students).toBe(1);
    const sum = (m: Map<string, { counts: { scheduled: number } }>) => [...m.values()].reduce((n, x) => n + x.counts.scheduled, 0);
    expect(sum(r.byBranch)).toBe(3);
    expect(sum(r.byTrainer)).toBe(3);
    // mismo resultado que el panel 5C para los mismos planes
    const fu: FollowUpPlanInput[] = [old, recent].map((p) => ({ ...p, firstName: "L", lastName: "U", planName: "x", branchName: "b", days: p.days.map((d) => ({ ...d, sessionName: null })) }));
    expect(summarizeFollowUp(fu, TODAY).counts).toEqual(r.overview.counts);
  });

  it("R4 autorreporte pendiente de revisión vs registro del entrenador (estado efectivo)", () => {
    const p = plan({
      start: "2026-03-02",
      end: "2026-03-29",
      days: [{ id: "a", weekday: 1 }, { id: "b", weekday: 3 }],
      executions: [
        ex("a", "2026-03-02", { client_status: "completed" }),
        ex("b", "2026-03-04", { client_status: "skipped", trainer_status: "completed" }),
      ],
    });
    const m = groupMetrics(governPlans([p]).governed, TODAY);
    expect(m.toReview).toBe(1);
    expect(m.trainerRecorded).toBe(1);
    expect(m.counts.completed).toBe(2); // el entrenador prevalece sobre el autorreporte "omitido"
  });

  it("R5 sin registros ⇒ sin porcentaje; todo omitido ⇒ 0 % (no se confunde ausencia de datos con 0 %)", () => {
    const empty = plan({ start: "2026-03-02", end: "2026-03-29" });
    expect(groupMetrics(governPlans([empty]).governed, TODAY).pct).toBeNull();
    const skipped = plan({ start: "2026-03-02", end: "2026-03-29", days: [{ id: "s", weekday: 1 }], executions: [ex("s", "2026-03-02", { trainer_status: "skipped" }), ex("s", "2026-03-09", { trainer_status: "skipped" })] });
    expect(groupMetrics(governPlans([skipped]).governed, TODAY).pct).toBe(0);
    expect(currentAnalytics([], TODAY).overview).toMatchObject({ students: 0, plans: 0, pct: null });
  });

  it("R6 planes futuros, finalizados e inactivos no son vigentes; ocurrencias futuras no son vencidas", () => {
    const future = plan({ start: "2026-03-16", end: "2026-04-12" });
    const finished = plan({ start: "2026-02-02", end: "2026-02-22" });
    const inactive = plan({ start: "2026-03-02", end: "2026-03-29", status: "inactive" });
    const current = plan({ start: "2026-03-02", end: "2026-03-29", days: [{ id: "f", weekday: 5 }] });
    const r = currentAnalytics([future, finished, inactive, current], TODAY);
    expect(r.overview.plans).toBe(1);
    expect(r.overview.counts.scheduled).toBe(1); // viernes 06; el 13 es futuro
  });

  it("R7 entrenador y modalidad: atribución por el plan y por Client.modality; tres modalidades siempre presentes", () => {
    const p1 = plan({ start: "2026-03-02", end: "2026-03-29", trainerId: null, modality: "GROUP" });
    const p2 = plan({ start: "2026-03-02", end: "2026-03-29", trainerId: "T9", modality: "PERSONALIZED" });
    const r = currentAnalytics([p1, p2], TODAY);
    expect([...r.byTrainer.keys()].sort()).toEqual([NO_TRAINER, "T9"].sort());
    expect(r.byModality.map((m) => [m.key, m.metrics.plans])).toEqual([
      ["NORMAL", 0],
      ["PERSONALIZED", 1],
      ["GROUP", 1],
    ]);
  });
});

describe("GYM-5D reglas — evolución", () => {
  it("R8 semanas lunes–domingo y meses calendario desde la fecha local; cada intervalo = complianceInRange (5B)", () => {
    const weeks = progressBuckets("semanas", TODAY);
    expect(weeks[weeks.length - 1]).toMatchObject({ start: "2026-03-09", end: "2026-03-15", isCurrent: true });
    expect(weeks[0].start).toBe("2026-01-19");
    const months = progressBuckets("meses", TODAY);
    expect(months.map((m) => m.start)).toEqual(["2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01"]);
    const p = plan({ start: "2026-02-02", end: "2026-03-29", days: [{ id: "w", weekday: 1 }], executions: [ex("w", "2026-03-02", { trainer_status: "partial" })] });
    const e = evolution([p], weeks, TODAY, "2026-02-02");
    const wk = e.buckets.find((b) => b.bucket.start === "2026-03-02")!;
    expect(wk.counts).toEqual(complianceInRange([{ ...p, segments: [{ start: p.start, end: p.end }] }], wk.bucket, TODAY, { trackingStart: "2026-02-02" }));
    expect(wk.pct).toBe(50);
    expect(e.total.scheduled).toBe(6); // 02, 09, 16, 23 feb; 02, 09 mar
  });

  it("R9 antes del inicio del seguimiento: etiqueta aparte, el denominador no cambia", () => {
    const p = plan({ start: "2026-01-26", end: "2026-03-29", days: [{ id: "w", weekday: 1 }], executions: [ex("w", "2026-02-02", { trainer_status: "completed" })] });
    const e = evolution([p], progressBuckets("semanas", TODAY), TODAY, "2026-02-02");
    const jan = e.buckets.find((b) => b.bucket.start === "2026-01-26")!;
    expect(jan.beforeTracking).toBe(true);
    expect(jan.pct).toBeNull();
    const feb16 = e.buckets.find((b) => b.bucket.start === "2026-02-16")!;
    expect(feb16.beforeTracking).toBe(false); // sin registros pero posterior: "Sin datos suficientes"
    expect(feb16.pct).toBeNull();
    expect(e.total.scheduled).toBe(7);
    expect(e.total.pendingBeforeTracking).toBe(1);
    expect(e.totalPct).toBe(14); // 1 / 7
    expect(bucketBeforeTracking(jan.bucket, jan.counts, null)).toBe(true);
  });

  it("R10 sin registros en el tenant: todos los pendientes son previos al seguimiento (criterio 5B)", () => {
    const p = plan({ start: "2026-03-02", end: "2026-03-29" });
    const e = evolution([p], progressBuckets("semanas", TODAY), TODAY, null);
    expect(e.total.pendingBeforeTracking).toBe(e.total.pending);
    expect(e.buckets.every((b) => b.pct === null)).toBe(true);
  });
});

describe("GYM-5D reglas — asistencia", () => {
  const buckets = progressBuckets("semanas", TODAY);
  const a = (id: string, status: string, date: string, kind: AnalyticsAttendanceRef["kind"] = "OPEN", branchId = "B1"): AnalyticsAttendanceRef => ({ id, status, date, kind, branchId });

  it("R11 conteos reales: confirmadas = asistió + tarde; ausencias aparte; sin denominador", () => {
    const r = attendanceAnalytics(
      [
        a("1", "attended", "2026-03-02"),
        a("1", "attended", "2026-03-02"), // duplicado
        a("2", "late", "2026-03-06", "GROUP"),
        a("3", "absent", "2026-03-06", "GROUP"),
        a("4", "cancelled", "2026-03-06"),
        a("5", "attended", "2026-03-20"), // futura
        a("6", "attended", "2025-12-01"), // fuera del período
        a("7", "attended", "2026-03-09", "PERSONALIZED", "B2"),
      ],
      buckets,
      TODAY
    );
    expect(r.total).toEqual({ attended: 2, late: 1, absent: 1, confirmed: 3 });
    expect(r.byBranch.get("B1")).toEqual({ attended: 1, late: 1, absent: 1, confirmed: 2 });
    expect(r.byBranch.get("B2")?.confirmed).toBe(1);
    expect(r.byKind).toEqual([
      { kind: "OPEN", counts: { attended: 1, late: 0, absent: 0, confirmed: 1 } },
      { kind: "PERSONALIZED", counts: { attended: 1, late: 0, absent: 0, confirmed: 1 } },
      { kind: "GROUP", counts: { attended: 0, late: 1, absent: 1, confirmed: 1 } },
    ]);
    expect(r.perBucket.slice(-2)).toEqual([2, 1]);
    expect(Object.keys(r.total)).not.toContain("rate");
  });
});

describe("GYM-5D reglas — parámetros", () => {
  it("R12 lista blanca: periodo y sede; el resto se ignora; sede solo dentro de las autorizadas", () => {
    expect(parseAnalyticsFilters({ periodo: "meses", sede: "B2", tenant_id: "T2", trainer_id: "x", client_id: "y" })).toEqual({ range: "meses", branch: "B2" });
    expect(parseAnalyticsFilters({ periodo: "1; DROP", sede: ["", "B2"] })).toEqual({ range: "semanas", branch: null });
    expect(parseAnalyticsFilters({ sede: "x".repeat(65) }).branch).toBeNull();
    expect(resolveBranchFilter("B2", ["B1", "B2"])).toBe("B2");
    expect(resolveBranchFilter("OTRO-TENANT", ["B1", "B2"])).toBeNull();
    expect(resolveBranchFilter(null, ["B1"])).toBeNull();
  });
});
