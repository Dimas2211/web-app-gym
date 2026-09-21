// ─────────────────────────────────────────────────────────────────
// commerce/dte — sign-dte-document.service.runtime-write.test.ts
//
// FASE VI-E5A — signDteDocument acepta un `db` explícito y usa db.*
// para TODO (DteOutgoingDocument, DteIssuerConfig, resolución de
// credencial vía resolveDteSignerConfigForIssuer, DteTransmissionLog,
// persistencia final). Este test hace fallar CUALQUIER llamada al
// Prisma global para certificar
// RUNTIME_CLIENT_DTE_SIGNING_CAN_HIT_GLOBAL_PRISMA = NO. El adapter HTTP
// real (MhHttpDteSignerAdapter.sign) SIEMPRE se mockea — este test NUNCA
// hace una llamada de red real al firmador/MH.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: signDteDocument tocó el Prisma global.");
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

import { signDteDocument } from "./sign-dte-document.service";

const DTE_DOC = {
  id: "dte-1",
  dte_status: "SCHEMA_VALIDATED",
  json_document: { identificacion: { fecEmi: "2026-01-01" } },
  signed_jws: null,
  retry_count: 0,
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

function buildFakeRuntimeDb(issuerConfig: unknown = ISSUER_CONFIG_TEST) {
  const txDb = {
    dteOutgoingDocument: { update: vi.fn().mockResolvedValue({}) },
    dteTransmissionLog: { create: vi.fn().mockResolvedValue({}) },
  };
  return {
    __marker: "RUNTIME_CLIENT_DB",
    dteOutgoingDocument: {
      findFirst: vi.fn().mockResolvedValue(DTE_DOC),
      update: vi.fn().mockResolvedValue({}),
    },
    dteIssuerConfig: {
      findFirst: vi.fn().mockResolvedValue(issuerConfig),
    },
    dteTransmissionLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    __tx: txDb,
  };
}

const BASE_PARAMS = {
  dteDocumentId: "dte-1",
  userId: "u1",
  tenantId: "tenant-1",
  locationId: "loc-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveDteSignerConfigForIssuerSpy.mockResolvedValue(SIGNER_RESOLUTION_OK);
});

describe("signDteDocument — FASE VI-E5A (runtime db injection)", () => {
  it("usa db.* (runtime) para documento + emisor + credencial + log, nunca el Prisma global; firma exitosa persiste SIGNED", async () => {
    const db = buildFakeRuntimeDb();
    signerAdapterSignSpy.mockResolvedValue({ ok: true, signedJws: "jws-signed-value", signedAt: new Date("2026-01-01T00:00:00.000Z") });

    const result = await signDteDocument(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: true, dteStatus: "SIGNED" });
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

  it("firma fallida -> NO persiste SIGNED, mantiene SCHEMA_VALIDATED e incrementa retry_count (en db runtime)", async () => {
    const db = buildFakeRuntimeDb();
    signerAdapterSignSpy.mockResolvedValue({ ok: false, errorCode: "SIGNER_ERROR", message: "Firma rechazada por el firmador." });

    const result = await signDteDocument(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false, error: "Firma rechazada por el firmador." });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    // El update de la transacción fallida nunca debe fijar dte_status: SIGNED.
    const txCallArgs = (db.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(JSON.stringify(txCallArgs)).not.toContain("SIGNED");
  });

  it("timeout del firmador -> no persiste SIGNED, retorna error, signer llamado exactamente 1 vez", async () => {
    const db = buildFakeRuntimeDb();
    signerAdapterSignSpy.mockResolvedValue({ ok: false, errorCode: "SIGNER_TIMEOUT", message: "Firmador no respondió en el tiempo configurado." });

    const result = await signDteDocument(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false, error: "Firmador no respondió en el tiempo configurado." });
    expect(signerAdapterSignSpy).toHaveBeenCalledTimes(1);
  });

  it("ambiente del emisor (PRODUCTION) no coincide con ambiente del documento (TEST) -> bloquea antes de llamar al firmador", async () => {
    const db = buildFakeRuntimeDb(ISSUER_CONFIG_PROD);

    const result = await signDteDocument(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(signerAdapterSignSpy).not.toHaveBeenCalled();
    expect(resolveDteSignerConfigForIssuerSpy).not.toHaveBeenCalled();
  });

  it("emisor no encontrado en la misma runtime DB (tenant/location distinto) -> bloquea antes de llamar al firmador", async () => {
    const db = buildFakeRuntimeDb();
    db.dteIssuerConfig.findFirst = vi.fn().mockResolvedValue(null);

    const result = await signDteDocument(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(signerAdapterSignSpy).not.toHaveBeenCalled();
  });

  it("documento no encontrado en la runtime db (cross-tenant/location) -> bloquea, signer nunca se invoca", async () => {
    const db = buildFakeRuntimeDb();
    db.dteOutgoingDocument.findFirst = vi.fn().mockResolvedValue(null);

    const result = await signDteDocument(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(signerAdapterSignSpy).not.toHaveBeenCalled();
    expect(db.dteIssuerConfig.findFirst).not.toHaveBeenCalled();
  });

  it("documento en estado no firmable (ej. ya SIGNED) -> bloquea, signer nunca se invoca", async () => {
    const db = buildFakeRuntimeDb();
    db.dteOutgoingDocument.findFirst = vi.fn().mockResolvedValue({ ...DTE_DOC, dte_status: "SIGNED" });

    const result = await signDteDocument(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(signerAdapterSignSpy).not.toHaveBeenCalled();
  });

  it("credencial no resuelta para el issuer (resolveDteSignerConfigForIssuer falla) -> bloquea, signer nunca se invoca", async () => {
    const db = buildFakeRuntimeDb();
    resolveDteSignerConfigForIssuerSpy.mockResolvedValue({ ok: false, error: "Credenciales del firmador DTE no configuradas." });

    const result = await signDteDocument(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false, error: "Credenciales del firmador DTE no configuradas." });
    expect(signerAdapterSignSpy).not.toHaveBeenCalled();
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado para callers PLATFORM_NATIVE no migrados)", async () => {
    await expect(signDteDocument(BASE_PARAMS)).rejects.toThrow("RUNTIME_UNSAFE");
  });
});
