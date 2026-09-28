// ─────────────────────────────────────────────────────────────────
// commerce/dte — transmit-dte-document.service.runtime.test.ts
//
// FASE VI-E5B — certifica que transmitDteDocument, cuando recibe un
// `db` explícito (runtime DB de un RUNTIME_CLIENT), enruta TODA
// lectura/escritura tenant-owned a ese `db` y nunca al Prisma global:
//   - DteOutgoingDocument.findFirst / $transaction (update + log)
//   - reserveDteFiscalCapacity con runtimeDb=db (nunca runtimeDb=prisma
//     global)
//   - MhDteTransmissionAdapter construido con MhAuthAdapter cuyo
//     credentialClient=db (para que DteCredential se resuelva de la
//     MISMA runtime DB, nunca del Control Plane / prisma global)
//
// Sin `db` (comportamiento legacy PLATFORM_NATIVE no migrado), cae al
// Prisma global — se certifica aparte para no romper callers viejos.
//
// El Prisma global mockeado nunca debe recibir llamadas cuando se pasa
// `db` — eso es la garantía central de esta fase (RUNTIME_CLIENT nunca
// toca datos fiscales fuera de su propia runtime DB).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  globalFindFirstSpy,
  globalTransactionSpy,
  runtimeFindFirstSpy,
  runtimeTransactionSpy,
  transmitAdapterSpy,
  mhAuthAdapterCtorSpy,
  mhTransmissionAdapterCtorSpy,
  reserveDteFiscalCapacitySpy,
  resolveCommercialEnforcementContextMock,
  contingencyGuardMock,
} = vi.hoisted(() => ({
  globalFindFirstSpy: vi.fn(),
  globalTransactionSpy: vi.fn(),
  runtimeFindFirstSpy: vi.fn(),
  runtimeTransactionSpy: vi.fn(),
  transmitAdapterSpy: vi.fn(),
  mhAuthAdapterCtorSpy: vi.fn(),
  mhTransmissionAdapterCtorSpy: vi.fn(),
  reserveDteFiscalCapacitySpy: vi.fn(),
  resolveCommercialEnforcementContextMock: vi.fn(),
  contingencyGuardMock: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    dteOutgoingDocument: { findFirst: globalFindFirstSpy, update: vi.fn() },
    dteTransmissionLog: { create: vi.fn() },
    $transaction: globalTransactionSpy,
  },
}));

vi.mock("./assert-dte-contingency-transmission-allowed.service", () => ({
  assertDteContingencyTransmissionAllowed: contingencyGuardMock,
}));

vi.mock("../adapters/dte-transmission.adapter", () => ({
  MhDteTransmissionAdapter: mhTransmissionAdapterCtorSpy.mockImplementation((authAdapter: unknown) => ({
    transmit: transmitAdapterSpy,
    __authAdapter: authAdapter,
  })),
}));

vi.mock("../adapters/dte-auth.adapter", () => ({
  MhAuthAdapter: mhAuthAdapterCtorSpy.mockImplementation((opts: unknown) => ({ __opts: opts })),
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement/resolve-commercial-context", () => ({
  resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock,
}));

vi.mock("./dte-fiscal-metering.service", () => ({
  reserveDteFiscalCapacity: reserveDteFiscalCapacitySpy,
  finalizeDteFiscalCapacityConsumed: vi.fn(),
  releaseDteFiscalCapacity: vi.fn(),
}));

import { transmitDteDocument } from "./transmit-dte-document.service";

const SIGNED_DOC = {
  id: "dte-doc-1",
  dte_status: "SIGNED",
  signed_jws: "jws-signed",
  generation_code: "GEN-1",
  control_number: "DTE-01-0001-0000000001",
  dte_type_code: "01",
  environment: "TEST",
  issuer_config_id: "issuer-1",
  retry_count: 0,
  transmission_type_code: "1",
  contingency_type_code: null,
};

function bypassTestCtx() {
  return { mode: "MANAGED", tenantId: "tenant-1", organizationTimezone: "America/El_Salvador" };
}

beforeEach(() => {
  globalFindFirstSpy.mockReset();
  globalTransactionSpy.mockReset();
  runtimeFindFirstSpy.mockReset();
  runtimeTransactionSpy.mockReset();
  transmitAdapterSpy.mockReset();
  mhAuthAdapterCtorSpy.mockClear();
  mhTransmissionAdapterCtorSpy.mockClear();
  reserveDteFiscalCapacitySpy.mockReset();
  resolveCommercialEnforcementContextMock.mockReset();
  contingencyGuardMock.mockReset();

  contingencyGuardMock.mockResolvedValue({ ok: true });
  resolveCommercialEnforcementContextMock.mockResolvedValue(bypassTestCtx());
  // environment=TEST -> reserveDteFiscalCapacity siempre bypass, pero el
  // spy sigue recibiendo runtimeDb tal como el service lo invoca.
  reserveDteFiscalCapacitySpy.mockResolvedValue({ ok: true, token: { mode: "BYPASS_TEST" } });
  transmitAdapterSpy.mockResolvedValue({
    ok: true,
    mhEstado: "PROCESADO",
    codigoGeneracion: "GEN-1",
    selloRecibido: "SELLO-1",
    fhProcesamiento: "2026-01-01T00:00:00.000Z",
    codigoMsg: null,
    descripcionMsg: null,
    observaciones: null,
    rawResponse: {},
    httpStatus: 200,
    idEnvio: 1,
  });
});

describe("transmitDteDocument — VI-E5B runtime DB routing", () => {
  it("con `db` explícito: findFirst/$transaction corren en runtime db, NUNCA en el prisma global mockeado", async () => {
    runtimeFindFirstSpy.mockResolvedValue(SIGNED_DOC);
    runtimeTransactionSpy.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      const cb = arg as (tx: unknown) => Promise<unknown>;
      return cb({ dteOutgoingDocument: { update: vi.fn() }, dteTransmissionLog: { create: vi.fn() } });
    });

    const runtimeDb = {
      dteOutgoingDocument: { findFirst: runtimeFindFirstSpy, update: vi.fn() },
      dteTransmissionLog: { create: vi.fn() },
      $transaction: runtimeTransactionSpy,
    } as unknown as Parameters<typeof transmitDteDocument>[1];

    const result = await transmitDteDocument(
      { dteDocumentId: "dte-doc-1", userId: "user-1", tenantId: "tenant-1", locationId: "loc-1" },
      runtimeDb,
    );

    expect(result.ok).toBe(true);
    expect(runtimeFindFirstSpy).toHaveBeenCalledTimes(1);
    expect(runtimeTransactionSpy).toHaveBeenCalled();
    expect(globalFindFirstSpy).not.toHaveBeenCalled();
    expect(globalTransactionSpy).not.toHaveBeenCalled();
  });

  it("con `db` explícito: reserveDteFiscalCapacity recibe runtimeDb=db, nunca el prisma global", async () => {
    runtimeFindFirstSpy.mockResolvedValue(SIGNED_DOC);
    runtimeTransactionSpy.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      const cb = arg as (tx: unknown) => Promise<unknown>;
      return cb({ dteOutgoingDocument: { update: vi.fn() }, dteTransmissionLog: { create: vi.fn() } });
    });

    const runtimeDb = {
      dteOutgoingDocument: { findFirst: runtimeFindFirstSpy, update: vi.fn() },
      dteTransmissionLog: { create: vi.fn() },
      $transaction: runtimeTransactionSpy,
    } as unknown as Parameters<typeof transmitDteDocument>[1];

    await transmitDteDocument(
      { dteDocumentId: "dte-doc-1", userId: "user-1", tenantId: "tenant-1", locationId: "loc-1" },
      runtimeDb,
    );

    expect(reserveDteFiscalCapacitySpy).toHaveBeenCalledTimes(1);
    const callArgs = reserveDteFiscalCapacitySpy.mock.calls[0][0];
    expect(callArgs.runtimeDb).toBe(runtimeDb);
  });

  it("con `db` explícito: MhDteTransmissionAdapter se construye con MhAuthAdapter({ credentialClient: db })", async () => {
    runtimeFindFirstSpy.mockResolvedValue(SIGNED_DOC);
    runtimeTransactionSpy.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      const cb = arg as (tx: unknown) => Promise<unknown>;
      return cb({ dteOutgoingDocument: { update: vi.fn() }, dteTransmissionLog: { create: vi.fn() } });
    });

    const runtimeDb = {
      dteOutgoingDocument: { findFirst: runtimeFindFirstSpy, update: vi.fn() },
      dteTransmissionLog: { create: vi.fn() },
      $transaction: runtimeTransactionSpy,
    } as unknown as Parameters<typeof transmitDteDocument>[1];

    await transmitDteDocument(
      { dteDocumentId: "dte-doc-1", userId: "user-1", tenantId: "tenant-1", locationId: "loc-1" },
      runtimeDb,
    );

    expect(mhAuthAdapterCtorSpy).toHaveBeenCalledWith({ credentialClient: runtimeDb });
    expect(mhTransmissionAdapterCtorSpy).toHaveBeenCalledTimes(1);
  });

  it("con `db` explícito: assertDteContingencyTransmissionAllowed recibe db como segundo argumento (VI-E6C — cierra el gap de cross-DB en el guard de contingencia)", async () => {
    runtimeFindFirstSpy.mockResolvedValue(SIGNED_DOC);
    runtimeTransactionSpy.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      const cb = arg as (tx: unknown) => Promise<unknown>;
      return cb({ dteOutgoingDocument: { update: vi.fn() }, dteTransmissionLog: { create: vi.fn() } });
    });

    const runtimeDb = {
      dteOutgoingDocument: { findFirst: runtimeFindFirstSpy, update: vi.fn() },
      dteTransmissionLog: { create: vi.fn() },
      $transaction: runtimeTransactionSpy,
    } as unknown as Parameters<typeof transmitDteDocument>[1];

    await transmitDteDocument(
      { dteDocumentId: "dte-doc-1", userId: "user-1", tenantId: "tenant-1", locationId: "loc-1" },
      runtimeDb,
    );

    expect(contingencyGuardMock).toHaveBeenCalledTimes(1);
    expect(contingencyGuardMock.mock.calls[0][1]).toBe(runtimeDb);
  });

  it("sin `db` (legacy PLATFORM_NATIVE): usa el Prisma global para documento y transacción", async () => {
    globalFindFirstSpy.mockResolvedValue(SIGNED_DOC);
    globalTransactionSpy.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      const cb = arg as (tx: unknown) => Promise<unknown>;
      return cb({ dteOutgoingDocument: { update: vi.fn() }, dteTransmissionLog: { create: vi.fn() } });
    });

    const result = await transmitDteDocument({
      dteDocumentId: "dte-doc-1",
      userId: "user-1",
      tenantId: "tenant-1",
      locationId: "loc-1",
    });

    expect(result.ok).toBe(true);
    expect(globalFindFirstSpy).toHaveBeenCalledTimes(1);
    expect(globalTransactionSpy).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────
// FASE VI-E6A — cierra el gap de cobertura reportado en VI-E5B: no
// existía un test dedicado de aislamiento cross-tenant/cross-location
// para transmisión. El findFirst real de transmit-dte-document.service.ts
// hace `where: { id, tenant_id, location_id }` (scoped) — aquí se
// simula ese scoping real en el fake runtimeDb (a diferencia de los
// tests de arriba, que resuelven el doc incondicionalmente) para
// certificar que un tenant/location distinto al del documento real
// nunca llega a MH, a metering, ni a escribir un TransmissionLog.
// ─────────────────────────────────────────────────────────────────

describe("transmitDteDocument — VI-E6A aislamiento cross-tenant/cross-location", () => {
  function scopedRuntimeDb(ownerTenantId: string, ownerLocationId: string) {
    const findFirst = vi.fn(async (args: { where: { id: string; tenant_id: string; location_id: string } }) => {
      const { tenant_id, location_id } = args.where;
      if (tenant_id !== ownerTenantId || location_id !== ownerLocationId) return null;
      return SIGNED_DOC;
    });
    const transaction = vi.fn(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      const cb = arg as (tx: unknown) => Promise<unknown>;
      return cb({ dteOutgoingDocument: { update: vi.fn() }, dteTransmissionLog: { create: vi.fn() } });
    });
    return {
      db: {
        dteOutgoingDocument: { findFirst, update: vi.fn() },
        dteTransmissionLog: { create: vi.fn() },
        $transaction: transaction,
      } as unknown as Parameters<typeof transmitDteDocument>[1],
      findFirst,
      transaction,
    };
  }

  it("tenant A no puede transmitir un DTE de tenant B -> 0 llamadas MH/metering/log", async () => {
    const { db, transaction } = scopedRuntimeDb("tenant-owner", "loc-1");

    const result = await transmitDteDocument(
      { dteDocumentId: "dte-doc-1", userId: "user-1", tenantId: "tenant-attacker", locationId: "loc-1" },
      db,
    );

    expect(result.ok).toBe(false);
    expect(transmitAdapterSpy).not.toHaveBeenCalled();
    expect(mhAuthAdapterCtorSpy).not.toHaveBeenCalled();
    expect(reserveDteFiscalCapacitySpy).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("location A no puede transmitir un DTE de location B (mismo tenant) -> 0 llamadas MH/metering/log", async () => {
    const { db, transaction } = scopedRuntimeDb("tenant-1", "loc-owner");

    const result = await transmitDteDocument(
      { dteDocumentId: "dte-doc-1", userId: "user-1", tenantId: "tenant-1", locationId: "loc-attacker" },
      db,
    );

    expect(result.ok).toBe(false);
    expect(transmitAdapterSpy).not.toHaveBeenCalled();
    expect(mhAuthAdapterCtorSpy).not.toHaveBeenCalled();
    expect(reserveDteFiscalCapacitySpy).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────
// FEX-PROD-0B — FEX 11 se transmite con version 3 y solo si el JSON
// firmado es v3. Adapter de transmisión mockeado: cero HTTP a MH.
// ─────────────────────────────────────────────────────────────────

describe("transmitDteDocument — FEX 11 schema v3 (FEX-PROD-0B)", () => {
  const FEX_SIGNED_DOC = {
    ...SIGNED_DOC,
    dte_type_code: "11",
    control_number: "DTE-11-M001P001-000000000000001",
  };

  function fexRuntimeDb(doc: unknown) {
    runtimeFindFirstSpy.mockResolvedValue(doc);
    runtimeTransactionSpy.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      const cb = arg as (tx: unknown) => Promise<unknown>;
      return cb({ dteOutgoingDocument: { update: vi.fn() }, dteTransmissionLog: { create: vi.fn() } });
    });
    return {
      dteOutgoingDocument: { findFirst: runtimeFindFirstSpy, update: vi.fn() },
      dteTransmissionLog: { create: vi.fn() },
      // FEX-PROD-1: emisor del mismo ambiente que el documento.
      dteIssuerConfig: { findFirst: vi.fn(async () => ({ environment: (doc as { environment: string }).environment })) },
      $transaction: runtimeTransactionSpy,
    } as unknown as Parameters<typeof transmitDteDocument>[1];
  }

  const PARAMS = { dteDocumentId: "dte-doc-1", userId: "user-1", tenantId: "tenant-1", locationId: "loc-1" };

  it("FEX firmado con JSON v3 -> adapter recibe version 3", async () => {
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    try {
      const db = fexRuntimeDb({ ...FEX_SIGNED_DOC, json_document: { identificacion: { version: 3 } } });

      await transmitDteDocument(PARAMS, db);

      expect(transmitAdapterSpy).toHaveBeenCalledTimes(1);
      expect(transmitAdapterSpy.mock.calls[0][0]).toMatchObject({ version: 3 });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("FEX firmado con JSON v1 (histórico) -> no se transmite ni reserva metering", async () => {
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    try {
      const db = fexRuntimeDb({ ...FEX_SIGNED_DOC, json_document: { identificacion: { version: 1 } } });

      const result = await transmitDteDocument(PARAMS, db);

      expect(result.ok).toBe(false);
      expect(transmitAdapterSpy).not.toHaveBeenCalled();
      expect(reserveDteFiscalCapacitySpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// FEX-PROD-1 — routing TEST/PRODUCTION de la transmisión FEX 11.
// Adapter MH, auth MH y metering mockeados: cero HTTP. El guard debe
// cortar ANTES de auth MH, adapter, reserva de metering y mutación.
// ─────────────────────────────────────────────────────────────────

describe("transmitDteDocument — FEX 11 routing TEST/PRODUCTION (FEX-PROD-1)", () => {
  const FEX_V3_JSON = { identificacion: { version: 3 } };

  function fexDoc(environment: "TEST" | "PRODUCTION", issuer_config_id: string) {
    return {
      ...SIGNED_DOC,
      dte_type_code:  "11",
      environment,
      issuer_config_id,
      control_number: "DTE-11-M001P001-000000000000001",
      json_document:  FEX_V3_JSON,
    };
  }

  // Emisores de dos tenants en una sola DB fake; findFirst respeta el scope.
  const ISSUERS = [
    { id: "issuer-p1", tenant_id: "tenant-1", location_id: "loc-1", environment: "PRODUCTION" },
    { id: "issuer-t1", tenant_id: "tenant-1", location_id: "loc-1", environment: "TEST" },
    { id: "issuer-B",  tenant_id: "tenant-B", location_id: "loc-B", environment: "PRODUCTION" },
  ];

  function routingDb(doc: unknown) {
    runtimeFindFirstSpy.mockResolvedValue(doc);
    runtimeTransactionSpy.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      const cb = arg as (tx: unknown) => Promise<unknown>;
      return cb({ dteOutgoingDocument: { update: vi.fn() }, dteTransmissionLog: { create: vi.fn() } });
    });
    const issuerFindFirst = vi.fn(async ({ where }: { where: { id: string; tenant_id: string; location_id: string } }) => {
      const row = ISSUERS.find((i) => i.id === where.id && i.tenant_id === where.tenant_id && i.location_id === where.location_id);
      return row ? { environment: row.environment } : null;
    });
    const db = {
      dteOutgoingDocument: { findFirst: runtimeFindFirstSpy, update: vi.fn() },
      dteTransmissionLog: { create: vi.fn() },
      dteIssuerConfig: { findFirst: issuerFindFirst },
      $transaction: runtimeTransactionSpy,
    };
    return { db: db as unknown as Parameters<typeof transmitDteDocument>[1], issuerFindFirst };
  }

  const PARAMS = { dteDocumentId: "dte-doc-1", userId: "user-1", tenantId: "tenant-1", locationId: "loc-1" };

  function expectBlockedBeforeMh() {
    expect(mhAuthAdapterCtorSpy).not.toHaveBeenCalled();
    expect(mhTransmissionAdapterCtorSpy).not.toHaveBeenCalled();
    expect(transmitAdapterSpy).not.toHaveBeenCalled();
    expect(reserveDteFiscalCapacitySpy).not.toHaveBeenCalled();
    expect(runtimeTransactionSpy).not.toHaveBeenCalled();
  }

  // Hermético: el .env local puede traer flags FEX; se limpian los tres.
  beforeEach(() => {
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "");
    vi.stubEnv("DTE_FEX11_ENABLED", "");
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("FEX PROD + DTE_FEX11_PRODUCTION_ENABLED=YES -> adapter MOCK con environment=PRODUCTION y version=3", async () => {
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    reserveDteFiscalCapacitySpy.mockResolvedValue({ ok: true, token: { mode: "RESERVED", reservationId: "r-1" } });
    const { db } = routingDb(fexDoc("PRODUCTION", "issuer-p1"));

    await transmitDteDocument(PARAMS, db);

    expect(transmitAdapterSpy).toHaveBeenCalledTimes(1);
    expect(transmitAdapterSpy.mock.calls[0][0]).toMatchObject({
      environment: "PRODUCTION", version: 3, issuerConfigId: "issuer-p1",
    });
    expect(reserveDteFiscalCapacitySpy.mock.calls[0][0]).toMatchObject({ environment: "PRODUCTION", tenantId: "tenant-1" });
  });

  it("FEX PROD sin flag PROD (solo DTE_FEX11_ENABLED y flag TEST) -> falla antes de auth/adapter/metering/mutación", async () => {
    vi.stubEnv("DTE_FEX11_ENABLED", "YES");
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    const { db } = routingDb(fexDoc("PRODUCTION", "issuer-p1"));

    const result = await transmitDteDocument(PARAMS, db);

    expect(result.ok).toBe(false);
    expectBlockedBeforeMh();
  });

  it("FEX PROD con flag PROD = 'yes' (no literal YES) -> bloqueado", async () => {
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "yes");
    const { db } = routingDb(fexDoc("PRODUCTION", "issuer-p1"));

    const result = await transmitDteDocument(PARAMS, db);

    expect(result.ok).toBe(false);
    expectBlockedBeforeMh();
  });

  it("FEX TEST con solo flag PROD -> bloqueado", async () => {
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    const { db } = routingDb(fexDoc("TEST", "issuer-t1"));

    const result = await transmitDteDocument(PARAMS, db);

    expect(result.ok).toBe(false);
    expectBlockedBeforeMh();
  });

  it("FEX TEST + flag TEST -> adapter MOCK con environment=TEST", async () => {
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    const { db } = routingDb(fexDoc("TEST", "issuer-t1"));

    await transmitDteDocument(PARAMS, db);

    expect(transmitAdapterSpy.mock.calls[0][0]).toMatchObject({ environment: "TEST", version: 3 });
  });

  it("documento PROD + emisor TEST (mismatch) -> falla antes del adapter", async () => {
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    const { db } = routingDb(fexDoc("PRODUCTION", "issuer-t1"));

    const result = await transmitDteDocument(PARAMS, db);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("no coincide");
    expectBlockedBeforeMh();
  });

  it("documento de tenant-1 apuntando al emisor de tenant-B -> falla antes del adapter", async () => {
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    const { db } = routingDb(fexDoc("PRODUCTION", "issuer-B"));

    const result = await transmitDteDocument(PARAMS, db);

    expect(result.ok).toBe(false);
    expectBlockedBeforeMh();
  });

  it("flag PROD de FEX no altera FE 01 en PROD (sin consulta de emisor FEX)", async () => {
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    reserveDteFiscalCapacitySpy.mockResolvedValue({ ok: true, token: { mode: "RESERVED", reservationId: "r-1" } });
    const { db, issuerFindFirst } = routingDb({ ...SIGNED_DOC, environment: "PRODUCTION" });

    await transmitDteDocument(PARAMS, db);

    expect(transmitAdapterSpy.mock.calls[0][0]).toMatchObject({ environment: "PRODUCTION", dteTypeCode: "01", version: 1 });
    expect(issuerFindFirst).not.toHaveBeenCalled();
  });
});
