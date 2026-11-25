// MH20 — Fase 9.0: runner MH TEST 2.0 conectado (planner → runtime-port →
// motor → builders canónicos → validador por versión → firma → adaptador MH
// → auditoría del Control Plane). TODO con mocks: sin red, sin Hacienda, sin
// MariaDB, sin firmador real y sin bases reales. Receptores = fixtures.

import type { DteOutgoingStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { planMhTestRun } from "./mh-test-run.planner";
import { advanceMhTestRun } from "./mh-test-run.engine";
import { createInMemoryMhTestRunRepository, type MhTestRunProfileRecord } from "./mh-test-run.repository";
import { evaluateMh20RunGate, MH20_TEST_RUN_CONFIRM_TEXT, MH_TEST_RUN_CONFIRM_TEXT } from "./mh-test-run.flags";
import { runMh20RuntimePreflight, type MhTestRuntimePort } from "./mh-test-run.runtime-port";
import {
  buildMhTestScenarioJson,
  mhTestBuildOptionsForProfile,
  MH_TEST_SCENARIOS,
  type MhTestScenarioCode,
} from "@/modules/commerce/dte/mh-test-runs/mh-test-scenarios";
import { validateDteJsonAgainstOfficialSchema } from "@/modules/commerce/dte/services/validate-dte-json-schema.service";
import { buildInvalidationEventJsonV3 } from "@/modules/commerce/dte/services/build-invalidation-event-json.v3";
import { validateMhEventJson } from "@/modules/commerce/dte/spec/validate-mh-event-json";
import { generateNcJsonForDte } from "@/modules/commerce/dte/services/generate-nc-json.service";
import { checkDteDocumentSpecCoherence } from "@/modules/commerce/dte/spec/dte-spec-guard";
import { resolveIssuerSpecProfileForGeneration } from "@/modules/commerce/dte/spec/resolve-issuer-spec-profile";
import {
  applyMhTestRunSpecProfileOverride,
  createMhTestRunSpecProfileOverride,
  type MhTestRunSpecProfileOverride,
} from "@/modules/commerce/dte/spec/mh-test-run-profile-override";
import { GOLDEN_CTX, GOLDEN_ISSUER, makeFakeDb } from "@/modules/commerce/dte/services/__golden__/mh20-fixtures";

const ORG = "org-pilot";
const OPEN_ENV = {
  DTE_MH_TEST_RUNS_ENABLED: "true",
  DTE_MH_TEST_RUNS_M4_APPLIED: "true",
  DTE_MH_TEST_RUNS_MH20_ENABLED: "true",
  DTE_MH_TEST_RUNS_MH20_ORGANIZATIONS: `other-org, ${ORG}`,
} as unknown as NodeJS.ProcessEnv;
const SNAPSHOT = { cod_estable_mh: "M001", cod_punto_venta_mh: "P001", dept_code: "05", municipality_code: "11" };
const RESPONSIBLE = { name: "Responsable Fixture", docTypeCode: "13" as const, documentNumber: "000000000" };
const STAMP = (n: number) => `2026SELLOFIXTURE${String(n).padStart(24, "0")}`;
const override20 = (issuerConfigId = "iss-1") => createMhTestRunSpecProfileOverride({ runId: "run-x", issuerConfigId, profile: "MH_2_0" });

afterEach(() => { delete process.env.DTE_MH20_PROFILE_ENABLED; });

// ── 1. Puerta de ejecución 2.0 ────────────────────────────────────

describe("Fase 9.0 — puerta de ejecución MH 2.0 (Control Plane)", () => {
  const base = { organizationId: ORG, environment: "TEST", planProfile: "MH_2_0" as const, requireRunProfile: false };

  it("cerrada por defecto: sin flags no hay ejecución 2.0", () => {
    const errs = evaluateMh20RunGate(base, {} as NodeJS.ProcessEnv);
    expect(errs.join(" ")).toMatch(/DTE_MH_TEST_RUNS_ENABLED/);
    expect(errs.join(" ")).toMatch(/DTE_MH_TEST_RUNS_M4_APPLIED/);
    expect(errs.join(" ")).toMatch(/DTE_MH_TEST_RUNS_MH20_ENABLED/);
    expect(errs.join(" ")).toMatch(/no autorizada/);
  });
  it("abierta solo con todas las condiciones y la organización en la lista", () => {
    expect(evaluateMh20RunGate(base, OPEN_ENV)).toEqual([]);
    expect(evaluateMh20RunGate({ ...base, organizationId: "org-x" }, OPEN_ENV).join(" ")).toMatch(/no autorizada/);
  });
  it.each([
    ["DTE_MH_TEST_RUNS_ENABLED"], ["DTE_MH_TEST_RUNS_M4_APPLIED"], ["DTE_MH_TEST_RUNS_MH20_ENABLED"],
  ])("falta %s → cerrada", (flag) => {
    expect(evaluateMh20RunGate(base, { ...OPEN_ENV, [flag]: "TRUE" } as NodeJS.ProcessEnv).length).toBeGreaterThan(0);
  });
  it("PRODUCTION nunca: la corrida debe ser TEST", () => {
    expect(evaluateMh20RunGate({ ...base, environment: "PRODUCTION" }, OPEN_ENV).join(" ")).toMatch(/solo existen en ambiente TEST/);
  });
  it("motor: exige fila M4 coherente con el plan y con snapshot", () => {
    const m = { ...base, requireRunProfile: true };
    expect(evaluateMh20RunGate({ ...m, runProfile: null }, OPEN_ENV).join(" ")).toMatch(/Falta la fila M4/);
    expect(evaluateMh20RunGate({ ...m, runProfile: { mh_spec_profile: "MH_1_2", issuer_snapshot: SNAPSHOT } }, OPEN_ENV).join(" ")).toMatch(/no coincide/);
    expect(evaluateMh20RunGate({ ...m, runProfile: { mh_spec_profile: "MH_2_0", issuer_snapshot: {} } }, OPEN_ENV).join(" ")).toMatch(/snapshot/);
    expect(evaluateMh20RunGate({ ...m, runProfile: { mh_spec_profile: "MH_2_0", issuer_snapshot: SNAPSHOT } }, OPEN_ENV)).toEqual([]);
  });
  it("confirmación 2.0 distinta de la 1.2", () => {
    expect(MH20_TEST_RUN_CONFIRM_TEXT).not.toBe(MH_TEST_RUN_CONFIRM_TEXT);
    expect(MH20_TEST_RUN_CONFIRM_TEXT).toMatch(/MH 2\.0/);
  });
});

// ── 2. Override de perfil por corrida ─────────────────────────────

describe("Fase 9.0 — perfil explícito de la corrida (override)", () => {
  const throwingDb = new Proxy({}, { get: () => { throw new Error("no debe consultar la BD"); } }) as unknown as PrismaClient;

  it("TEST + emisor de la corrida → MH_2_0 sin interruptor global ni lectura de M1", async () => {
    expect(process.env.DTE_MH20_PROFILE_ENABLED).toBeUndefined();
    const r = await resolveIssuerSpecProfileForGeneration(throwingDb, "iss-1", "t1", "l1", "TEST", "01", override20());
    expect(r).toEqual({ ok: true, profile: "MH_2_0", warning: null });
  });
  it("PRODUCTION → error (nunca cae al perfil del emisor)", async () => {
    const r = await resolveIssuerSpecProfileForGeneration(throwingDb, "iss-1", "t1", "l1", "PRODUCTION", "01", override20());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/PRODUCTION bloqueado/);
  });
  it("otro emisor → error", () => {
    expect(applyMhTestRunSpecProfileOverride(override20("iss-1"), { issuerConfigId: "iss-2", environment: "TEST" }).ok).toBe(false);
    expect(applyMhTestRunSpecProfileOverride(override20("iss-1"), { issuerConfigId: null, environment: "TEST" }).ok).toBe(false);
  });
  it("tipos bloqueados siguen bloqueados con override (contingencia v4)", async () => {
    const r = await resolveIssuerSpecProfileForGeneration(throwingDb, "iss-1", "t1", "l1", "TEST", "CONT", override20());
    expect(r.ok).toBe(false);
  });
  it("sin override e interruptor OFF → MH_1_2 (comportamiento histórico)", async () => {
    const r = await resolveIssuerSpecProfileForGeneration(throwingDb, "iss-1", "t1", "l1", "TEST", "01");
    expect(r).toEqual({ ok: true, profile: "MH_1_2", warning: null });
  });
  it("perfil desconocido → no se construye", () => {
    expect(() => createMhTestRunSpecProfileOverride({ runId: "r", issuerConfigId: "i", profile: "MH_9" })).toThrow(/perfil desconocido/);
  });
});

// ── 3. Seis escenarios prioritarios, individualmente ──────────────

function build20(scenario: MhTestScenarioCode, seq: number) {
  const opts = mhTestBuildOptionsForProfile(GOLDEN_CTX, scenario, "MH_2_0");
  if (!opts.ok) throw new Error(opts.error);
  const t = MH_TEST_SCENARIOS[scenario].dteTypeCode;
  const r = buildMhTestScenarioJson(GOLDEN_CTX, scenario, {
    control_number: `DTE-${t}-M001P001-${String(seq).padStart(15, "0")}`,
    generation_code: `A1B2C3D4-E5F6-4234-8678-${String(seq).padStart(12, "0")}`,
    transmission_type_code: "1", contingency_type_code: null, contingency_reason: null,
  }, seq, new Date(), opts.options);
  if (!r.ok) throw new Error(r.error);
  return r.json as Record<string, any>;
}

async function ncV4Over(ccfJson: any, override: MhTestRunSpecProfileOverride | null) {
  const { db, updates } = makeFakeDb({
    docs: {
      "nc-1": {
        id: "nc-1", dte_type_code: "05", dte_status: "PENDING_GENERATION", mh_spec_profile: null,
        generation_code: "B1B2C3D4-E5F6-4234-8678-9ABCDEF01234", control_number: "DTE-05-M001P001-000000000000004",
        environment: "TEST", issuer_config_id: "iss-1", json_document: null,
      },
      "ccf-1": {
        id: "ccf-1", dte_type_code: "03", dte_status: "ACCEPTED",
        generation_code: ccfJson.identificacion.codigoGeneracion, control_number: ccfJson.identificacion.numeroControl,
        reception_stamp: STAMP(3), json_document: ccfJson,
      },
    },
    issuer: GOLDEN_ISSUER as unknown as Record<string, unknown>,
    relation: { related_dte_document_id: "ccf-1" },
  });
  const res = await generateNcJsonForDte(
    { dteDocumentId: "nc-1", userId: "u1", tenantId: "t1", locationId: "l1", specProfileOverride: override },
    db as unknown as PrismaClient,
  );
  return { res, update: updates[0]?.data };
}

describe("Fase 9.0 — escenarios prioritarios con builders canónicos (sin payloads paralelos)", () => {
  it.each([
    ["FE01_IDENTIFICADO", "01", 2], ["FE01_CONSUMIDOR_FINAL", "01", 2], ["CCFE03_ESTANDAR", "03", 4],
    ["FSE14_SERVICIOS", "14", 2], ["FEX11_SERVICIOS", "11", 3],
  ] as const)("%s → versión %s v%i válida contra el schema oficial y coherente con MH_2_0", (scenario, type, version) => {
    const json = build20(scenario, 7);
    expect(json.identificacion.version).toBe(version);
    expect(validateDteJsonAgainstOfficialSchema(type, json)).toEqual({ ok: true });
    expect(checkDteDocumentSpecCoherence({ kind: type, jsonDocument: json, persistedProfile: "MH_2_0" }).ok).toBe(true);
  });

  it("NC v4 sobre CCF v4 con el override de la corrida (interruptor global OFF) → v4 y perfil persistido", async () => {
    const { res, update } = await ncV4Over(build20("CCFE03_ESTANDAR", 3), override20());
    expect(res.ok, res.ok ? "" : res.message).toBe(true);
    const json = update?.json_document as Record<string, any>;
    expect(json.identificacion.version).toBe(4);
    expect(update?.mh_spec_profile).toBe("MH_2_0");
    expect(validateDteJsonAgainstOfficialSchema("05", json)).toEqual({ ok: true });
  });
  it("NC sin override con interruptor OFF → v3 histórica, sin escribir mh_spec_profile", async () => {
    const { res, update } = await ncV4Over(build20("CCFE03_ESTANDAR", 3), null);
    expect(res.ok).toBe(true);
    expect((update?.json_document as any).identificacion.version).toBe(3);
    expect(update).not.toHaveProperty("mh_spec_profile");
  });

  it.each([["01", "FE01_IDENTIFICADO"], ["03", "CCFE03_ESTANDAR"]] as const)(
    "Invalidación v3 sobre %s aceptado → válida contra el schema oficial de eventos", (type, scenario) => {
      const target = build20(scenario, 5);
      const r = buildInvalidationEventJsonV3({
        issuerConfig: { ...(GOLDEN_ISSUER as any) },
        target: {
          tipoDte: type, generationCode: target.identificacion.codigoGeneracion, receptionStamp: STAMP(5),
          controlNumber: target.identificacion.numeroControl, fecEmi: target.identificacion.fecEmi,
          receptor: type === "01"
            ? { tipoDocumento: "13", numDocumento: "00000000-0", nombre: "RECEPTOR FIXTURE", correo: "r@fixture.test", telefono: null }
            : { tipoDocumento: "36", numDocumento: "06140000000000", nombre: "CONTRIBUYENTE FIXTURE SA DE CV", correo: "c@fixture.test", telefono: "22220000" },
        },
        eventGenerationCode: "C1B2C3D4-E5F6-4234-8678-000000000001", invalidationTypeCode: "2",
        reason: "Prueba de certificación MH (ambiente TEST)", replacementGenerationCode: null,
        responsable: { nombre: "RESPONSABLE FIXTURE", tipoDocumento: "13", numeroDocumento: "000000000" },
        solicita: { nombre: "RESPONSABLE FIXTURE", tipoDocumento: "13", numeroDocumento: "000000000" },
        now: new Date(),
      } as any);
      expect(r.ok, r.ok ? "" : r.error).toBe(true);
      if (!r.ok) return;
      expect((r.eventJson as any).identificacion.version).toBe(3);
      expect(validateMhEventJson("INV", r.eventJson).ok).toBe(true);
    });
});

// ── 4. Recorrido completo con el motor (mocks) ────────────────────

interface FakeDoc { id: string; key: string; type: string; control: string; gen: string; status: string; json: any; stamp: string | null }

function makeFakePort(opts: { failFirstTransmit?: string }) {
  const docs = new Map<string, FakeDoc>();
  const events = new Map<string, { id: string; docId: string; status: string; json: any; stamp: string | null }>();
  const mhCalls: Array<{ kind: string; version: number; codigoGeneracion: string }> = [];
  const logs = new Map<string, number>();
  let n = 0;
  const byId = (id: string) => [...docs.values()].find((d) => d.id === id)!;
  const port: MhTestRuntimePort = {
    preflight: vi.fn(async () => ({ ok: true, errors: [] })),
    materialize: vi.fn(async (items) => {
      for (const it of items) {
        if (docs.has(it.key)) continue;
        const gen = `D1B2C3D4-E5F6-4234-8678-${String(++n).padStart(12, "0")}`;
        docs.set(it.key, {
          id: `doc-${n}`, key: it.key, type: it.dteTypeCode, gen, status: "PENDING_GENERATION", json: null, stamp: null,
          control: `DTE-${it.dteTypeCode}-M001P001-${String(it.plannedSequence).padStart(15, "0")}`,
        });
      }
      return { ok: true as const, recovered: false, docs: items.map((it: { key: string }) => { const d = docs.get(it.key)!; return { key: it.key, dteDocumentId: d.id, controlNumber: d.control, generationCode: d.gen }; }) };
    }),
    readDoc: vi.fn(async (key) => {
      const d = docs.get(key);
      return d ? {
        id: d.id, certification_item_key: d.key, dte_type_code: d.type, dte_status: d.status as DteOutgoingStatus, control_number: d.control,
        generation_code: d.gen, reception_stamp: d.stamp, mh_response: null, transmission_type_code: "1", retry_count: 0,
      } : null;
    }),
    // Misma ruta que generateMhTestDocumentJson: opciones de perfil + builder canónico.
    generate: vi.fn(async ({ key, scenario, index }) => {
      const d = docs.get(key)!;
      const o = mhTestBuildOptionsForProfile(GOLDEN_CTX, scenario, "MH_2_0");
      if (!o.ok) return { ok: false as const, error: o.error };
      const r = buildMhTestScenarioJson(GOLDEN_CTX, scenario, {
        control_number: d.control, generation_code: d.gen, transmission_type_code: "1", contingency_type_code: null, contingency_reason: null,
      }, index, new Date(), o.options);
      if (!r.ok) return { ok: false as const, error: r.error };
      d.json = r.json; d.status = "GENERATED";
      return { ok: true as const };
    }),
    validate: vi.fn(async (id) => {
      const d = byId(id);
      const v = validateDteJsonAgainstOfficialSchema(d.type, d.json);
      if (!v.ok) return { ok: false as const, error: v.error };
      d.status = "SCHEMA_VALIDATED";
      return { ok: true as const };
    }),
    sign: vi.fn(async (id) => {
      const d = byId(id);
      const c = checkDteDocumentSpecCoherence({ kind: d.type, jsonDocument: d.json, persistedProfile: "MH_2_0" });
      if (!c.ok) return { ok: false as const, error: c.error };
      d.status = "SIGNED";
      return { ok: true as const };
    }),
    // Adaptador MH simulado: registra versión enviada y responde ACCEPTED (o error incierto una vez).
    transmit: vi.fn(async (id) => {
      const d = byId(id);
      logs.set(`${id}:SEND`, (logs.get(`${id}:SEND`) ?? 0) + 1);
      if (opts.failFirstTransmit === d.type && !mhCalls.some((c) => c.codigoGeneracion === d.gen)) {
        mhCalls.push({ kind: d.type, version: d.json.identificacion.version, codigoGeneracion: d.gen });
        return { ok: false as const, error: "timeout simulado" };
      }
      mhCalls.push({ kind: d.type, version: d.json.identificacion.version, codigoGeneracion: d.gen });
      d.status = "ACCEPTED"; d.stamp = STAMP(mhCalls.length);
      return { ok: true as const, dteStatus: "ACCEPTED" as const, mhEstado: "PROCESADO", descripcionMsg: "RECIBIDO", selloRecibido: d.stamp } as any;
    }),
    reconcile: vi.fn(async () => ({ status: "PENDING_UNCHANGED", queryKind: "NOT_FOUND" } as any)),
    lastLog: vi.fn(async (id, op) => ({ attempt: logs.get(`${id}:${op}`) ?? 0, errorCode: null, count: logs.get(`${id}:${op}`) ?? 0 })),
    prepareCreditNote: vi.fn(async (ncKey, ccfeKey) => {
      const nc = docs.get(ncKey)!; const ccf = docs.get(ccfeKey)!;
      const { res, update } = await ncV4Over(ccf.json, override20());
      if (!res.ok) return { ok: false as const, error: res.message };
      nc.json = { ...(update!.json_document as any), identificacion: { ...(update!.json_document as any).identificacion, numeroControl: nc.control, codigoGeneracion: nc.gen } };
      nc.status = "GENERATED";
      return { ok: true as const };
    }),
    cancelUnsigned: vi.fn(async () => true),
    findInvalidation: vi.fn(async (docId, eventId) => {
      const e = [...events.values()].find((x) => x.docId === docId && (!eventId || x.id === eventId));
      return e ? { id: e.id, status: e.status, mh_sello_recibido: e.stamp } : null;
    }),
    createInvalidation: vi.fn(async (docId) => {
      const d = byId(docId);
      const r = buildInvalidationEventJsonV3({
        issuerConfig: { ...(GOLDEN_ISSUER as any) },
        target: {
          tipoDte: d.type, generationCode: d.gen, receptionStamp: d.stamp, controlNumber: d.control, fecEmi: d.json.identificacion.fecEmi,
          receptor: { tipoDocumento: "13", numDocumento: "00000000-0", nombre: "RECEPTOR FIXTURE", correo: "r@fixture.test", telefono: null },
        },
        eventGenerationCode: "C1B2C3D4-E5F6-4234-8678-000000000009", invalidationTypeCode: "2", reason: "Prueba MH TEST",
        replacementGenerationCode: null,
        responsable: { nombre: "RESPONSABLE FIXTURE", tipoDocumento: "13", numeroDocumento: "000000000" },
        solicita: { nombre: "RESPONSABLE FIXTURE", tipoDocumento: "13", numeroDocumento: "000000000" },
        now: new Date(),
      } as any);
      if (!r.ok) return { ok: false as const, error: r.error };
      if (!validateMhEventJson("INV", r.eventJson).ok) return { ok: false as const, error: "schema v3" };
      const id = `ev-${events.size + 1}`;
      events.set(id, { id, docId, status: "DRAFT", json: r.eventJson, stamp: null });
      return { ok: true as const, eventId: id };
    }),
    signInvalidation: vi.fn(async (id) => { events.get(id)!.status = "SIGNED"; return { ok: true as const }; }),
    transmitInvalidation: vi.fn(async (id) => {
      const e = events.get(id)!;
      mhCalls.push({ kind: "INV", version: e.json.identificacion.version, codigoGeneracion: e.json.identificacion.codigoGeneracion });
      e.status = "ACCEPTED"; e.stamp = STAMP(900);
      return { ok: true as const, eventStatus: "ACCEPTED" as const, mhEstado: "PROCESADO", descripcion: "RECIBIDO", sello: e.stamp };
    }),
    findContingency: vi.fn(async () => null),
    emissionWindow: vi.fn(),
    createContingency: vi.fn(),
    buildContingency: vi.fn(),
    signContingency: vi.fn(),
    transmitContingency: vi.fn(),
  };
  return { port, docs, events, mhCalls };
}

function plan20(firsts = { "01": 11, "03": 21, "05": 31, "11": 41, "14": 51 }) {
  const planned = planMhTestRun({
    version: 2, specProfile: "MH_2_0", chain: null,
    blocks: [
      { dteTypeCode: "01", firstSequence: firsts["01"], scenarios: [{ scenarioCode: "FE01_IDENTIFICADO", count: 1 }] },
      { dteTypeCode: "03", firstSequence: firsts["03"], scenarios: [{ scenarioCode: "CCFE03_ESTANDAR", count: 1 }] },
      { dteTypeCode: "05", firstSequence: firsts["05"], scenarios: [{ scenarioCode: "NC05_SOBRE_CCFE", count: 1 }] },
      { dteTypeCode: "14", firstSequence: firsts["14"], scenarios: [{ scenarioCode: "FSE14_SERVICIOS", count: 1 }] },
      { dteTypeCode: "11", firstSequence: firsts["11"], scenarios: [{ scenarioCode: "FEX11_SERVICIOS", count: 1 }] },
    ],
    invalidations: [{ targetScenarioCode: "FE01_IDENTIFICADO", count: 1 }],
    receptors: GOLDEN_CTX.receptors, responsible: RESPONSIBLE, contingency: null,
  });
  if (!planned.ok) throw new Error(planned.errors.join("; "));
  return planned;
}

async function createRun(org = ORG, runProfile: MhTestRunProfileRecord | null = { mh_spec_profile: "MH_2_0", issuer_snapshot: SNAPSHOT }) {
  const repo = createInMemoryMhTestRunRepository();
  const planned = plan20();
  const created = await repo.createRun({
    organization_id: org, tenant_id: "t1", location_id: "l1", issuer_config_id: "iss-1", plan: planned.plan,
    items: planned.items, created_by: "platform-admin", authorized_by: "platform-admin",
    runProfile: runProfile ? { ...runProfile, chain_id: null, chain_index: null, chain_total: null } : null,
  }, new Date());
  if (!created.ok) throw new Error("create");
  return { repo, runId: created.runId };
}

describe("Fase 9.0 — motor 2.0 conectado: generación → validación → firma → transmisión → respuesta → auditoría", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-25T16:00:00Z")); });
  afterEach(() => vi.useRealTimers());

  it("FE v2, CCF v4, NC v4 (tras CCF aceptado), FSE v2, FEX v3 e invalidación v3 aceptados con el perfil persistido", async () => {
    const { repo, runId } = await createRun();
    const { port, mhCalls, docs } = makeFakePort({});
    const runtime = vi.fn((_run, rp) => { expect(rp).toEqual({ mh_spec_profile: "MH_2_0", issuer_snapshot: SNAPSHOT }); return port; });

    let out;
    for (let i = 0; i < 6; i++) {
      out = await advanceMhTestRun(runId, { repo, runtime, owner: `w${i}`, budgetMs: 10_000_000, env: OPEN_ENV });
      if (out.status !== "ADVANCED" || out.runStatus === "COMPLETED") break;
    }
    expect(out).toMatchObject({ status: "ADVANCED", runStatus: "COMPLETED" });
    expect(runtime).toHaveBeenCalled();

    // Versiones enviadas a MH = versiones 2.0 del JSON; una transmisión por documento/evento.
    const sent = Object.fromEntries(mhCalls.map((c) => [c.kind, c.version]));
    expect(sent).toEqual({ "01": 2, "03": 4, "05": 4, "14": 2, "11": 3, INV: 3 });
    expect(mhCalls.length).toBe(6);
    expect(new Set(mhCalls.map((c) => c.codigoGeneracion)).size).toBe(6);
    // NC transmitida después del CCF aceptado; la invalidación después de su FE.
    const order = mhCalls.map((c) => c.kind);
    expect(order.indexOf("05")).toBeGreaterThan(order.indexOf("03"));
    expect(order.indexOf("INV")).toBeGreaterThan(order.indexOf("01"));
    // NC v4 relacionada con el CCF.
    const nc = [...docs.values()].find((d) => d.type === "05")!;
    const ccf = [...docs.values()].find((d) => d.type === "03")!;
    expect(nc.json.documentoRelacionado[0].numeroDocumento).toBe(ccf.json.identificacion.codigoGeneracion);

    // Auditoría del Control Plane: cada ítem terminal con sello y estado MH.
    const run = await repo.getRun(runId);
    expect(run!.status).toBe("COMPLETED");
    for (const it of run!.items) {
      expect(it.step).toBe("ACCEPTED");
      expect(it.reception_stamp).toBeTruthy();
    }
    expect(port.preflight).toHaveBeenCalled();
    expect(port.createContingency).not.toHaveBeenCalled();
  });

  it("idempotencia: una corrida terminada no se reprocesa ni retransmite", async () => {
    const { repo, runId } = await createRun();
    const { port, mhCalls } = makeFakePort({});
    for (let i = 0; i < 6; i++) await advanceMhTestRun(runId, { repo, runtime: () => port, owner: `w${i}`, budgetMs: 10_000_000, env: OPEN_ENV });
    const before = mhCalls.length;
    const again = await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w-late", budgetMs: 10_000_000, env: OPEN_ENV });
    expect(again.status).toBe("NOT_PROCESSABLE");
    expect(mhCalls.length).toBe(before);
  });

  it("resultado incierto → UNCERTAIN y sin retransmisión automática", async () => {
    const { repo, runId } = await createRun();
    const { port, mhCalls } = makeFakePort({ failFirstTransmit: "14" });
    for (let i = 0; i < 4; i++) await advanceMhTestRun(runId, { repo, runtime: () => port, owner: `w${i}`, budgetMs: 10_000_000, env: OPEN_ENV });
    const run = await repo.getRun(runId);
    const fse = run!.items.find((i) => i.dte_type_code === "14")!;
    expect(["UNCERTAIN", "NEEDS_REVIEW"]).toContain(fse.step);
    expect(mhCalls.filter((c) => c.kind === "14").length).toBe(1);
  });

  it.each([
    ["sin flags", {} as NodeJS.ProcessEnv, ORG, { mh_spec_profile: "MH_2_0", issuer_snapshot: SNAPSHOT }],
    ["organización no autorizada", OPEN_ENV, "org-other", { mh_spec_profile: "MH_2_0", issuer_snapshot: SNAPSHOT }],
    ["sin fila M4", OPEN_ENV, ORG, null],
    ["fila M4 con otro perfil", OPEN_ENV, ORG, { mh_spec_profile: "MH_1_2", issuer_snapshot: SNAPSHOT }],
  ] as const)("fail-closed (%s): NEEDS_REVIEW sin preflight, sin materializar y sin red", async (_label, env, org, rp) => {
    const { repo, runId } = await createRun(org, rp as MhTestRunProfileRecord | null);
    const { port, mhCalls } = makeFakePort({});
    const out = await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w", budgetMs: 10_000_000, env });
    expect(out.status).toBe("PREFLIGHT_FAILED");
    expect(port.preflight).not.toHaveBeenCalled();
    expect(port.materialize).not.toHaveBeenCalled();
    expect(mhCalls).toEqual([]);
    expect((await repo.getRun(runId))!.last_error).toMatch(/MH20_RUN_BLOCKED/);
  });

  it("aislamiento: la organización autorizada no habilita a otra en el mismo tick", async () => {
    const a = await createRun(ORG);
    const b = await createRun("org-b");
    const pa = makeFakePort({}); const pb = makeFakePort({});
    const ra = await advanceMhTestRun(a.runId, { repo: a.repo, runtime: () => pa.port, owner: "w", budgetMs: 10_000_000, env: OPEN_ENV });
    const rb = await advanceMhTestRun(b.runId, { repo: b.repo, runtime: () => pb.port, owner: "w", budgetMs: 10_000_000, env: OPEN_ENV });
    expect(ra.status).toBe("ADVANCED");
    expect(rb.status).toBe("PREFLIGHT_FAILED");
    expect(pb.port.materialize).not.toHaveBeenCalled();
  });

  it("preflight runtime fallido (p. ej. M1 ausente) → NEEDS_REVIEW sin materializar", async () => {
    const { repo, runId } = await createRun();
    const { port } = makeFakePort({});
    (port.preflight as any).mockResolvedValueOnce({ ok: false, errors: ["Base runtime sin migraciones MH 2.0: M1"] });
    const out = await advanceMhTestRun(runId, { repo, runtime: () => port, owner: "w", budgetMs: 10_000_000, env: OPEN_ENV });
    expect(out.status).toBe("PREFLIGHT_FAILED");
    expect(port.materialize).not.toHaveBeenCalled();
  });
});

// ── 5. Preflight runtime 2.0 (solo lectura, BD falsa) ─────────────

function preflightDb(o: { m1?: boolean; m1b?: boolean; m2?: boolean; issuer?: Record<string, string | null> }) {
  return {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      if (sql.includes("information_schema.tables")) return o.m2 === false ? [] : [{ table_name: "dte_return_events" }];
      const rows = [];
      if (o.m1 !== false) rows.push({ table_name: "dte_issuer_configs", column_name: "mh_spec_profile" });
      if (o.m1b !== false) rows.push({ table_name: "dte_spec_profile_audit_logs", column_name: "new_profile" });
      return rows;
    },
    dteCatalogItem: { count: async () => 10_000 },
    dteIssuerConfig: { findFirst: async () => ({ environment: "TEST", ...SNAPSHOT, ...(o.issuer ?? {}) }) },
  } as unknown as PrismaClient;
}
const scope20 = { organizationId: ORG, tenantId: "t1", locationId: "l1", issuerConfigId: "iss-1", userId: "u", runId: "run-1", profile: "MH_2_0" as const, issuerSnapshot: SNAPSHOT };

describe("Fase 9.0 — preflight runtime MH 2.0", () => {
  it("todo disponible → sin errores", async () => {
    expect(await runMh20RuntimePreflight(preflightDb({}), scope20)).toEqual([]);
  });
  it("M1, M1b o M2 ausentes → error explícito", async () => {
    expect((await runMh20RuntimePreflight(preflightDb({ m1: false }), scope20)).join(" ")).toMatch(/M1:/);
    expect((await runMh20RuntimePreflight(preflightDb({ m1b: false }), scope20)).join(" ")).toMatch(/M1b/);
    expect((await runMh20RuntimePreflight(preflightDb({ m2: false }), scope20)).join(" ")).toMatch(/M2/);
  });
  it("códigos AT inválidos → error", async () => {
    const errs = await runMh20RuntimePreflight(preflightDb({ issuer: { cod_estable_mh: "0001" } }), { ...scope20, issuerSnapshot: { ...SNAPSHOT, cod_estable_mh: "0001" } });
    expect(errs.join(" ")).toMatch(/códigos AT/);
  });
  it("emisor cambiado desde la creación (snapshot M4) → error", async () => {
    const errs = await runMh20RuntimePreflight(preflightDb({ issuer: { municipality_code: "12" } }), scope20);
    expect(errs.join(" ")).toMatch(/cambió desde la creación.*municipality_code/);
  });
  it("sin snapshot o sin runId → error", async () => {
    expect((await runMh20RuntimePreflight(preflightDb({}), { ...scope20, issuerSnapshot: null })).join(" ")).toMatch(/snapshot/);
    expect((await runMh20RuntimePreflight(preflightDb({}), { ...scope20, runId: undefined })).join(" ")).toMatch(/identificador/);
  });
});
