// FISCAL-ONBOARDING — worker de entrega automática: descubrimiento
// acotado por auto_delivery_enabled_at, aislamiento por organización y
// respeto de la opción automática. Sin bases reales.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveMock } = vi.hoisted(() => ({ resolveMock: vi.fn() }));
vi.mock("../config/resolve-external-dte-destination", () => ({ resolveExternalDteMariaDbDestination: resolveMock }));
vi.mock("@/modules/platform/runtime/control-plane-prisma", () => ({ controlPlanePrisma: {} }));

import { discoverAcceptedDocumentsForAutoDelivery, processDueExternalDeliveryJobs } from "./external-delivery-processor.service";
import { InMemoryExternalDeliveryLedger } from "./external-delivery-ledger.memory";

const ENABLED_AT = new Date("2026-11-10T00:00:00Z");

function runtimeFor(tenant: string, docs: Array<{ id: string; accepted_at: Date }>) {
  return {
    dteOutgoingDocument: {
      findMany: vi.fn(async ({ where }: { where: { tenant_id: string; accepted_at: { gte: Date } } }) =>
        where.tenant_id !== tenant ? [] : docs
          .filter((d) => d.accepted_at >= where.accepted_at.gte)
          .map((d) => ({ id: d.id, location_id: "loc", environment: "TEST", generation_code: `G-${d.id}` }))),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id, tenant_id: tenant, location_id: "loc", sale_id: "s", purchase_id: null, dte_type_code: "01",
        control_number: "DTE-01-00000001-000000000000001", generation_code: `G-${where.id}`, environment: "TEST",
        dte_status: "ACCEPTED", accepted_at: new Date(), json_document: { identificacion: { tipoDte: "01" }, emisor: { nrc: "1" } },
        signed_jws: "jws", reception_stamp: "sello", mh_response: { estado: "PROCESADO", selloRecibido: "sello" }, retry_count: 0,
      })),
    },
    dteTransmissionLog: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
  } as unknown as import("@prisma/client").PrismaClient;
}

beforeEach(() => {
  resolveMock.mockReset().mockImplementation(async ({ organizationId }: { organizationId: string }) => ({
    status: "CONFIGURED", source: "ORGANIZATION", integrationId: `int-${organizationId}`, autoDeliveryEnabled: organizationId !== "org-manual",
    config: { host: `h-${organizationId}`, port: 3306, user: "u", password: "p", database: `db_${organizationId.replace("-", "_")}`, table: `t_${organizationId.replace("-", "_")}`, invalidationTable: "", enabled: true, timeoutMs: 1000 },
  }));
});

describe("discoverAcceptedDocumentsForAutoDelivery", () => {
  it("encola solo DTE aceptados DESPUÉS de habilitar la entrega automática (no re-entrega históricos)", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const runtimeA = runtimeFor("tenant-a", [
      { id: "historico", accepted_at: new Date("2026-10-30T12:00:00Z") },
      { id: "nuevo", accepted_at: new Date("2026-11-10T08:00:00Z") },
    ]);
    const s = await discoverAcceptedDocumentsForAutoDelivery({}, {
      ledger,
      listAutoDeliveryOrganizations: async () => [{ organizationId: "org-a", tenantId: "tenant-a", enabledAt: ENABLED_AT }],
      runtimeRunner: async (_org, cb) => cb(runtimeA),
    });
    expect(s.enqueued).toBe(1);
    expect([...ledger.rows.values()].map((j) => j.dte_document_id)).toEqual(["nuevo"]);

    // Reejecutar el descubrimiento no duplica.
    await discoverAcceptedDocumentsForAutoDelivery({}, {
      ledger,
      listAutoDeliveryOrganizations: async () => [{ organizationId: "org-a", tenantId: "tenant-a", enabledAt: ENABLED_AT }],
      runtimeRunner: async (_org, cb) => cb(runtimeA),
    });
    expect(ledger.rows.size).toBe(1);
  });

  it("avanza más allá del límite por pasada: los DTE ya encolados no bloquean a los posteriores", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const all = Array.from({ length: 450 }, (_, i) => ({
      id: `d${String(i).padStart(4, "0")}`, location_id: "loc", environment: "TEST", generation_code: null,
    }));
    const runtime = {
      dteOutgoingDocument: {
        findMany: vi.fn(async ({ skip = 0, take }: { skip?: number; take: number }) => all.slice(skip, skip + take)),
      },
    } as unknown as import("@prisma/client").PrismaClient;
    const deps = {
      ledger,
      listAutoDeliveryOrganizations: async () => [{ organizationId: "org-a", tenantId: "tenant-a", enabledAt: ENABLED_AT }],
      runtimeRunner: async <T,>(_org: string, cb: (c: import("@prisma/client").PrismaClient) => Promise<T>) => cb(runtime),
    };

    const first = await discoverAcceptedDocumentsForAutoDelivery({ limitPerOrganization: 50 }, deps);
    const second = await discoverAcceptedDocumentsForAutoDelivery({ limitPerOrganization: 50 }, deps);
    expect(first.enqueued).toBe(50);
    expect(second.enqueued).toBe(50);
    expect(ledger.rows.size).toBe(100);

    // Pasadas sucesivas terminan encolando todos, sin duplicar.
    for (let i = 0; i < 10; i++) await discoverAcceptedDocumentsForAutoDelivery({ limitPerOrganization: 50 }, deps);
    expect(ledger.rows.size).toBe(450);
    expect(new Set([...ledger.rows.values()].map((j) => j.dte_document_id)).size).toBe(450);
  });
});

describe("processDueExternalDeliveryJobs", () => {
  it("cada organización se entrega con SU runtime y SU destino; auto desactivado se omite", async () => {
    const ledger = new InMemoryExternalDeliveryLedger();
    const runtimes: Record<string, import("@prisma/client").PrismaClient> = {
      "org-a": runtimeFor("tenant-a", [{ id: "a1", accepted_at: new Date("2026-11-10T09:00:00Z") }]),
      "org-b": runtimeFor("tenant-b", [{ id: "b1", accepted_at: new Date("2026-11-10T09:00:00Z") }]),
    };
    const insert = vi.fn(async (config: { table: string }) => ({ ok: true as const, outcome: "CONFIRMED" as const, insertId: 1, affectedRows: 1, targetTable: config.table, targetDatabase: "x" }));
    const runnerCalls: string[] = [];

    // Job manual de una org sin entrega automática: el worker no debe tocarlo.
    await ledger.ensureJob({ organizationId: "org-manual", tenantId: "tenant-m", locationId: "loc", environment: "TEST", dteDocumentId: "m1", trigger: "MANUAL", destination: { host: "h", database: "d", table: "t" } });

    const summary = await processDueExternalDeliveryJobs({ now: new Date("2026-11-10T10:00:00Z") }, {
      ledger,
      adapter: { insert },
      getOrganizationTenantId: async (org) => (org === "org-a" ? "tenant-a" : "tenant-b"),
      listAutoDeliveryOrganizations: async () => [
        { organizationId: "org-a", tenantId: "tenant-a", enabledAt: ENABLED_AT },
        { organizationId: "org-b", tenantId: "tenant-b", enabledAt: ENABLED_AT },
      ],
      runtimeRunner: async (org, cb) => { runnerCalls.push(org); return cb(runtimes[org] ?? runtimeFor("none", [])); },
    });

    expect(summary.discovered.enqueued).toBe(2);
    expect(summary.delivered).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(insert.mock.calls.map((c) => c[0].table).sort()).toEqual(["t_org_a", "t_org_b"]);
    expect(runnerCalls).not.toContain("org-manual");

    // Segunda pasada: nada que entregar, ningún INSERT adicional.
    const again = await processDueExternalDeliveryJobs({ now: new Date("2026-11-10T11:00:00Z") }, {
      ledger, adapter: { insert },
      getOrganizationTenantId: async (org) => (org === "org-a" ? "tenant-a" : "tenant-b"),
      listAutoDeliveryOrganizations: async () => [
        { organizationId: "org-a", tenantId: "tenant-a", enabledAt: ENABLED_AT },
        { organizationId: "org-b", tenantId: "tenant-b", enabledAt: ENABLED_AT },
      ],
      runtimeRunner: async (org, cb) => cb(runtimes[org] ?? runtimeFor("none", [])),
    });
    expect(again.delivered).toBe(0);
    expect(insert).toHaveBeenCalledTimes(2);
  });
});
