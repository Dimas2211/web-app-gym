// DTE-MH-TEST-RUNS — motor: lease/fencing, recuperación por clave,
// incertidumbre sin retransmisión, reintento solo pre-envío verificable,
// dependencias NC/invalidación/contingencia. Runtime FAKE (nunca red real).

import { describe, it, expect, vi } from "vitest";
import { advanceMhTestRun } from "./mh-test-run.engine";
import { createInMemoryMhTestRunRepository } from "./mh-test-run.repository";
import { planMhTestRun } from "./mh-test-run.planner";
import { planOperatorDecision } from "./mh-test-run.service";
import type { MhTestRuntimePort } from "./mh-test-run.runtime-port";
import type { MhTestRunPlan, MhTestRunRecord } from "./mh-test-run.types";

const responsible = { name: "Responsable Fixture", docTypeCode: "13" as const, documentNumber: "000000000" };
const taxpayer = {
  nit: "06140000000000", nrc: "1234", name: "CONTRIBUYENTE FIXTURE", activityCode: "46900", activityName: "Venta",
  deptCode: "06", municipalityCode: "14", addressComplement: "Col. Fixture", email: "c@fixture.test",
};

function plan(over: Partial<MhTestRunPlan> = {}): MhTestRunPlan {
  return {
    version: 1,
    blocks: [{ dteTypeCode: "01", firstSequence: 10, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 2 }] }],
    invalidations: [], receptors: {}, responsible: null, contingency: null,
    ...over,
  };
}

type Doc = { id: string; key: string; type: string; status: string; sends: number; stamp: string | null };
type Ev = { id: string; docIds: string[]; status: string; kind: "INV" | "CONT" };

function fakeRuntime(opts: {
  transmit?: (doc: Doc) => "ACCEPTED" | "REJECTED" | "TIMEOUT" | "AUTH" | "THROW" | "BUSINESS";
  reconcile?: (doc: Doc) => "PROCESSED" | "PENDING";
  eventTransmit?: (ev: Ev) => "ACCEPTED" | "REJECTED" | "TIMEOUT";
} = {}) {
  const docs = new Map<string, Doc>();
  const events = new Map<string, Ev>();
  const logs = new Map<string, { count: number; errorCode: string | null }>();
  let n = 0;
  const byId = (id: string) => [...docs.values()].find((d) => d.id === id)!;
  const log = (docId: string, code: string | null) => {
    const l = logs.get(docId) ?? { count: 0, errorCode: null };
    logs.set(docId, { count: l.count + 1, errorCode: code });
  };
  const port: MhTestRuntimePort = {
    preflight: async () => ({ ok: true, errors: [] }),
    materialize: vi.fn(async (items: Parameters<MhTestRuntimePort["materialize"]>[0]) => {
      for (const it of items) if (!docs.has(it.key)) docs.set(it.key, { id: `doc-${++n}`, key: it.key, type: it.dteTypeCode, status: "PENDING_GENERATION", sends: 0, stamp: null });
      return { ok: true as const, recovered: false, docs: items.map((it) => ({ key: it.key, dteDocumentId: docs.get(it.key)!.id, controlNumber: `CN-${it.plannedSequence}`, generationCode: `GC-${it.key}` })) };
    }),
    readDoc: async (key) => {
      const d = docs.get(key);
      return d ? ({ id: d.id, certification_item_key: d.key, dte_type_code: d.type, dte_status: d.status, control_number: "CN", generation_code: "GC", reception_stamp: d.stamp, mh_response: null, transmission_type_code: "1", retry_count: 0 } as never) : null;
    },
    generate: async ({ key }) => { docs.get(key)!.status = "GENERATED"; return { ok: true }; },
    validate: async (id) => { byId(id).status = "SCHEMA_VALIDATED"; return { ok: true }; },
    sign: async (id) => { byId(id).status = "SIGNED"; return { ok: true }; },
    transmit: vi.fn(async (id: string) => {
      const d = byId(id);
      const r = opts.transmit?.(d) ?? "ACCEPTED";
      if (r === "THROW") { d.sends++; throw new Error("socket hang up"); }
      if (r === "BUSINESS") return { ok: false as const, error: "metering" };
      if (r === "AUTH") { log(id, "MH_TRANSMISSION_AUTH_FAILED"); return { ok: false as const, error: "auth" }; }
      d.sends++;
      if (r === "TIMEOUT") { log(id, "MH_TRANSMISSION_TIMEOUT"); return { ok: false as const, error: "timeout" }; }
      log(id, null);
      d.status = r; d.stamp = r === "ACCEPTED" ? "S".repeat(40) : null;
      return { ok: true as const, dteStatus: r, mhEstado: r === "ACCEPTED" ? "PROCESADO" : "RECHAZADO", descripcionMsg: null, selloRecibido: d.stamp };
    }),
    reconcile: vi.fn(async (id: string) => {
      const d = byId(id);
      if ((opts.reconcile?.(d) ?? "PENDING") === "PROCESSED") { d.status = "ACCEPTED"; d.stamp = "Q".repeat(40); return { status: "RESOLVED" as const, dteStatus: "ACCEPTED" as const }; }
      return { status: "PENDING_UNCHANGED" as const, queryKind: "QUERY_TECHNICAL_ERROR" as never };
    }),
    lastLog: async (id) => ({ attempt: logs.get(id)?.count ?? 0, count: logs.get(id)?.count ?? 0, errorCode: logs.get(id)?.errorCode ?? null }),
    prepareCreditNote: async (ncKey) => { docs.get(ncKey)!.status = "GENERATED"; return { ok: true }; },
    cancelUnsigned: async (key) => { docs.get(key)!.status = "CANCELLED"; return true; },
    findInvalidation: async (docId, eventId) => [...events.values()].find((e) => e.kind === "INV" && e.docIds.includes(docId) && (!eventId || e.id === eventId)) as never ?? null,
    createInvalidation: vi.fn(async (docId: string) => { const id = `inv-${++n}`; events.set(id, { id, docIds: [docId], status: "DRAFT", kind: "INV" }); return { ok: true as const, eventId: id }; }),
    signInvalidation: async (id) => { events.get(id)!.status = "SIGNED"; return { ok: true }; },
    transmitInvalidation: vi.fn(async (id: string) => {
      const e = events.get(id)!; const r = opts.eventTransmit?.(e) ?? "ACCEPTED";
      log(e.docIds[0], r === "TIMEOUT" ? "MH_INVALIDATION_TIMEOUT" : null);
      if (r === "TIMEOUT") return { ok: false as const, error: "timeout" };
      e.status = r; return { ok: true as const, eventStatus: r, mhEstado: r, descripcion: null, sello: "E".repeat(40) };
    }),
    findContingency: async (ids, eventId) => [...events.values()].find((e) => e.kind === "CONT" && (eventId ? e.id === eventId : e.docIds.some((d) => ids.includes(d)))) as never ?? null,
    emissionWindow: async (keys) => {
      const ds = keys.map((k) => docs.get(k)).filter(Boolean) as Doc[];
      const complete = ds.length === keys.length && ds.every((d) => d.status !== "PENDING_GENERATION");
      return { ids: ds.map((d) => d.id), first: complete ? "2026-11-16 10:00:00" : null, last: complete ? "2026-11-16 10:05:00" : null, complete };
    },
    createContingency: vi.fn(async (ids: string[]) => { const id = `cont-${++n}`; events.set(id, { id, docIds: ids, status: "DRAFT", kind: "CONT" }); return { ok: true as const, eventId: id }; }),
    buildContingency: async (id) => { events.get(id)!.status = "PENDING_SIGNATURE"; return { ok: true }; },
    signContingency: async (id) => { events.get(id)!.status = "SIGNED"; return { ok: true }; },
    transmitContingency: vi.fn(async (id: string) => { const e = events.get(id)!; e.status = "ACCEPTED"; log(e.docIds[0], null); return { ok: true as const, eventStatus: "ACCEPTED" as const, mhEstado: "PROCESADO", descripcion: null, sello: "C".repeat(40) }; }),
  };
  return { port, docs, events };
}

async function setup(p: MhTestRunPlan) {
  const planned = planMhTestRun(p);
  if (!planned.ok) throw new Error(planned.errors.join("; "));
  const repo = createInMemoryMhTestRunRepository();
  const created = await repo.createRun({
    organization_id: "org-1", tenant_id: "t1", location_id: "l1", issuer_config_id: "iss", plan: planned.plan,
    items: planned.items, created_by: "u1", authorized_by: "u1",
  }, new Date());
  if (!created.ok) throw new Error("create");
  return { repo, runId: created.runId };
}

const clock = (start = Date.parse("2026-11-16T12:00:00Z")) => {
  let t = start;
  return { now: () => new Date(t), advance: (ms: number) => { t += ms; } };
};

const steps = (run: MhTestRunRecord | null) => run!.items.map((i) => i.step);

describe("advanceMhTestRun — flujo feliz y recuperación", () => {
  it("materializa, genera, valida, firma y transmite; corrida COMPLETED", async () => {
    const { repo, runId } = await setup(plan());
    const { port } = fakeRuntime();
    const c = clock();
    const out = await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w1", now: c.now, budgetMs: 10_000_000 });
    expect(out).toMatchObject({ status: "ADVANCED", runStatus: "COMPLETED" });
    expect(steps(await repo.getRun(runId))).toEqual(["ACCEPTED", "ACCEPTED"]);
  });

  it("recupera documentos por clave si el CP perdió la escritura (no re-materializa ni duplica)", async () => {
    const { repo, runId } = await setup(plan());
    const { port, docs } = fakeRuntime();
    const c = clock();
    // Primer tick: solo materializa (maxActions=1) y simulamos que el CP no registró nada.
    await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w1", now: c.now, maxActions: 1, budgetMs: 10_000_000 });
    const r = repo.runs.get(runId)!;
    for (const it of r.items) { it.step = "PLANNED"; it.runtime_dte_document_id = null; }
    const before = docs.size;
    c.advance(1000);
    await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w2", now: c.now, budgetMs: 10_000_000 });
    expect(docs.size).toBe(before);
    expect(steps(await repo.getRun(runId))).toEqual(["ACCEPTED", "ACCEPTED"]);
  });

  it("sincroniza un documento ya aceptado en runtime sin volver a transmitir", async () => {
    const { repo, runId } = await setup(plan({ blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 1 }] }] }));
    const { port, docs } = fakeRuntime();
    const c = clock();
    await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w1", now: c.now, maxActions: 1, budgetMs: 10_000_000 });
    const d = [...docs.values()][0];
    d.status = "ACCEPTED"; d.stamp = "X".repeat(40); // otro proceso lo transmitió; el CP no lo registró
    c.advance(1000);
    await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w2", now: c.now, budgetMs: 10_000_000 });
    expect(port.transmit).not.toHaveBeenCalled();
    expect((await repo.getRun(runId))!.items[0]).toMatchObject({ step: "ACCEPTED", reception_stamp: "X".repeat(40) });
  });
});

describe("incertidumbre — nunca retransmisión automática", () => {
  it("timeout → UNCERTAIN; consulta MH pendiente no reenvía; QUERY_PROCESSED resuelve", async () => {
    const { repo, runId } = await setup(plan({ blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 1 }] }] }));
    let processed = false;
    const { port, docs } = fakeRuntime({ transmit: () => "TIMEOUT", reconcile: () => (processed ? "PROCESSED" : "PENDING") });
    const c = clock();
    await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w1", now: c.now, budgetMs: 10_000_000 });
    expect(steps(await repo.getRun(runId))).toEqual(["UNCERTAIN"]);
    for (let i = 0; i < 3; i++) {
      c.advance(60_000);
      await advanceMhTestRun(runId, { repo, runtime: () => port, owner: `w${i + 2}`, now: c.now, budgetMs: 10_000_000 });
    }
    expect(port.transmit).toHaveBeenCalledTimes(1);
    expect([...docs.values()][0].sends).toBe(1);
    processed = true;
    c.advance(60_000);
    await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w9", now: c.now, budgetMs: 10_000_000 });
    expect(steps(await repo.getRun(runId))).toEqual(["ACCEPTED"]);
    expect(port.transmit).toHaveBeenCalledTimes(1);
  });

  it("consultas agotadas → NEEDS_REVIEW; solo la decisión RETRANSMIT_SAME reenvía el MISMO documento", async () => {
    const { repo, runId } = await setup(plan({ blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 1 }] }] }));
    let mode: "TIMEOUT" | "ACCEPTED" = "TIMEOUT";
    const { port, docs } = fakeRuntime({ transmit: () => mode });
    const c = clock();
    for (let i = 0; i < 8; i++) {
      await advanceMhTestRun(runId, { repo, runtime: () => port, owner: `w${i}`, now: c.now, budgetMs: 10_000_000 });
      c.advance(60_000);
    }
    let run = (await repo.getRun(runId))!;
    expect(run.items[0].step).toBe("NEEDS_REVIEW");
    expect(run.status).toBe("NEEDS_REVIEW");
    expect(port.transmit).toHaveBeenCalledTimes(1);

    const decision = planOperatorDecision(run.items[0], "RETRANSMIT_SAME");
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(await repo.applyOperatorDecision(runId, run.items[0].id, decision.fromSteps, { ...decision.patch, operator_note: "verificado en portal MH", decided_by: "u1" }, c.now())).toBe("OK");
    mode = "ACCEPTED";
    await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w-after", now: c.now, budgetMs: 10_000_000 });
    run = (await repo.getRun(runId))!;
    expect(run.items[0].step).toBe("ACCEPTED");
    const d = [...docs.values()][0];
    expect(docs.size).toBe(1); // sin documento sustituto
    expect(d.sends).toBe(2);
  });

  it("excepción en transmisión → UNCERTAIN (no se asume que no se envió)", async () => {
    const { repo, runId } = await setup(plan({ blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 1 }] }] }));
    const { port } = fakeRuntime({ transmit: () => "THROW" });
    await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w1", now: clock().now, budgetMs: 10_000_000 });
    expect(steps(await repo.getRun(runId))).toEqual(["UNCERTAIN"]);
  });

  it("AUTH_FAILED registrado (pre-envío) → reintento automático del mismo documento, acotado", async () => {
    const { repo, runId } = await setup(plan({ blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 1 }] }] }));
    const { port, docs } = fakeRuntime({ transmit: () => "AUTH" });
    const c = clock();
    for (let i = 0; i < 5; i++) {
      await advanceMhTestRun(runId, { repo, runtime: () => port, owner: `w${i}`, now: c.now, budgetMs: 10_000_000 });
      c.advance(60_000);
    }
    expect(steps(await repo.getRun(runId))).toEqual(["NEEDS_REVIEW"]);
    expect(port.transmit).toHaveBeenCalledTimes(3);
    expect([...docs.values()][0].sends).toBe(0);
  });

  it("error de negocio sin intento registrado → FAILED (no hubo envío); RETRY_STEP lo reanuda", async () => {
    const { repo, runId } = await setup(plan({ blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 1 }] }] }));
    let mode: "BUSINESS" | "ACCEPTED" = "BUSINESS";
    const { port } = fakeRuntime({ transmit: () => mode });
    const c = clock();
    await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w1", now: c.now, budgetMs: 10_000_000 });
    const run = (await repo.getRun(runId))!;
    expect(run.items[0].step).toBe("FAILED");
    const d = planOperatorDecision(run.items[0], "RETRY_STEP");
    if (!d.ok) throw new Error(d.error);
    await repo.applyOperatorDecision(runId, run.items[0].id, d.fromSteps, { ...d.patch, operator_note: "metering corregido", decided_by: "u1" }, c.now());
    mode = "ACCEPTED";
    await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w2", now: c.now, budgetMs: 10_000_000 });
    expect(steps(await repo.getRun(runId))).toEqual(["ACCEPTED"]);
  });
});

describe("lease y fencing", () => {
  it("doble inicio: un segundo proceso no toma el lease vigente", async () => {
    const { repo, runId } = await setup(plan());
    const c = clock();
    const lease = await repo.acquireLease(runId, "w1", 120_000, c.now());
    expect(lease).not.toBeNull();
    const { port } = fakeRuntime();
    const out = await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w2", now: c.now });
    expect(out.status).toBe("LEASE_BUSY");
    expect(port.materialize).not.toHaveBeenCalled();
  });

  it("proceso viejo que perdió el lease NO inicia una segunda transmisión", async () => {
    const { repo, runId } = await setup(plan({ blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 1 }] }] }));
    const c = clock();
    const { port } = fakeRuntime();
    // Llevar el ítem hasta SIGNED sin transmitir.
    await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w0", now: c.now, maxActions: 4, budgetMs: 10_000_000 });
    expect(steps(await repo.getRun(runId))).toEqual(["SIGNED"]);

    // w-old toma el lease; expira; w-new lo toma (epoch mayor).
    const old = (await repo.acquireLease(runId, "w-old", 1_000, c.now()))!;
    c.advance(5_000);
    const fresh = (await repo.acquireLease(runId, "w-new", 120_000, c.now()))!;
    expect(fresh.epoch).toBeGreaterThan(old.epoch);

    const item = (await repo.getRun(runId))!.items[0];
    // El viejo intenta reclamar para transmitir: rechazado por fencing.
    expect(await repo.claimForTransmit(old, item.id, ["SIGNED"], c.now())).toBe(false);
    // El nuevo sí puede.
    expect(await repo.claimForTransmit(fresh, item.id, ["SIGNED"], c.now())).toBe(true);
    // Y el viejo no puede pisar el resultado del nuevo.
    expect(await repo.recordTransmitOutcome(item.id, old.epoch, { step: "REJECTED" })).toBe(false);
  });

  it("ítem TRANSMITTING de un epoch anterior pasa a UNCERTAIN y se concilia, sin reenviar", async () => {
    const { repo, runId } = await setup(plan({ blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 1 }] }] }));
    const c = clock();
    const { port } = fakeRuntime({ reconcile: () => "PROCESSED" });
    await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w0", now: c.now, maxActions: 4, budgetMs: 10_000_000 });
    // Simular proceso caído tras reclamar (nunca registró resultado).
    const crashed = (await repo.acquireLease(runId, "w-crash", 1_000, c.now()))!;
    const item = (await repo.getRun(runId))!.items[0];
    await repo.claimForTransmit(crashed, item.id, ["SIGNED"], c.now());
    c.advance(5_000);
    await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w-new", now: c.now, budgetMs: 10_000_000 });
    expect(port.transmit).not.toHaveBeenCalled();
    expect(port.reconcile).toHaveBeenCalledTimes(1);
    expect(steps(await repo.getRun(runId))).toEqual(["ACCEPTED"]);
  });

  it("decisiones del operador y pausa se rechazan mientras hay un lease vigente", async () => {
    const { repo, runId } = await setup(plan());
    const c = clock();
    await repo.acquireLease(runId, "w1", 120_000, c.now());
    const item = (await repo.getRun(runId))!.items[0];
    expect(await repo.applyOperatorDecision(runId, item.id, ["PLANNED"], { step: "ABANDONED", operator_note: "x".repeat(10), decided_by: "u" }, c.now())).toBe("BUSY");
    expect(await repo.setRunStatusIfIdle(runId, ["QUEUED"], "PAUSED", c.now())).toBe("BUSY");
  });
});

describe("dependencias", () => {
  it("NC espera al CCFE aceptado; invalidación sobre CCFE libre; una sola invalidación por documento", async () => {
    const { repo, runId } = await setup(plan({
      blocks: [
        { dteTypeCode: "03", firstSequence: 1, scenarios: [{ scenarioCode: "CCFE03_ESTANDAR", count: 2 }] },
        { dteTypeCode: "05", firstSequence: 1, scenarios: [{ scenarioCode: "NC05_SOBRE_CCFE", count: 1 }] },
      ],
      invalidations: [{ targetScenarioCode: "CCFE03_ESTANDAR", count: 1 }],
      receptors: { taxpayer }, responsible,
    }));
    const { port } = fakeRuntime();
    const out = await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w1", now: clock().now, budgetMs: 10_000_000 });
    expect(out).toMatchObject({ runStatus: "COMPLETED" });
    expect(port.createInvalidation).toHaveBeenCalledTimes(1);
  });

  it("NC con CCFE rechazado → NC SKIPPED y documento cancelado sin firmar", async () => {
    const { repo, runId } = await setup(plan({
      blocks: [
        { dteTypeCode: "03", firstSequence: 1, scenarios: [{ scenarioCode: "CCFE03_ESTANDAR", count: 1 }] },
        { dteTypeCode: "05", firstSequence: 1, scenarios: [{ scenarioCode: "NC05_SOBRE_CCFE", count: 1 }] },
      ],
      receptors: { taxpayer },
    }));
    const { port, docs } = fakeRuntime({ transmit: (d) => (d.type === "03" ? "REJECTED" : "ACCEPTED") });
    const out = await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w1", now: clock().now, budgetMs: 10_000_000 });
    expect(out).toMatchObject({ runStatus: "COMPLETED_WITH_FAILURES" });
    expect(steps(await repo.getRun(runId))).toEqual(["REJECTED", "SKIPPED"]);
    expect([...docs.values()].find((d) => d.type === "05")!.status).toBe("CANCELLED");
  });

  it("contingencia: documentos se firman, el evento se transmite primero y luego los documentos", async () => {
    const { repo, runId } = await setup(plan({
      blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "CONT01_FE", count: 2 }] }],
      responsible, contingency: { contingencyTypeCode: "1", reason: null },
    }));
    const order: string[] = [];
    const { port } = fakeRuntime({ transmit: () => { order.push("DOC"); return "ACCEPTED"; } });
    const origCont = port.transmitContingency;
    port.transmitContingency = async (id) => { order.push("EVENT"); return origCont(id); };
    const out = await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w1", now: clock().now, budgetMs: 10_000_000 });
    expect(out).toMatchObject({ runStatus: "COMPLETED" });
    expect(order).toEqual(["EVENT", "DOC", "DOC"]);
    expect(port.createContingency).toHaveBeenCalledTimes(1);
  });

  it("evento existente en runtime sin registro en CP → se recupera, no se crea otro", async () => {
    const { repo, runId } = await setup(plan({
      blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "FE01_IDENTIFICADO", count: 1 }] }],
      invalidations: [{ targetScenarioCode: "FE01_IDENTIFICADO", count: 1 }],
      receptors: { identified: { idTypeCode: "13", documentNumber: "000000000", name: "RECEPTOR FIXTURE" } }, responsible,
    }));
    const { port, events } = fakeRuntime();
    const c = clock();
    // Avanzar hasta crear el evento; luego "perder" el registro en CP.
    await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w1", now: c.now, maxActions: 6, budgetMs: 10_000_000 });
    const r = repo.runs.get(runId)!;
    const inv = r.items.find((i) => i.kind === "INVALIDATION")!;
    expect(events.size).toBe(1);
    inv.step = "PLANNED"; inv.runtime_invalidation_event_id = null;
    c.advance(1000);
    await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w2", now: c.now, budgetMs: 10_000_000 });
    expect(port.createInvalidation).toHaveBeenCalledTimes(1);
    expect(events.size).toBe(1);
    expect(steps(await repo.getRun(runId))).toEqual(["ACCEPTED", "ACCEPTED"]);
  });

  it("evento con fallo incierto → NEEDS_REVIEW (sin servicio de consulta, sin reintento)", async () => {
    const { repo, runId } = await setup(plan({
      blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "FE01_IDENTIFICADO", count: 1 }] }],
      invalidations: [{ targetScenarioCode: "FE01_IDENTIFICADO", count: 1 }],
      receptors: { identified: { idTypeCode: "13", documentNumber: "000000000", name: "RECEPTOR FIXTURE" } }, responsible,
    }));
    const { port } = fakeRuntime({ eventTransmit: () => "TIMEOUT" });
    const out = await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w1", now: clock().now, budgetMs: 10_000_000 });
    expect(out).toMatchObject({ runStatus: "NEEDS_REVIEW" });
    expect(port.transmitInvalidation).toHaveBeenCalledTimes(1);
  });
});

describe("preflight y presupuesto", () => {
  it("preflight fallido → NEEDS_REVIEW sin materializar", async () => {
    const { repo, runId } = await setup(plan());
    const { port } = fakeRuntime();
    port.preflight = async () => ({ ok: false, errors: ["sin credencial"] });
    const out = await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w1", now: clock().now });
    expect(out.status).toBe("PREFLIGHT_FAILED");
    expect(port.materialize).not.toHaveBeenCalled();
    expect((await repo.getRun(runId))!.status).toBe("NEEDS_REVIEW");
  });

  it("sin presupuesto suficiente no inicia pasos y libera el lease", async () => {
    const { repo, runId } = await setup(plan());
    const { port } = fakeRuntime();
    const out = await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w1", now: clock().now, budgetMs: 10_000 });
    expect(out).toMatchObject({ status: "ADVANCED", actions: 1 }); // solo materialización
    expect(port.transmit).not.toHaveBeenCalled();
    expect((await repo.getRun(runId))!.lease_expires_at).toBeNull();
  });
});
