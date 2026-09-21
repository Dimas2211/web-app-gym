// ─────────────────────────────────────────────────────────────────
// commerce/dte — deliver-dte-to-external-db.service.cross-tenant.test.ts
//
// FASE VI-E7 — STEP 9 (obligatorio para certificación): prueba SOURCE +
// DESTINATION isolation JUNTOS en la misma llamada. Organización A tiene
// su propio runtime client (source) y su propia integración MariaDB
// (destination); Organización B tiene los suyos, completamente
// distintos. Runtime B jamás debe:
//   - leer/escribir el documento DTE contra el client de A (source), ni
//   - entregar contra el destino MariaDB de A (destination).
// No hace llamadas reales a MariaDB — el adapter está mockeado.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  resolveExternalDteMariaDbDestinationMock,
  adapterInsertMock,
} = vi.hoisted(() => ({
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

vi.mock("../services/build-external-dte-payload.service", () => ({
  buildExternalDtePayload: vi.fn(() => ({ ok: true, payload: { codigoEmpresa: "X", responseMH: {}, token: "t" } })),
}));

import { deliverDteToExternalDb } from "./deliver-dte-to-external-db.service";

function fakeClient(dteRow: Record<string, unknown>, marker: string) {
  return {
    __marker: marker,
    dteOutgoingDocument: { findFirst: vi.fn().mockResolvedValue(dteRow) },
    dteTransmissionLog:  { create: vi.fn().mockResolvedValue({}) },
  } as unknown as import("@prisma/client").PrismaClient & { __marker: string };
}

const BASE_DTE_ROW = {
  id: "dte-1", tenant_id: "tenant-x", location_id: "loc-x", sale_id: "sale-1", purchase_id: null,
  dte_type_code: "01", control_number: "DTE-001", generation_code: "GEN-1", environment: "TEST",
  dte_status: "ACCEPTED", accepted_at: new Date(), json_document: { some: "doc" }, signed_jws: "jws",
  reception_stamp: "stamp", mh_response: {}, retry_count: 0,
};

beforeEach(() => {
  resolveExternalDteMariaDbDestinationMock.mockReset();
  adapterInsertMock.mockReset();
});

describe("deliverDteToExternalDb — FASE VI-E7 STEP 9 (source + destination cross-tenant)", () => {
  it("Runtime B (client B + org B) nunca toca el source ni el destino de Organización A", async () => {
    const clientA = fakeClient(BASE_DTE_ROW, "CLIENT_A_DB");
    const clientB = fakeClient(BASE_DTE_ROW, "CLIENT_B_DB");

    resolveExternalDteMariaDbDestinationMock.mockImplementation(async ({ organizationId }: { organizationId: string | null }) => {
      if (organizationId === "org-a") {
        return { status: "CONFIGURED", source: "ORGANIZATION", config: { host: "mariadb-a", port: 3306, user: "u-a", password: "p-a", database: "db-a", table: "t-a", invalidationTable: "inv-a", enabled: true, timeoutMs: 10_000 } };
      }
      if (organizationId === "org-b") {
        return { status: "CONFIGURED", source: "ORGANIZATION", config: { host: "mariadb-b", port: 3306, user: "u-b", password: "p-b", database: "db-b", table: "t-b", invalidationTable: "inv-b", enabled: true, timeoutMs: 10_000 } };
      }
      return { status: "NOT_CONFIGURED" };
    });

    adapterInsertMock.mockResolvedValue({ ok: true, insertId: 1, affectedRows: 1, targetTable: "t-b", targetDatabase: "db-b" });

    const result = await deliverDteToExternalDb({
      dteDocumentId: "dte-1", userId: "u1", tenantId: "tenant-b", locationId: "loc-b",
      client: clientB, organizationId: "org-b", allowLegacyEnvFallback: false,
    });

    expect(result.ok).toBe(true);

    // SOURCE isolation: leyó el documento del client B, nunca del client A.
    expect((clientB as unknown as { dteOutgoingDocument: { findFirst: ReturnType<typeof vi.fn> } }).dteOutgoingDocument.findFirst).toHaveBeenCalled();
    expect((clientA as unknown as { dteOutgoingDocument: { findFirst: ReturnType<typeof vi.fn> } }).dteOutgoingDocument.findFirst).not.toHaveBeenCalled();

    // DESTINATION isolation: el resolver se llamó con organizationId="org-b", nunca "org-a";
    // y el adapter recibió el config de B (host/db "b"), nunca el de A.
    expect(resolveExternalDteMariaDbDestinationMock).toHaveBeenCalledWith({ organizationId: "org-b", allowLegacyEnvFallback: false });
    expect(resolveExternalDteMariaDbDestinationMock).not.toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-a" }));

    const [configArgUsed] = adapterInsertMock.mock.calls[0] as [{ host: string; database: string }];
    expect(configArgUsed.host).toBe("mariadb-b");
    expect(configArgUsed.database).toBe("db-b");
    expect(configArgUsed.host).not.toBe("mariadb-a");
  });

  it("RUNTIME_CLIENT (allowLegacyEnvFallback:false) sin integración propia -> NOT_CONFIGURED, adapter NUNCA se invoca (no hay fallback a destino ajeno)", async () => {
    const clientB = fakeClient(BASE_DTE_ROW, "CLIENT_B_DB");
    resolveExternalDteMariaDbDestinationMock.mockResolvedValue({ status: "NOT_CONFIGURED" });

    const result = await deliverDteToExternalDb({
      dteDocumentId: "dte-1", userId: "u1", tenantId: "tenant-b", locationId: "loc-b",
      client: clientB, organizationId: "org-b", allowLegacyEnvFallback: false,
    });

    expect(result).toMatchObject({ ok: false, errorCode: "NOT_CONFIGURED" });
    expect(adapterInsertMock).not.toHaveBeenCalled();
  });

  it("integración deshabilitada -> DISABLED, adapter NUNCA se invoca", async () => {
    const clientA = fakeClient(BASE_DTE_ROW, "CLIENT_A_DB");
    resolveExternalDteMariaDbDestinationMock.mockResolvedValue({ status: "DISABLED" });

    const result = await deliverDteToExternalDb({
      dteDocumentId: "dte-1", userId: "u1", tenantId: "tenant-a", locationId: "loc-a",
      client: clientA, organizationId: "org-a", allowLegacyEnvFallback: false,
    });

    expect(result).toMatchObject({ ok: false, errorCode: "DISABLED" });
    expect(adapterInsertMock).not.toHaveBeenCalled();
  });
});
