// ─────────────────────────────────────────────────────────────────
// DTE-MH-TEST-RUNS — exclusión ABSOLUTA de MariaDB por propósito.
//
// Prueba que ningún documento de certificación (ni sus invalidaciones) se
// descubre, encola, procesa ni entrega a MariaDB — ni por el worker, ni por
// un job creado por error, ni por entrega manual — con CERO llamadas a
// adapter.insert. Y que la entrega operativa normal sigue ocurriendo.
// Sin MariaDB ni bases reales.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveMock } = vi.hoisted(() => ({ resolveMock: vi.fn() }));
vi.mock("../config/resolve-external-dte-destination", () => ({ resolveExternalDteMariaDbDestination: resolveMock }));
vi.mock("@/modules/platform/runtime/control-plane-prisma", () => ({ controlPlanePrisma: {} }));
// La entrega de invalidación instancia el adapter real por defecto: si se
// llegara a construir en un caso excluido, este mock lo detecta.
const { realAdapterInsert } = vi.hoisted(() => ({ realAdapterInsert: vi.fn() }));
vi.mock("../adapters/external-dte-mariadb.adapter", () => ({ ExternalDteMariaDbAdapter: class { insert = realAdapterInsert; } }));

import { deliverDteToExternalDb } from "../services/deliver-dte-to-external-db.service";
import { deliverInvalidationToExternalDb } from "../services/deliver-invalidation-to-external-db.service";
import { buildExternalDtePayload } from "../services/build-external-dte-payload.service";
import { buildExternalInvalidationPayload } from "../services/build-external-invalidation-payload.service";
import { discoverAcceptedDocumentsForAutoDelivery, processDueExternalDeliveryJobs } from "../outbox/external-delivery-processor.service";
import { InMemoryExternalDeliveryLedger } from "../outbox/external-delivery-ledger.memory";
import { DTE_CERTIFICATION_EXCLUDED_CODE } from "../utils/dte-document-purpose";

type Purpose = "OPERATIONAL" | "MH_TEST_CERTIFICATION" | undefined;
const ENABLED_AT = new Date("2026-11-10T00:00:00Z");
const DEST = { host: "h", port: 3306, user: "u", password: "p", database: "db", table: "dtes", invalidationTable: "anulaciones", enabled: true, timeoutMs: 1000 };

function doc(id: string, purpose: Purpose) {
  return {
    id, tenant_id: "tenant-a", location_id: "loc", sale_id: purpose === "OPERATIONAL" ? "s" : null, purchase_id: null, dte_type_code: "01",
    control_number: "DTE-01-M001P001-000000000000001", generation_code: `G-${id}`, environment: "TEST", dte_status: "ACCEPTED",
    accepted_at: new Date("2026-11-11T00:00:00Z"),
    json_document: { identificacion: { tipoDte: "01", fecEmi: "2026-11-11", horEmi: "10:00:00" }, emisor: { nrc: "1" }, resumen: { totalPagar: 1 } },
    signed_jws: "a.b.c", reception_stamp: "S".repeat(40), mh_response: { estado: "PROCESADO", selloRecibido: "S".repeat(40) }, retry_count: 0,
    ...(purpose === undefined ? {} : { purpose }),
  };
}

/** Runtime fake que RESPETA el filtro purpose del where (como PostgreSQL). */
function runtime(docs: ReturnType<typeof doc>[]) {
  const findMany = vi.fn(async ({ where }: { where: { tenant_id: string; purpose?: string } }) =>
    docs.filter((d) => d.tenant_id === where.tenant_id && (where.purpose === undefined || (d as { purpose?: string }).purpose === where.purpose))
      .map((d) => ({ id: d.id, location_id: d.location_id, environment: d.environment, generation_code: d.generation_code })));
  return {
    findMany,
    client: {
      dteOutgoingDocument: {
        findMany,
        findFirst: vi.fn(async ({ where }: { where: { id: string; tenant_id?: string } }) => {
          const d = docs.find((x) => x.id === where.id && (where.tenant_id === undefined || x.tenant_id === where.tenant_id));
          return d ? structuredClone(d) : null;
        }),
        update: vi.fn(() => { throw new Error("NO SE DEBE MODIFICAR EL DTE"); }),
      },
      dteInvalidationEvent: {
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({
          id: where.id, tenant_id: "tenant-a", location_id: "loc", dte_document_id: where.id.replace("inv-", ""), status: "ACCEPTED",
          event_json: { identificacion: {} }, signed_jws: "a.b.c", mh_estado: "PROCESADO", mh_sello_recibido: "E".repeat(40),
          mh_codigo_msg: null, mh_descripcion_msg: null, mh_observaciones: null,
        })),
      },
      dteTransmissionLog: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}), count: vi.fn().mockResolvedValue(0) },
    } as unknown as import("@prisma/client").PrismaClient,
  };
}

const CONFIRMED = { ok: true as const, outcome: "CONFIRMED" as const, insertId: 1, affectedRows: 1, targetTable: "dtes", targetDatabase: "db" };
const base = { userId: "u", tenantId: "tenant-a", locationId: "loc", organizationId: "org-a", allowLegacyEnvFallback: false };

beforeEach(() => {
  realAdapterInsert.mockReset().mockResolvedValue(CONFIRMED);
  resolveMock.mockReset().mockResolvedValue({ status: "CONFIGURED", source: "ORGANIZATION", config: DEST, integrationId: "int-a", autoDeliveryEnabled: true });
});

describe("payload builders — barrera final", () => {
  it("DTE de certificación o sin purpose (fail-closed) no produce payload", () => {
    expect(buildExternalDtePayload(doc("c", "MH_TEST_CERTIFICATION") as never).ok).toBe(false);
    expect(buildExternalDtePayload(doc("x", undefined) as never).ok).toBe(false);
  });
  it("invalidación de un documento de certificación no produce payload", () => {
    const ev = { id: "inv", tenant_id: "t", location_id: "l", dte_document_id: "c", status: "ACCEPTED", event_json: {}, signed_jws: "a.b.c",
      mh_estado: "PROCESADO", mh_sello_recibido: "E", mh_codigo_msg: null, mh_descripcion_msg: null, mh_observaciones: null,
      dte_document_json: { emisor: { nrc: "1" } }, dte_document_purpose: "MH_TEST_CERTIFICATION" };
    expect(buildExternalInvalidationPayload(ev as never).ok).toBe(false);
    expect(buildExternalInvalidationPayload({ ...ev, dte_document_purpose: null } as never).ok).toBe(false);
  });
});

describe("entrega manual", () => {
  it("DTE de certificación: CERTIFICATION_DOCUMENT_EXCLUDED, 0 INSERT y sin job en el ledger", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const insert = vi.fn().mockResolvedValue(CONFIRMED);
    const { client } = runtime([doc("cert", "MH_TEST_CERTIFICATION")]);
    const r = await deliverDteToExternalDb({ ...base, dteDocumentId: "cert", client, trigger: "MANUAL" }, { ledger, adapter: { insert }, getOrganizationTenantId: async () => "tenant-a" });
    expect(r).toMatchObject({ ok: false, errorCode: DTE_CERTIFICATION_EXCLUDED_CODE });
    expect(insert).not.toHaveBeenCalled();
    expect(ledger.rows.size).toBe(0);
  });

  it("DTE operativo: se sigue entregando (1 INSERT)", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const insert = vi.fn().mockResolvedValue(CONFIRMED);
    const { client } = runtime([doc("op", "OPERATIONAL")]);
    const r = await deliverDteToExternalDb({ ...base, dteDocumentId: "op", client, trigger: "MANUAL" }, { ledger, adapter: { insert }, getOrganizationTenantId: async () => "tenant-a" });
    expect(r.ok).toBe(true);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("invalidación sobre documento de certificación: 0 INSERT (adapter inyectado ni el real)", async () => {
    const insert = vi.fn().mockResolvedValue(CONFIRMED);
    const { client } = runtime([doc("cert", "MH_TEST_CERTIFICATION")]);
    const r = await deliverInvalidationToExternalDb({ ...base, invalidationEventId: "inv-cert", client }, { adapter: { insert } });
    expect(r.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
    const r2 = await deliverInvalidationToExternalDb({ ...base, invalidationEventId: "inv-cert", client });
    expect(r2.ok).toBe(false);
    expect(realAdapterInsert).not.toHaveBeenCalled();
  });

  it("invalidación sobre documento operativo: se entrega", async () => {
    const insert = vi.fn().mockResolvedValue({ ...CONFIRMED, targetTable: "anulaciones" });
    const { client } = runtime([doc("op", "OPERATIONAL")]);
    const r = await deliverInvalidationToExternalDb({ ...base, invalidationEventId: "inv-op", client }, { adapter: { insert } });
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe("worker automático", () => {
  const orgs = async () => [{ organizationId: "org-a", tenantId: "tenant-a", enabledAt: ENABLED_AT }];

  it("descubrimiento filtra por purpose=OPERATIONAL: la certificación nunca se encola", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const rt = runtime([doc("cert", "MH_TEST_CERTIFICATION"), doc("op", "OPERATIONAL")]);
    await discoverAcceptedDocumentsForAutoDelivery({}, { ledger, listAutoDeliveryOrganizations: orgs, runtimeRunner: async (_o, cb) => cb(rt.client) });
    expect(rt.findMany.mock.calls[0][0].where).toMatchObject({ purpose: "OPERATIONAL" });
    expect([...ledger.rows.values()].map((j) => j.dte_document_id)).toEqual(["op"]);
  });

  it("job creado por error para un documento de certificación: se CANCELA sin INSERT; el operativo se entrega", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    await ledger.ensureJob({ organizationId: "org-a", tenantId: "tenant-a", locationId: "loc", environment: "TEST", dteDocumentId: "cert", trigger: "AUTO", destination: { host: "h", database: "db", table: "dtes" } });
    const rt = runtime([doc("cert", "MH_TEST_CERTIFICATION"), doc("op", "OPERATIONAL")]);
    const insert = vi.fn(async (_config: unknown, payload: { codigoGeneracion?: string } | unknown) => { void payload; return CONFIRMED; });

    const summary = await processDueExternalDeliveryJobs({ now: new Date("2026-11-12T00:00:00Z") }, {
      ledger, adapter: { insert }, getOrganizationTenantId: async () => "tenant-a",
      listAutoDeliveryOrganizations: orgs, runtimeRunner: async (_o, cb) => cb(rt.client),
    });

    const jobs = [...ledger.rows.values()];
    expect(jobs.find((j) => j.dte_document_id === "cert")!.status).toBe("CANCELLED");
    expect(jobs.find((j) => j.dte_document_id === "op")!.status).toBe("DELIVERED");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(summary.details.some((d) => d.outcome === "CANCELLED_CERTIFICATION")).toBe(true);

    // Reprocesar no vuelve a intentar el job cancelado.
    await processDueExternalDeliveryJobs({ now: new Date("2026-11-13T00:00:00Z") }, {
      ledger, adapter: { insert }, getOrganizationTenantId: async () => "tenant-a",
      listAutoDeliveryOrganizations: orgs, runtimeRunner: async (_o, cb) => cb(rt.client),
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
