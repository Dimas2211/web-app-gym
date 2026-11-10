// ─────────────────────────────────────────────────────────────────
// FISCAL-ONBOARDING — idempotencia, concurrencia, resultado incierto,
// conciliación, evidencia legada e integridad del payload fiscal en
// deliverDteToExternalDb. Sin MariaDB ni bases reales: adapter y
// destino simulados, ledger en memoria con la semántica de reclamo
// condicional de la implementación Prisma.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveMock } = vi.hoisted(() => ({ resolveMock: vi.fn() }));

vi.mock("../config/resolve-external-dte-destination", () => ({
  resolveExternalDteMariaDbDestination: resolveMock,
}));
vi.mock("@/modules/platform/runtime/control-plane-prisma", () => ({ controlPlanePrisma: {} }));

import { deliverDteToExternalDb } from "./deliver-dte-to-external-db.service";
import { buildExternalDtePayload } from "./build-external-dte-payload.service";
import { InMemoryExternalDeliveryLedger } from "../outbox/external-delivery-ledger.memory";
import type { ExternalDteDeliveryResult } from "../types/external-dte-delivery.types";

const DEST_A = { host: "mariadb-a", port: 3306, user: "ua", password: "pa", database: "db_a", table: "dtes_a", invalidationTable: "", enabled: true, timeoutMs: 5000 };
const DEST_B = { host: "mariadb-b", port: 3306, user: "ub", password: "pb", database: "db_b", table: "dtes_b", invalidationTable: "", enabled: true, timeoutMs: 5000 };

function acceptedDoc(id: string, tenant = "tenant-a") {
  return {
    id, tenant_id: tenant, location_id: "loc-1", sale_id: "sale-1", purchase_id: null,
    dte_type_code: "01", control_number: "DTE-01-00000001-000000000000001", generation_code: `GEN-${id}`.toUpperCase(),
    environment: "TEST", dte_status: "ACCEPTED", accepted_at: new Date("2026-10-30T12:00:00Z"),
    json_document: {
      identificacion: { version: 1, ambiente: "00", tipoDte: "01", numeroControl: "DTE-01-00000001-000000000000001", codigoGeneracion: `GEN-${id}`.toUpperCase(), fecEmi: "2026-10-30", horEmi: "12:00:00", tipoModelo: 1, tipoOperacion: 1, tipoMoneda: "USD" },
      emisor: { nit: "06140000000000", nrc: "1234567", nombre: "Emisor A" },
      resumen: { totalPagar: 100 },
    },
    signed_jws: "eyJhbGciOiJSUzUxMiJ9.payload.signature",
    reception_stamp: "SELLO-123",
    mh_response: { estado: "PROCESADO", selloRecibido: "SELLO-123", fhProcesamiento: "30/10/2026 12:00:01", codigoMsg: "001", descripcionMsg: "RECIBIDO", observaciones: [] },
    retry_count: 0,
  };
}

function fakeClient(docs: Record<string, ReturnType<typeof acceptedDoc>>, logs: Array<{ dte_document_id: string; response_body: unknown; error_message: string | null }> = []) {
  return {
    dteOutgoingDocument: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenant_id: string } }) => {
        const d = docs[where.id];
        return d && d.tenant_id === where.tenant_id ? structuredClone(d) : null;
      }),
      // Cualquier escritura sobre el DTE fiscal sería una violación.
      update: vi.fn(() => { throw new Error("NO SE DEBE MODIFICAR EL DTE"); }),
    },
    dteTransmissionLog: {
      findMany: vi.fn(async ({ where }: { where: { dte_document_id: string } }) => logs.filter((l) => l.dte_document_id === where.dte_document_id)),
      create: vi.fn(async ({ data }: { data: { dte_document_id: string; response_body: unknown; error_message: string | null } }) => {
        logs.push({ dte_document_id: data.dte_document_id, response_body: data.response_body, error_message: data.error_message });
        return {};
      }),
    },
  } as unknown as import("@prisma/client").PrismaClient;
}

function adapterReturning(...results: Array<ExternalDteDeliveryResult | (() => Promise<ExternalDteDeliveryResult>)>) {
  let i = 0;
  const insert = vi.fn(async () => {
    const r = results[Math.min(i++, results.length - 1)];
    return typeof r === "function" ? r() : r;
  });
  return { insert };
}

const CONFIRMED: ExternalDteDeliveryResult = { ok: true, outcome: "CONFIRMED", insertId: 77, affectedRows: 1, targetTable: "dtes_a", targetDatabase: "db_a" };
const UNCERTAIN: ExternalDteDeliveryResult = { ok: false, outcome: "UNCERTAIN", error: "Error al insertar: Query inactivity timeout", errorCode: "INSERT_UNCERTAIN" };
const NOT_INSERTED: ExternalDteDeliveryResult = { ok: false, outcome: "NOT_INSERTED", error: "connect ECONNREFUSED", errorCode: "INSERT_FAILED" };

const base = { userId: "admin-1", tenantId: "tenant-a", locationId: "loc-1", organizationId: "org-a", allowLegacyEnvFallback: false };

beforeEach(() => {
  resolveMock.mockReset();
  resolveMock.mockImplementation(async ({ organizationId }: { organizationId: string | null }) =>
    organizationId === "org-a" ? { status: "CONFIGURED", source: "ORGANIZATION", config: DEST_A, integrationId: "int-a", autoDeliveryEnabled: true }
    : organizationId === "org-b" ? { status: "CONFIGURED", source: "ORGANIZATION", config: DEST_B, integrationId: "int-b", autoDeliveryEnabled: true }
    : { status: "NOT_CONFIGURED" });
});

describe("deliverDteToExternalDb — ledger / idempotencia", () => {
  it("doble clic concurrente: un solo INSERT; el segundo recibe DELIVERY_IN_PROGRESS", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const client = fakeClient({ d1: acceptedDoc("d1") });
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const adapter = adapterReturning(async () => { await gate; return CONFIRMED; });
    const deps = { ledger, adapter, getOrganizationTenantId: async () => "tenant-a" };

    const p1 = deliverDteToExternalDb({ ...base, dteDocumentId: "d1", client }, deps);
    await new Promise((r) => setTimeout(r, 5));
    const r2 = await deliverDteToExternalDb({ ...base, dteDocumentId: "d1", client }, deps);
    release();
    const r1 = await p1;

    expect(r1.ok).toBe(true);
    expect(r2).toMatchObject({ ok: false, errorCode: "DELIVERY_IN_PROGRESS" });
    expect(adapter.insert).toHaveBeenCalledTimes(1);

    const r3 = await deliverDteToExternalDb({ ...base, dteDocumentId: "d1", client }, deps);
    expect(r3).toMatchObject({ ok: false, errorCode: "ALREADY_DELIVERED" });
    expect(adapter.insert).toHaveBeenCalledTimes(1);
  });

  it("10 ejecuciones simultáneas (workers + clics) producen exactamente 1 INSERT", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const client = fakeClient({ d1: acceptedDoc("d1") });
    const adapter = adapterReturning(async () => { await new Promise((r) => setTimeout(r, 10)); return CONFIRMED; });
    const deps = { ledger, adapter, getOrganizationTenantId: async () => "tenant-a" };
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      deliverDteToExternalDb({ ...base, dteDocumentId: "d1", client, trigger: i % 2 ? "AUTO" : "MANUAL" }, deps)));
    expect(adapter.insert).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("timeout posterior al INSERT -> UNCERTAIN, sin reintento automático ni manual hasta conciliar", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const client = fakeClient({ d1: acceptedDoc("d1") });
    const adapter = adapterReturning(UNCERTAIN, CONFIRMED);
    const deps = { ledger, adapter, getOrganizationTenantId: async () => "tenant-a" };

    const r1 = await deliverDteToExternalDb({ ...base, dteDocumentId: "d1", client, trigger: "AUTO" }, deps);
    expect(r1).toMatchObject({ ok: false, errorCode: "UNCERTAIN" });
    const job = [...ledger.rows.values()][0];
    expect(job.status).toBe("UNCERTAIN");
    expect(await ledger.listDue(new Date(Date.now() + 86_400_000), 10)).toHaveLength(0);

    const r2 = await deliverDteToExternalDb({ ...base, dteDocumentId: "d1", client, trigger: "MANUAL" }, deps);
    expect(r2).toMatchObject({ ok: false, errorCode: "REQUIRES_RECONCILIATION" });
    expect(adapter.insert).toHaveBeenCalledTimes(1);
  });

  it("conciliación: receptor confirma que lo tiene -> nunca se reenvía", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const client = fakeClient({ d1: acceptedDoc("d1") });
    const adapter = adapterReturning(UNCERTAIN, CONFIRMED);
    const deps = { ledger, adapter, getOrganizationTenantId: async () => "tenant-a" };
    await deliverDteToExternalDb({ ...base, dteDocumentId: "d1", client }, deps);
    const job = [...ledger.rows.values()][0];
    expect(await ledger.reconcile(job.id, "CONFIRMED_DELIVERED", "admin-1", "Proveedor confirmó fila id 991", new Date())).toMatchObject({ status: "RECONCILED_DELIVERED" });
    const r = await deliverDteToExternalDb({ ...base, dteDocumentId: "d1", client }, deps);
    expect(r).toMatchObject({ ok: false, errorCode: "ALREADY_DELIVERED" });
    expect(adapter.insert).toHaveBeenCalledTimes(1);
  });

  it("conciliación: receptor confirma que NO lo tiene -> un único reenvío controlado", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const client = fakeClient({ d1: acceptedDoc("d1") });
    const adapter = adapterReturning(UNCERTAIN, CONFIRMED);
    const deps = { ledger, adapter, getOrganizationTenantId: async () => "tenant-a" };
    await deliverDteToExternalDb({ ...base, dteDocumentId: "d1", client }, deps);
    const job = [...ledger.rows.values()][0];
    await ledger.reconcile(job.id, "CONFIRMED_NOT_DELIVERED", "admin-1", "Proveedor sin fila para el código", new Date());
    expect((await deliverDteToExternalDb({ ...base, dteDocumentId: "d1", client }, deps)).ok).toBe(true);
    expect((await deliverDteToExternalDb({ ...base, dteDocumentId: "d1", client }, deps))).toMatchObject({ errorCode: "ALREADY_DELIVERED" });
    expect(adapter.insert).toHaveBeenCalledTimes(2);
  });

  it("NOT_INSERTED -> FAILED_RETRYABLE con backoff; AUTO respeta backoff, MANUAL puede reintentar", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const client = fakeClient({ d1: acceptedDoc("d1") });
    const adapter = adapterReturning(NOT_INSERTED, CONFIRMED);
    const now = new Date("2026-11-10T10:00:00Z");
    const deps = { ledger, adapter, getOrganizationTenantId: async () => "tenant-a", now: () => now };

    const r1 = await deliverDteToExternalDb({ ...base, dteDocumentId: "d1", client, trigger: "AUTO" }, deps);
    expect(r1).toMatchObject({ ok: false, errorCode: "INSERT_FAILED" });
    const job = [...ledger.rows.values()][0];
    expect(job.status).toBe("FAILED_RETRYABLE");
    expect(job.next_attempt_at!.getTime()).toBeGreaterThan(now.getTime());

    const r2 = await deliverDteToExternalDb({ ...base, dteDocumentId: "d1", client, trigger: "AUTO" }, deps);
    expect(r2).toMatchObject({ ok: false, errorCode: "RETRY_SCHEDULED" });
    const r3 = await deliverDteToExternalDb({ ...base, dteDocumentId: "d1", client, trigger: "MANUAL" }, deps);
    expect(r3.ok).toBe(true);
    expect(adapter.insert).toHaveBeenCalledTimes(2);
  });

  it("evidencia legada: EXTERNAL_DELIVERY ok=true previo (caso MetaTraining 30/10) -> ALREADY_DELIVERED sin INSERT", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const client = fakeClient({ d1: acceptedDoc("d1") }, [
      { dte_document_id: "d1", response_body: { ok: true, affectedRows: 1, targetTable: "dtes_metatraining" }, error_message: null },
    ]);
    const adapter = adapterReturning(CONFIRMED);
    const r = await deliverDteToExternalDb({ ...base, dteDocumentId: "d1", client }, { ledger, adapter, getOrganizationTenantId: async () => "tenant-a" });
    expect(r).toMatchObject({ ok: false, errorCode: "ALREADY_DELIVERED" });
    expect(adapter.insert).not.toHaveBeenCalled();
    expect([...ledger.rows.values()][0].status).toBe("DELIVERED");
  });

  it("evidencia legada incierta (timeout previo) -> REQUIRES_RECONCILIATION sin INSERT", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const client = fakeClient({ d1: acceptedDoc("d1") }, [
      { dte_document_id: "d1", response_body: { ok: false, errorCode: "INSERT_FAILED" }, error_message: "Error al insertar en MariaDB externa: Query inactivity timeout" },
    ]);
    const adapter = adapterReturning(CONFIRMED);
    const r = await deliverDteToExternalDb({ ...base, dteDocumentId: "d1", client }, { ledger, adapter, getOrganizationTenantId: async () => "tenant-a" });
    expect(r).toMatchObject({ ok: false, errorCode: "REQUIRES_RECONCILIATION" });
    expect(adapter.insert).not.toHaveBeenCalled();
  });

  it("flujo legado sin organización también rechaza re-entrega con evidencia previa", async () => {
    resolveMock.mockResolvedValueOnce({ status: "CONFIGURED", source: "PLATFORM_NATIVE_LEGACY_ENV", config: DEST_A });
    const client = fakeClient({ d1: acceptedDoc("d1") }, [
      { dte_document_id: "d1", response_body: { ok: true, affectedRows: 1 }, error_message: null },
    ]);
    const adapter = adapterReturning(CONFIRMED);
    const r = await deliverDteToExternalDb({ ...base, organizationId: null, allowLegacyEnvFallback: true, dteDocumentId: "d1", client }, { adapter });
    expect(r).toMatchObject({ ok: false, errorCode: "ALREADY_DELIVERED" });
    expect(adapter.insert).not.toHaveBeenCalled();
  });

  it("protección cruzada: organización cuyo tenant no es el del documento -> ORG_TENANT_MISMATCH, sin INSERT", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const client = fakeClient({ d1: acceptedDoc("d1", "tenant-a") });
    const adapter = adapterReturning(CONFIRMED);
    const r = await deliverDteToExternalDb(
      { ...base, organizationId: "org-b", dteDocumentId: "d1", client },
      { ledger, adapter, getOrganizationTenantId: async () => "tenant-b" },
    );
    expect(r).toMatchObject({ ok: false, errorCode: "ORG_TENANT_MISMATCH" });
    expect(adapter.insert).not.toHaveBeenCalled();
    expect(ledger.rows.size).toBe(0);
  });

  it("organización SIN tenant_id: no puede verificarse la pertenencia -> ORG_TENANT_MISMATCH, sin INSERT ni ledger", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const client = fakeClient({ d1: acceptedDoc("d1", "tenant-a") });
    const adapter = adapterReturning(CONFIRMED);
    const r = await deliverDteToExternalDb(
      { ...base, dteDocumentId: "d1", client },
      { ledger, adapter, getOrganizationTenantId: async () => null },
    );
    expect(r).toMatchObject({ ok: false, errorCode: "ORG_TENANT_MISMATCH" });
    expect(adapter.insert).not.toHaveBeenCalled();
    expect(ledger.rows.size).toBe(0);
  });

  it("dos organizaciones: cada job y cada INSERT usan exclusivamente su propio destino", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const adapter = adapterReturning(CONFIRMED);
    await deliverDteToExternalDb({ ...base, dteDocumentId: "a1", client: fakeClient({ a1: acceptedDoc("a1", "tenant-a") }) }, { ledger, adapter, getOrganizationTenantId: async () => "tenant-a" });
    await deliverDteToExternalDb({ ...base, tenantId: "tenant-b", organizationId: "org-b", dteDocumentId: "b1", client: fakeClient({ b1: acceptedDoc("b1", "tenant-b") }) }, { ledger, adapter, getOrganizationTenantId: async () => "tenant-b" });
    const calls = adapter.insert.mock.calls as unknown as Array<[typeof DEST_A]>;
    expect(calls[0][0].table).toBe("dtes_a");
    expect(calls[1][0].table).toBe("dtes_b");
    const jobs = [...ledger.rows.values()];
    expect(jobs.find((j) => j.organization_id === "org-a")!.target_table).toBe("dtes_a");
    expect(jobs.find((j) => j.organization_id === "org-b")!.target_table).toBe("dtes_b");
  });

  it("misma organización, TEST y PRODUCTION del mismo documento id -> claves de idempotencia distintas", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const destination = { host: "h", database: "d", table: "t" };
    const a = await ledger.ensureJob({ organizationId: "org-a", tenantId: "t", locationId: "l", environment: "TEST", dteDocumentId: "x", trigger: "AUTO", destination });
    const b = await ledger.ensureJob({ organizationId: "org-a", tenantId: "t", locationId: "l", environment: "PRODUCTION", dteDocumentId: "x", trigger: "AUTO", destination });
    const c = await ledger.ensureJob({ organizationId: "org-b", tenantId: "t", locationId: "l", environment: "TEST", dteDocumentId: "x", trigger: "AUTO", destination });
    expect(new Set([a.idempotency_key, b.idempotency_key, c.idempotency_key]).size).toBe(3);
  });

  it("lease vencido (proceso murió tras INSERT) -> UNCERTAIN, nunca reintento ciego", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const job = await ledger.ensureJob({ organizationId: "org-a", tenantId: "t", locationId: "l", environment: "TEST", dteDocumentId: "x", trigger: "AUTO", destination: { host: "h", database: "d", table: "t" } });
    const t0 = new Date("2026-11-10T10:00:00Z");
    await ledger.claim(job.id, { owner: "w1", leaseMs: 60_000, now: t0, manual: false });
    expect(await ledger.expireStaleLeases(new Date(t0.getTime() + 120_000))).toBe(1);
    expect((await ledger.get(job.id))!.status).toBe("UNCERTAIN");
    expect(await ledger.claim(job.id, { owner: "w2", leaseMs: 60_000, now: new Date(), manual: true })).toBeNull();
  });

  it("integridad: el payload enviado es exactamente el del builder (JSON fiscal + codigoEmpresa + responseMH + token) y el DTE no se modifica", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const doc = acceptedDoc("d1");
    const original = structuredClone(doc);
    const client = fakeClient({ d1: doc });
    const adapter = adapterReturning(CONFIRMED);
    await deliverDteToExternalDb({ ...base, dteDocumentId: "d1", client }, { ledger, adapter, getOrganizationTenantId: async () => "tenant-a" });

    const expected = buildExternalDtePayload(original as never);
    expect(expected.ok).toBe(true);
    const sent = (adapter.insert.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1];
    expect(sent).toEqual((expected as { ok: true; payload: unknown }).payload);
    expect(sent["token"]).toBe(original.signed_jws);
    expect(sent).toHaveProperty("codigoEmpresa");
    expect(sent).toHaveProperty("responseMH");
    expect(doc).toEqual(original);
    expect((client.dteOutgoingDocument.update as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("NOT_CONFIGURED no crea job ni inserta (sin herencia de otro cliente)", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const adapter = adapterReturning(CONFIRMED);
    const r = await deliverDteToExternalDb({ ...base, organizationId: "org-sin-mariadb", dteDocumentId: "d1", client: fakeClient({ d1: acceptedDoc("d1") }) }, { ledger, adapter });
    expect(r).toMatchObject({ ok: false, errorCode: "NOT_CONFIGURED" });
    expect(adapter.insert).not.toHaveBeenCalled();
    expect(ledger.rows.size).toBe(0);
  });
});
