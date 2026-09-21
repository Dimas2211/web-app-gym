// ─────────────────────────────────────────────────────────────────
// commerce/dte — sign-invalidation-event.service.runtime-write.test.ts
//
// FASE VI-E6B — signInvalidationEvent acepta un `db` explícito y usa
// db.* para TODO (DteInvalidationEvent, DteOutgoingDocument,
// DteIssuerConfig, resolución de credencial vía
// resolveDteSignerConfigForIssuer, DteTransmissionLog). Este test hace
// fallar CUALQUIER llamada al Prisma global para certificar
// RUNTIME_CLIENT_DTE_INVALIDATION_SIGN_CAN_HIT_GLOBAL_PRISMA = NO. El
// adapter HTTP real (MhHttpDteSignerAdapter.sign) SIEMPRE se mockea —
// este test NUNCA hace una llamada de red real al firmador.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: signInvalidationEvent tocó el Prisma global.");
      },
    },
  ),
}));

const { signerAdapterSignSpy, resolveDteSignerConfigForIssuerSpy } = vi.hoisted(() => ({
  signerAdapterSignSpy: vi.fn(),
  resolveDteSignerConfigForIssuerSpy: vi.fn(),
}));

vi.mock("../adapters/dte-signer.adapter", () => ({
  MhHttpDteSignerAdapter: vi.fn().mockImplementation(() => ({
    sign: signerAdapterSignSpy,
  })),
}));

vi.mock("./dte-credential.service", () => ({
  resolveDteSignerConfigForIssuer: resolveDteSignerConfigForIssuerSpy,
}));

import { signInvalidationEvent } from "./sign-invalidation-event.service";

const INV_EVENT = {
  id: "inv-1",
  status: "DRAFT",
  event_json: { foo: "bar" },
  signed_jws: null,
  dte_document_id: "dte-1",
};

const DTE_DOC = {
  id: "dte-1",
  dte_status: "ACCEPTED",
  environment: "TEST",
  issuer_config_id: "cfg-1",
};

const ISSUER_CONFIG_TEST = { environment: "TEST" };
const ISSUER_CONFIG_PROD = { environment: "PRODUCTION" };

const SIGNER_RESOLUTION_OK = {
  ok: true as const,
  source: "ISSUER_CREDENTIAL" as const,
  config: { signerUrl: "https://signer.example.test/firmardocumento/", timeoutMs: 10_000, healthUrl: "https://signer.example.test/status" },
  nit: "06141234567890",
  passwordPri: "dummy-password",
};

const BASE_PARAMS = {
  invalidationEventId: "inv-1",
  userId: "u1",
  tenantId: "tenant-1",
  locationId: "loc-1",
};

function buildFakeRuntimeDb(issuerConfig: unknown = ISSUER_CONFIG_TEST) {
  return {
    __marker: "RUNTIME_CLIENT_DB",
    dteInvalidationEvent: {
      findFirst: vi.fn().mockResolvedValue(INV_EVENT),
      update: vi.fn().mockResolvedValue({}),
    },
    dteOutgoingDocument: {
      findFirst: vi.fn().mockResolvedValue(DTE_DOC),
    },
    dteIssuerConfig: {
      findFirst: vi.fn().mockResolvedValue(issuerConfig),
    },
    dteTransmissionLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveDteSignerConfigForIssuerSpy.mockResolvedValue(SIGNER_RESOLUTION_OK);
});

describe("signInvalidationEvent — FASE VI-E6B (runtime db injection)", () => {
  it("usa db.* (runtime) para evento + documento + emisor + credencial + log, nunca el Prisma global; firma exitosa persiste SIGNED", async () => {
    const db = buildFakeRuntimeDb();
    signerAdapterSignSpy.mockResolvedValue({ ok: true, signedJws: "jws-signed-value" });

    const result = await signInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: true, status: "SIGNED" });
    expect(db.dteInvalidationEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(db.dteOutgoingDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dte-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(db.dteIssuerConfig.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cfg-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(resolveDteSignerConfigForIssuerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ issuerConfigId: "cfg-1", environment: "TEST", client: db }),
    );
    expect(signerAdapterSignSpy).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("firma fallida -> NO persiste SIGNED, mantiene DRAFT, guarda last_error", async () => {
    const db = buildFakeRuntimeDb();
    signerAdapterSignSpy.mockResolvedValue({ ok: false, errorCode: "SIGNER_ERROR", message: "Firma rechazada por el firmador." });

    const result = await signInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false, error: "Firma rechazada por el firmador." });
    const txCallArgs = (db.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(JSON.stringify(txCallArgs)).not.toContain('"SIGNED"');
  });

  it("evento no encontrado (cross-tenant/location) -> bloquea, signer nunca se invoca", async () => {
    const db = buildFakeRuntimeDb();
    db.dteInvalidationEvent.findFirst = vi.fn().mockResolvedValue(null);

    const result = await signInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(signerAdapterSignSpy).not.toHaveBeenCalled();
  });

  it("evento en estado distinto a DRAFT (ej. ya SIGNED) -> bloquea, signer nunca se invoca", async () => {
    const db = buildFakeRuntimeDb();
    db.dteInvalidationEvent.findFirst = vi.fn().mockResolvedValue({ ...INV_EVENT, status: "SIGNED" });

    const result = await signInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(signerAdapterSignSpy).not.toHaveBeenCalled();
  });

  it("DTE original no ACCEPTED -> bloquea, signer nunca se invoca", async () => {
    const db = buildFakeRuntimeDb();
    db.dteOutgoingDocument.findFirst = vi.fn().mockResolvedValue({ ...DTE_DOC, dte_status: "INVALIDATED" });

    const result = await signInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(signerAdapterSignSpy).not.toHaveBeenCalled();
  });

  it("ambiente del emisor (PRODUCTION) no coincide con ambiente del documento (TEST) -> bloquea antes de llamar al firmador", async () => {
    const db = buildFakeRuntimeDb(ISSUER_CONFIG_PROD);

    const result = await signInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(signerAdapterSignSpy).not.toHaveBeenCalled();
    expect(resolveDteSignerConfigForIssuerSpy).not.toHaveBeenCalled();
  });

  it("credencial no resuelta para el issuer -> bloquea, signer nunca se invoca", async () => {
    const db = buildFakeRuntimeDb();
    resolveDteSignerConfigForIssuerSpy.mockResolvedValue({ ok: false, error: "Credenciales del firmador DTE no configuradas." });

    const result = await signInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false, error: "Credenciales del firmador DTE no configuradas." });
    expect(signerAdapterSignSpy).not.toHaveBeenCalled();
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado para callers PLATFORM_NATIVE no migrados)", async () => {
    const result = await signInvalidationEvent(BASE_PARAMS);
    expect(result).toMatchObject({ ok: false });
  });
});
