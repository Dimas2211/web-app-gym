// ─────────────────────────────────────────────────────────────────
// commerce/dte — deliver-invalidation-to-external-db.service.cross-tenant.test.ts
//
// FASE VI-E7 — STEP 7/9: la entrega de invalidación reusa EXACTAMENTE
// el mismo resolver de destino que la entrega DTE normal (nunca un
// mecanismo paralelo). Certifica destino correcto por organización y
// que Organización B nunca recibe/usa el destino de Organización A.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveExternalDteMariaDbDestinationMock, adapterInsertMock } = vi.hoisted(() => ({
  resolveExternalDteMariaDbDestinationMock: vi.fn(),
  adapterInsertMock: vi.fn(),
}));

vi.mock("../config/resolve-external-dte-destination", () => ({
  resolveExternalDteMariaDbDestination: resolveExternalDteMariaDbDestinationMock,
}));

vi.mock("../adapters/external-dte-mariadb.adapter", () => ({
  ExternalDteMariaDbAdapter: class {
    insert = adapterInsertMock;
  },
}));

vi.mock("../services/build-external-invalidation-payload.service", () => ({
  buildExternalInvalidationPayload: vi.fn(() => ({ ok: true, payload: { codigoEmpresa: "X", responseMH: {}, token: "t" } })),
}));

import { deliverInvalidationToExternalDb } from "./deliver-invalidation-to-external-db.service";

const EVENT_ROW = {
  id: "inv-1", tenant_id: "tenant-b", location_id: "loc-b", dte_document_id: "dte-1", status: "ACCEPTED",
  event_json: { some: "event" }, signed_jws: "jws", mh_estado: "PROCESADO", mh_sello_recibido: "sello",
  mh_codigo_msg: null, mh_descripcion_msg: null, mh_observaciones: null,
};

function fakeClient() {
  return {
    dteInvalidationEvent: { findFirst: vi.fn().mockResolvedValue(EVENT_ROW) },
    dteOutgoingDocument:  { findFirst: vi.fn().mockResolvedValue({ json_document: { emisor: { nrc: "123" } } }) },
    dteTransmissionLog:   { create: vi.fn().mockResolvedValue({}), count: vi.fn().mockResolvedValue(0) },
  } as unknown as import("@prisma/client").PrismaClient;
}

beforeEach(() => {
  resolveExternalDteMariaDbDestinationMock.mockReset();
  adapterInsertMock.mockReset();
});

describe("deliverInvalidationToExternalDb — FASE VI-E7 (destino por organización, mismo resolver)", () => {
  it("entrega usa el destino de Organización B, nunca el de A — mismo resolver que deliver-dte-to-external-db", async () => {
    resolveExternalDteMariaDbDestinationMock.mockImplementation(async ({ organizationId }: { organizationId: string | null }) => {
      if (organizationId === "org-b") {
        return { status: "CONFIGURED", source: "ORGANIZATION", config: { host: "mariadb-b", port: 3306, user: "u-b", password: "p-b", database: "db-b", table: "t-b", invalidationTable: "inv-b", enabled: true, timeoutMs: 10_000 } };
      }
      return { status: "CONFIGURED", source: "ORGANIZATION", config: { host: "mariadb-a", port: 3306, user: "u-a", password: "p-a", database: "db-a", table: "t-a", invalidationTable: "inv-a", enabled: true, timeoutMs: 10_000 } };
    });
    adapterInsertMock.mockResolvedValue({ ok: true, insertId: 1, affectedRows: 1, targetTable: "inv-b", targetDatabase: "db-b" });

    const result = await deliverInvalidationToExternalDb({
      invalidationEventId: "inv-1", userId: "u1", tenantId: "tenant-b", locationId: "loc-b",
      client: fakeClient(), organizationId: "org-b", allowLegacyEnvFallback: false,
    });

    expect(result.ok).toBe(true);
    expect(resolveExternalDteMariaDbDestinationMock).toHaveBeenCalledWith({ organizationId: "org-b", allowLegacyEnvFallback: false });

    const [configUsed, , tableUsed] = adapterInsertMock.mock.calls[0] as [{ host: string }, unknown, string];
    expect(configUsed.host).toBe("mariadb-b");
    expect(configUsed.host).not.toBe("mariadb-a");
    expect(tableUsed).toBe("inv-b");
  });

  it("sin integración configurada -> NOT_CONFIGURED, adapter NUNCA se invoca (no cae a destino ajeno)", async () => {
    resolveExternalDteMariaDbDestinationMock.mockResolvedValue({ status: "NOT_CONFIGURED" });

    const result = await deliverInvalidationToExternalDb({
      invalidationEventId: "inv-1", userId: "u1", tenantId: "tenant-b", locationId: "loc-b",
      client: fakeClient(), organizationId: "org-b", allowLegacyEnvFallback: false,
    });

    expect(result).toMatchObject({ ok: false });
    expect(adapterInsertMock).not.toHaveBeenCalled();
  });
});
