// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-reconciliation.service.runtime-aware-adapter.test.ts
//
// FASE IV-B.4 — cuando reconcileDteWithMh NO recibe `queryAdapter`
// (caller real, no test), debe construir su MhDteQueryAdapter con un
// MhAuthAdapter cuyo `credentialClient` sea exactamente el `runtimeDb`
// recibido — nunca el prisma singleton global. Este archivo mockea
// ambas clases para observar la construcción sin tocar red ni DB real.
// El resto de la suite (dte-reconciliation.service.test.ts) sigue
// inyectando `queryAdapter` explícito y no se ve afectada por este
// mock, que vive en un archivo separado.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";

const { MhAuthAdapterCtor, MhDteQueryAdapterCtor, queryMock } = vi.hoisted(() => {
  const queryMock = vi.fn(async () => ({
    kind: "QUERY_TECHNICAL_ERROR" as const,
    errorCode: "MH_QUERY_UNAVAILABLE" as const,
    message: "no red en este test",
  }));
  const MhAuthAdapterCtor = vi.fn().mockImplementation(function (this: unknown, opts?: unknown) {
    (this as { opts?: unknown }).opts = opts;
  });
  const MhDteQueryAdapterCtor = vi.fn().mockImplementation(function (this: unknown, authAdapter?: unknown) {
    (this as { authAdapter?: unknown }).authAdapter = authAdapter;
    (this as { query: typeof queryMock }).query = queryMock;
  });
  return { MhAuthAdapterCtor, MhDteQueryAdapterCtor, queryMock };
});

vi.mock("../adapters/dte-auth.adapter", () => ({
  MhAuthAdapter: MhAuthAdapterCtor,
}));

vi.mock("../adapters/dte-query.adapter", () => ({
  MhDteQueryAdapter: MhDteQueryAdapterCtor,
}));

import { reconcileDteWithMh } from "./dte-reconciliation.service";

function minimalRuntimeDb(docStatus: "SIGNED" = "SIGNED") {
  const doc = {
    id: "doc-1",
    tenant_id: "tenant-1",
    location_id: "loc-1",
    dte_status: docStatus,
    environment: "TEST" as const,
    dte_type_code: "14",
    generation_code: "GEN-1",
    control_number: "CN-1",
    issuer_config_id: "issuer-1",
    reception_stamp: null,
    mh_response: null,
  };
  return {
    dteOutgoingDocument: {
      findFirst: vi.fn(async () => ({ ...doc })),
      findUnique: vi.fn(async () => ({ ...doc })),
      update: vi.fn(async (args: { data: unknown }) => ({ ...doc, ...(args.data as object) })),
    },
    dteFiscalMeteringReservation: {
      findUnique: vi.fn(async () => null),
    },
    dteIssuerConfig: {
      findUnique: vi.fn(async () => ({ id: "issuer-1", nit: "0614-000000-000-0" })),
    },
    dteTransmissionLog: {
      count: vi.fn(async () => 0),
      create: vi.fn(async (args: { data: unknown }) => ({ id: "log-1", created_at: new Date(), ...(args.data as object) })),
      findFirst: vi.fn(async () => null),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(undefined)),
  };
}

describe("reconcileDteWithMh — construcción runtime-aware del adapter por defecto (FASE IV-B.4)", () => {
  it("sin queryAdapter inyectado, construye MhDteQueryAdapter con MhAuthAdapter({ credentialClient: runtimeDb })", async () => {
    MhAuthAdapterCtor.mockClear();
    MhDteQueryAdapterCtor.mockClear();
    queryMock.mockClear();

    const runtimeDb = minimalRuntimeDb();

    await reconcileDteWithMh({
      dteDocumentId: "doc-1",
      tenantId: "tenant-1",
      locationId: "loc-1",
      runtimeDb: runtimeDb as never,
    });

    expect(MhAuthAdapterCtor).toHaveBeenCalledTimes(1);
    const authAdapterOpts = MhAuthAdapterCtor.mock.calls[0]?.[0];
    expect(authAdapterOpts).toEqual({ credentialClient: runtimeDb });

    expect(MhDteQueryAdapterCtor).toHaveBeenCalledTimes(1);
    // El MhDteQueryAdapter recibió la instancia de MhAuthAdapter recién construida.
    const authAdapterInstance = MhAuthAdapterCtor.mock.results[0]?.value;
    expect(MhDteQueryAdapterCtor.mock.calls[0]?.[0]).toBe(authAdapterInstance);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("con queryAdapter inyectado (tests), nunca construye MhAuthAdapter/MhDteQueryAdapter reales", async () => {
    MhAuthAdapterCtor.mockClear();
    MhDteQueryAdapterCtor.mockClear();

    const runtimeDb = minimalRuntimeDb();
    const injectedQuery = vi.fn(async () => ({
      kind: "QUERY_TECHNICAL_ERROR" as const,
      errorCode: "MH_QUERY_UNAVAILABLE" as const,
      message: "mock inyectado",
    }));

    await reconcileDteWithMh({
      dteDocumentId: "doc-1",
      tenantId: "tenant-1",
      locationId: "loc-1",
      runtimeDb: runtimeDb as never,
      queryAdapter: { query: injectedQuery } as never,
    });

    expect(MhAuthAdapterCtor).not.toHaveBeenCalled();
    expect(MhDteQueryAdapterCtor).not.toHaveBeenCalled();
    expect(injectedQuery).toHaveBeenCalledTimes(1);
  });
});
