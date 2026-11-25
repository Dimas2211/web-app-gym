// ─────────────────────────────────────────────────────────────────
// MH20 — Fase 6: servicios con base de datos SIMULADA (sin bases reales,
// sin red, sin MariaDB real, sin firmador real).
//
//   6C  createReturnEvent / signReturnEvent / transmitReturnEvent /
//       applyReturnTransmissionResult / createReturnInvalidationEvent
//   6E  decideRetransmissionForDocument (historial SEND/QUERY)
//   6G  deliverDteToExternalDb → DELIVERY_BLOCKED_CONTRACT sin INSERT
//   6H  createPendingDteForPurchase (IMP20-029) antes del correlativo
// Aislamiento: todas las lecturas se verifican con tenant_id/location_id.
// ─────────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const { resolveDestMock } = vi.hoisted(() => ({ resolveDestMock: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, { get() { throw new Error("RUNTIME_UNSAFE: se tocó el Prisma global."); } }),
}));
vi.mock("@/modules/platform/runtime/control-plane-prisma", () => ({ controlPlanePrisma: {} }));
vi.mock("../config/resolve-external-dte-destination", () => ({ resolveExternalDteMariaDbDestination: resolveDestMock }));

import type { PrismaClient } from "@prisma/client";
import { resolveMhTerritory20 } from "../utils/dte-territory-projection";
import { buildMhTestScenarioJson } from "../mh-test-runs/mh-test-scenarios";
import { GOLDEN_CTX, GOLDEN_ISSUER, GOLDEN_NOW, goldenDoc, makeFakeDb } from "./__golden__/mh20-fixtures";
import { createReturnEvent } from "./create-return-event.service";
import { signReturnEvent } from "./sign-return-event.service";
import { applyReturnTransmissionResult, transmitReturnEvent } from "./transmit-return-event.service";
import { createReturnInvalidationEvent } from "./create-return-invalidation-event.service";
import { decideRetransmissionForDocument } from "./mh-retransmission-guard";
import { deliverDteToExternalDb } from "./deliver-dte-to-external-db.service";
import { createPendingDteForPurchase } from "./dte-outgoing.service";
import { InMemoryExternalDeliveryLedger } from "../outbox/external-delivery-ledger.memory";

const T = "tenant-a", L = "loc-a";
const STAMP = "2026ABCDEF0123456789ABCDEF0123456789ABCD";
const JWS   = "eyJhbGciOiJSUzUxMiJ9.eyJ4IjoxfQ.c2lnbmF0dXJl";
const GEN   = "C1B2C3D4-E5F6-4234-8678-000000000001";

let FE_V2: Record<string, any>;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(GOLDEN_NOW);
  const fake = makeFakeDb({ docs: {}, issuer: {} }).db as unknown as PrismaClient;
  const e = await resolveMhTerritory20({ role: "emisor", deptCode: GOLDEN_ISSUER.dept_code, municipalityCode: GOLDEN_ISSUER.municipality_code }, fake);
  if (!e.ok) throw new Error(e.error);
  const built = buildMhTestScenarioJson(GOLDEN_CTX, "FE01_IDENTIFICADO", { ...goldenDoc("01", 9), generation_code: GEN }, 3, GOLDEN_NOW, {
    profile: "MH_2_0", territories: { emisor: e.territory, receptor: null },
  });
  if (!built.ok) throw new Error(built.error);
  FE_V2 = built.json as Record<string, any>;
});
afterAll(() => vi.useRealTimers());
afterEach(() => { delete process.env.DTE_MH20_PROFILE_ENABLED; vi.clearAllMocks(); });

const ISSUER_ROW = {
  id: "iss-1", mh_spec_profile: "MH_2_0", nit: "06141234567890", name: "EMISOR DE PRUEBA SA DE CV", legal_name: null,
  establishment_type_code: "02", establishment_code: "M001", cod_estable_mh: "M001",
  point_of_sale_code: "P001", cod_punto_venta_mh: "P001", phone: "22223333", email: "f@e.test", environment: "TEST",
};

function originDoc(over: Record<string, unknown> = {}) {
  return {
    id: "doc-1", tenant_id: T, location_id: L, dte_type_code: "01", dte_status: "ACCEPTED", generation_code: GEN,
    reception_stamp: STAMP, json_document: FE_V2, issuer_config_id: "iss-1", environment: "TEST",
    accepted_at: GOLDEN_NOW, invalidated_at: null, ...over,
  };
}

function returnDb(opts: { docs?: any[]; priorItems?: any[]; issuer?: any } = {}) {
  const docs = opts.docs ?? [originDoc()];
  const created: any[] = [];
  const tx = {
    $queryRaw: vi.fn(async () => []),
    dteOutgoingDocument: {
      findMany: vi.fn(async ({ where }: any) =>
        docs.filter((d) => where.id.in.includes(d.id) && d.tenant_id === where.tenant_id && d.location_id === where.location_id)),
      update: vi.fn(() => { throw new Error("El DTE original no debe modificarse."); }),
    },
    dteIssuerConfig: { findFirst: vi.fn(async () => opts.issuer ?? ISSUER_ROW) },
    dteReturnEventItem: { findMany: vi.fn(async () => opts.priorItems ?? []) },
    dteReturnEvent: { create: vi.fn(async (a: any) => { created.push(a); return { id: "ret-1" }; }) },
  };
  const db = { $transaction: vi.fn(async (fn: any) => fn(tx)) };
  return { db: db as unknown as PrismaClient, tx, created };
}

// ── 6C ─────────────────────────────────────────────────────────────
describe("6C createReturnEvent", () => {
  const line = { dteDocumentId: "doc-1", sourceItemNo: 1, quantity: 1 };

  it("interruptor OFF → MH_1_2 → no existe Retorno (sin persistir)", async () => {
    const { db, tx } = returnDb();
    const r = await createReturnEvent({ tenantId: T, locationId: L, userId: "u1", lines: [line], now: GOLDEN_NOW }, db);
    // El registro MH_1_2 no define el tipo 18: falla cerrado antes de leer saldos.
    expect(r.ok).toBe(false);
    expect(tx.dteReturnEventItem.findMany).not.toHaveBeenCalled();
    expect(tx.dteReturnEvent.create).not.toHaveBeenCalled();
  });

  it("ON + TEST → DRAFT con ítems; lock y lecturas con tenant/location; DTE original intacto", async () => {
    process.env.DTE_MH20_PROFILE_ENABLED = "true";
    const before = JSON.stringify(FE_V2);
    const { db, tx, created } = returnDb();
    const r = await createReturnEvent({ tenantId: T, locationId: L, userId: "u1", lines: [line], now: GOLDEN_NOW }, db);
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.dteOutgoingDocument.findMany.mock.calls[0][0].where).toMatchObject({ tenant_id: T, location_id: L });
    expect(created[0].data).toMatchObject({ tenant_id: T, location_id: L, status: "DRAFT", mh_spec_profile: "MH_2_0", origin_dte_type_code: "01" });
    expect(created[0].data.items.create).toHaveLength(1);
    expect(tx.dteOutgoingDocument.update).not.toHaveBeenCalled();
    expect(JSON.stringify(FE_V2)).toBe(before);
  });

  it("saldo ya retornado por un Retorno vigente → R20-RET-08 (no se sobre-retorna)", async () => {
    process.env.DTE_MH20_PROFILE_ENABLED = "true";
    const l1 = FE_V2.cuerpoDocumento[0];
    const { db, tx } = returnDb({ priorItems: [{ dte_document_id: "doc-1", source_item_no: 1, line_detail: { ...l1 } }] });
    const r = await createReturnEvent({ tenantId: T, locationId: L, userId: "u1", lines: [line], now: GOLDEN_NOW }, db);
    expect(r).toMatchObject({ ok: false, code: "R20-RET-08" });
    expect(tx.dteReturnEvent.create).not.toHaveBeenCalled();
  });

  it("DTE de otro tenant → no visible → error sin persistir", async () => {
    process.env.DTE_MH20_PROFILE_ENABLED = "true";
    const { db, tx } = returnDb({ docs: [originDoc({ tenant_id: "tenant-b" })] });
    const r = await createReturnEvent({ tenantId: T, locationId: L, userId: "u1", lines: [line], now: GOLDEN_NOW }, db);
    expect(r.ok).toBe(false);
    expect(tx.dteReturnEvent.create).not.toHaveBeenCalled();
  });

  it("DTE sin sello / invalidado → R20-RET-01; PRODUCTION → bloqueado (INC-013)", async () => {
    process.env.DTE_MH20_PROFILE_ENABLED = "true";
    for (const over of [{ reception_stamp: null }, { invalidated_at: GOLDEN_NOW }, { dte_status: "REJECTED" }]) {
      const { db } = returnDb({ docs: [originDoc(over)] });
      expect(await createReturnEvent({ tenantId: T, locationId: L, userId: "u1", lines: [line], now: GOLDEN_NOW }, db))
        .toMatchObject({ ok: false, code: "R20-RET-01" });
    }
    const { db } = returnDb({ docs: [originDoc({ environment: "PRODUCTION" })] });
    const prod = await createReturnEvent({ tenantId: T, locationId: L, userId: "u1", lines: [line], now: GOLDEN_NOW }, db);
    expect(prod.ok).toBe(false);
  });
});

describe("6C firma / transmisión / respuesta del Retorno", () => {
  async function draftJson(): Promise<Record<string, unknown>> {
    process.env.DTE_MH20_PROFILE_ENABLED = "true";
    const { db, created } = returnDb();
    const r = await createReturnEvent({ tenantId: T, locationId: L, userId: "u1", lines: [{ dteDocumentId: "doc-1", sourceItemNo: 1, quantity: 1 }], now: GOLDEN_NOW }, db);
    if (!r.ok) throw new Error(r.error);
    return created[0].data.event_json;
  }

  it("firma con firmador simulado: DRAFT → SIGNED", async () => {
    const event_json = await draftJson();
    const update = vi.fn(async () => ({}));
    const db = {
      dteReturnEvent: { findFirst: vi.fn(async () => ({ id: "ret-1", status: "DRAFT", event_json, signed_jws: null, issuer_config_id: "iss-1", environment: "TEST" })), update },
      dteIssuerConfig: { findFirst: vi.fn(async () => ISSUER_ROW) },
    } as unknown as PrismaClient;
    const signer = { sign: vi.fn(async () => ({ ok: true as const, signedJws: JWS })) };
    const resolveSigner = vi.fn(async () => ({ ok: true as const, config: {} as never, nit: "06141234567890", passwordPri: "x" }));
    const r = await signReturnEvent({ returnEventId: "ret-1", userId: "u1", tenantId: T, locationId: L }, db, { signer: signer as never, resolveSigner: resolveSigner as never });
    expect(r).toMatchObject({ ok: true, status: "SIGNED" });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SIGNED", signed_jws: JWS }) }));
    expect((db as any).dteReturnEvent.findFirst.mock.calls[0][0].where).toMatchObject({ tenant_id: T, location_id: L });
  });

  it("transmisión bloqueada MT-GAP-001 aunque esté firmado", async () => {
    const db = { dteReturnEvent: { findFirst: vi.fn(async () => ({ id: "ret-1", status: "SIGNED", signed_jws: JWS })) } } as unknown as PrismaClient;
    expect(await transmitReturnEvent({ returnEventId: "ret-1", userId: "u1", tenantId: T, locationId: L }, db))
      .toMatchObject({ ok: false, code: "MT-GAP-001" });
  });

  it("respuestas simuladas: PROCESADO+sello → ACCEPTED; RECHAZADO → REJECTED; incierto → conciliación", async () => {
    const update = vi.fn(async () => ({}));
    const db = { dteReturnEvent: { update } } as never;
    const ok = { ok: true as const, selloRecibido: STAMP, codigoMsg: "001", descripcionMsg: "RECIBIDO", observaciones: [], httpStatus: 200 };
    expect(await applyReturnTransmissionResult(db, { returnEventId: "r", userId: null, result: { ...ok, mhEstado: "PROCESADO" } })).toEqual({ ok: true, status: "ACCEPTED" });
    expect(await applyReturnTransmissionResult(db, { returnEventId: "r", userId: null, result: { ...ok, mhEstado: "PROCESADO", selloRecibido: "corto" } }))
      .toMatchObject({ code: "REQUIRES_RECONCILIATION" });
    expect(await applyReturnTransmissionResult(db, { returnEventId: "r", userId: null, result: { ...ok, mhEstado: "RECHAZADO", selloRecibido: null } })).toEqual({ ok: true, status: "REJECTED" });
    expect(await applyReturnTransmissionResult(db, { returnEventId: "r", userId: null, result: { ok: false, errorCode: "MH_EVENT_TIMEOUT", message: "t", uncertain: true } }))
      .toMatchObject({ code: "REQUIRES_RECONCILIATION" });
  });

  it("invalidación del Retorno: ACCEPTED → DRAFT v3 tipoDte 18, numeroControl null; no ACCEPTED → error", async () => {
    const event_json = await draftJson();
    const created: any[] = [];
    const mk = (status: string) => ({
      dteReturnEvent: { findFirst: vi.fn(async () => ({ id: "ret-1", status, generation_code: "D1B2C3D4-E5F6-4234-8678-000000000009", mh_sello_recibido: status === "ACCEPTED" ? STAMP : null, event_json, issuer_config_id: "iss-1", environment: "TEST", accepted_at: GOLDEN_NOW })) },
      dteReturnInvalidationEvent: { findFirst: vi.fn(async () => null), create: vi.fn(async (a: any) => { created.push(a); return { id: "rinv-1" }; }) },
      dteIssuerConfig: { findFirst: vi.fn(async () => ISSUER_ROW) },
    }) as unknown as PrismaClient;
    const p = { returnEventId: "ret-1", reason: "Retorno con error", responsable: { nombre: "R", tipoDocumento: "13", numeroDocumento: "000000000" }, solicita: { nombre: "S", tipoDocumento: "13", numeroDocumento: "000000000" }, userId: "u1", tenantId: T, locationId: L, now: GOLDEN_NOW };
    const r = await createReturnInvalidationEvent(p, mk("ACCEPTED"));
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    expect(created[0].data.event_json.documento).toMatchObject({ tipoDte: "18", numeroControl: null });
    expect(created[0].data.event_json.motivo).toMatchObject({ tipoAnulacion: 2 });
    expect(created[0].data).toMatchObject({ tenant_id: T, location_id: L, status: "DRAFT", mh_spec_profile: "MH_2_0" });
    expect((await createReturnInvalidationEvent(p, mk("SIGNED"))).ok).toBe(false);
  });
});

// ── 6E ─────────────────────────────────────────────────────────────
describe("6E decideRetransmissionForDocument", () => {
  it("timeout sin consulta → QUERY_FIRST; tras consulta 'no encontrado' → TRANSMIT", async () => {
    const rows: any[] = [{ operation_type: "SEND", response_body: { errorCode: "MH_TRANSMISSION_TIMEOUT" }, created_at: new Date(1) }];
    const db = { dteTransmissionLog: { findMany: vi.fn(async () => rows) } } as never;
    expect((await decideRetransmissionForDocument(db, "d1")).action).toBe("QUERY_FIRST");
    rows.push({ operation_type: "QUERY", response_body: { kind: "QUERY_NOT_FOUND" }, created_at: new Date(2) });
    expect((await decideRetransmissionForDocument(db, "d1")).action).toBe("TRANSMIT");
  });
});

// ── 6G ─────────────────────────────────────────────────────────────
describe("6G deliverDteToExternalDb — compatibilidad 2.0 del destino", () => {
  const CONFIG = { host: "mock", port: 3306, user: "u", password: "p", database: "db", table: "dte", invalidationTable: "inv", enabled: true, timeoutMs: 1000 };
  function runtime(json: unknown) {
    return {
      dteOutgoingDocument: { findFirst: vi.fn(async () => ({
        id: "doc-1", tenant_id: T, location_id: L, sale_id: "s1", purchase_id: null, dte_type_code: "01",
        control_number: "DTE-01-M001P001-000000000000009", generation_code: GEN, environment: "TEST",
        dte_status: "ACCEPTED", accepted_at: GOLDEN_NOW, json_document: json, signed_jws: JWS,
        reception_stamp: STAMP, mh_response: { estado: "PROCESADO" }, retry_count: 0, purpose: "OPERATIONAL",
      })) },
      dteTransmissionLog: { findMany: vi.fn(async () => []), create: vi.fn(async () => ({})) },
    } as unknown as PrismaClient;
  }
  const base = { dteDocumentId: "doc-1", userId: "u1", tenantId: T, locationId: L, organizationId: "org-a", allowLegacyEnvFallback: false };

  it("FE v2 + destino sin acceptsMh20 → sin INSERT, ledger FAILED_RETRYABLE DELIVERY_BLOCKED_CONTRACT", async () => {
    resolveDestMock.mockResolvedValue({ status: "CONFIGURED", source: "ORGANIZATION", config: CONFIG, integrationId: "int-1" });
    const ledger = new InMemoryExternalDeliveryLedger();
    const insert = vi.fn();
    const r = await deliverDteToExternalDb({ ...base, client: runtime(FE_V2) }, { ledger, adapter: { insert }, getOrganizationTenantId: async () => T });
    expect(r).toMatchObject({ ok: false, errorCode: "DELIVERY_BLOCKED_CONTRACT" });
    expect(insert).not.toHaveBeenCalled();
    const job = await ledger.get((r as { jobId: string }).jobId);
    expect(job).toMatchObject({ status: "FAILED_RETRYABLE", last_error_code: "DELIVERY_BLOCKED_CONTRACT" });
  });

  it("FE v2 + destino con acceptsMh20 → INSERT con el contrato sin cambios", async () => {
    resolveDestMock.mockResolvedValue({ status: "CONFIGURED", source: "ORGANIZATION", config: { ...CONFIG, acceptsMh20: true }, integrationId: "int-1" });
    const insert = vi.fn(async () => ({ ok: true as const, outcome: "CONFIRMED" as const, insertId: 1, affectedRows: 1, targetTable: "dte", targetDatabase: "db" }));
    const r = await deliverDteToExternalDb({ ...base, client: runtime(FE_V2) }, { ledger: new InMemoryExternalDeliveryLedger(), adapter: { insert }, getOrganizationTenantId: async () => T });
    expect(r.ok).toBe(true);
    const payload = (insert.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(expect.arrayContaining(["identificacion", "codigoEmpresa", "responseMH", "token"]));
    expect(payload).not.toHaveProperty("firmaElectronica");
  });

  it("legado sin organización y sin declaración → bloqueado sin INSERT", async () => {
    resolveDestMock.mockResolvedValue({ status: "CONFIGURED", source: "PLATFORM_NATIVE_LEGACY_ENV", config: CONFIG });
    const insert = vi.fn();
    const r = await deliverDteToExternalDb({ ...base, organizationId: null, allowLegacyEnvFallback: true, client: runtime(FE_V2) }, { adapter: { insert } });
    expect(r).toMatchObject({ ok: false, errorCode: "DELIVERY_BLOCKED_CONTRACT" });
    expect(insert).not.toHaveBeenCalled();
  });
});

// ── 6H / IMP20-029 ─────────────────────────────────────────────────
describe("IMP20-029 createPendingDteForPurchase con MH_2_0", () => {
  function fseDb(retention: boolean) {
    const tx = {
      purchase: { findFirst: vi.fn(async () => ({ id: "p1", status: "CONFIRMED", document_type: "FSE", retention_1pct_applies: retention, supplier: { id: "s", taxpayer_type: "EXCLUDED_SUBJECT" }, _count: { items: 1 } })) },
      dteOutgoingDocument: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []), create: vi.fn(async () => ({ id: "dte-1" })) },
      dteIssuerConfig: { findFirst: vi.fn(async () => ({ id: "iss-1", cod_estable_mh: "M001", cod_punto_venta_mh: "P001", mh_spec_profile: "MH_2_0" })) },
      dteCorrelative: {
        createMany: vi.fn(async () => ({ count: 1 })), // COR-01: alta atómica (antes upsert)
        findUniqueOrThrow: vi.fn(async () => ({ last_sequence: 0, external_baseline_last_used_sequence: 0 })),
        update: vi.fn(async () => ({ last_sequence: 1 })),
      },
    };
    return { db: { $transaction: vi.fn(async (fn: any) => fn(tx)) } as never, tx };
  }
  const input = { purchase_id: "p1", issuer_config_id: "iss-1", environment: "TEST" as const };

  it("MH_2_0 + retención 1 % → rechazo ANTES del correlativo", async () => {
    process.env.DTE_MH20_PROFILE_ENABLED = "true";
    const { db, tx } = fseDb(true);
    const r = await createPendingDteForPurchase(T, L, "u1", input, db);
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toMatch(/retención IVA del 1 %/);
    expect(tx.dteCorrelative.createMany).not.toHaveBeenCalled();
    expect(tx.dteOutgoingDocument.create).not.toHaveBeenCalled();
  });

  it("interruptor OFF (MH_1_2) → comportamiento previo, aun con retención", async () => {
    const { db, tx } = fseDb(true);
    expect(await createPendingDteForPurchase(T, L, "u1", input, db)).toMatchObject({ ok: true });
    expect(tx.dteOutgoingDocument.create).toHaveBeenCalledTimes(1);
  });

  it("MH_2_0 sin retención → crea el pendiente", async () => {
    process.env.DTE_MH20_PROFILE_ENABLED = "true";
    const { db } = fseDb(false);
    expect(await createPendingDteForPurchase(T, L, "u1", input, db)).toMatchObject({ ok: true });
  });
});
