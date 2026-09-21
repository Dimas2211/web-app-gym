// ─────────────────────────────────────────────────────────────────
// commerce/dte — sign-contingency-event.service.runtime-write.test.ts
//
// FASE VI-E6C — signContingencyEvent acepta un `db` explícito y usa
// db.* para TODO (DteContingencyEvent, resolución de credencial vía
// resolveDteSignerConfigForIssuer, DteTransmissionLog). Este test hace
// fallar CUALQUIER llamada al Prisma global para certificar
// RUNTIME_CLIENT_DTE_CONTINGENCY_SIGN_CAN_HIT_GLOBAL_PRISMA = NO. El
// adapter HTTP real (MhHttpDteSignerAdapter.sign) SIEMPRE se mockea —
// este test NUNCA hace una llamada de red real al firmador.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: signContingencyEvent tocó el Prisma global.");
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

import { signContingencyEvent } from "./sign-contingency-event.service";

const EVENT_PENDING = {
  id: "evt-1",
  status: "PENDING_SIGNATURE",
  event_json: { foo: "bar" },
  signed_jws: null,
  items: [
    { dte_document_id: "dte-1", dte_document: { environment: "TEST", issuer_config_id: "cfg-1" } },
  ],
};

const SIGNER_RESOLUTION_OK = {
  ok: true as const,
  source: "ISSUER_CREDENTIAL" as const,
  config: { signerUrl: "https://signer.example.test/firmardocumento/", timeoutMs: 10_000, healthUrl: "https://signer.example.test/status" },
  nit: "06141234567890",
  passwordPri: "dummy-password",
};

const BASE_PARAMS = {
  contingencyEventId: "evt-1",
  tenantId: "tenant-1",
  locationId: "loc-1",
};

function buildFakeRuntimeDb() {
  return {
    __marker: "RUNTIME_CLIENT_DB",
    dteContingencyEvent: {
      findFirst: vi.fn().mockResolvedValue(EVENT_PENDING),
      update: vi.fn().mockResolvedValue({}),
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

describe("signContingencyEvent — FASE VI-E6C (runtime db injection)", () => {
  it("usa db.* (runtime) para evento + credencial (issuer-aware) + log, nunca el Prisma global; firma exitosa -> SIGNED", async () => {
    const db = buildFakeRuntimeDb();
    signerAdapterSignSpy.mockResolvedValue({ ok: true, signedJws: "jws-signed-value" });

    const result = await signContingencyEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: true, status: "SIGNED" });
    expect(db.dteContingencyEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "evt-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(resolveDteSignerConfigForIssuerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ issuerConfigId: "cfg-1", environment: "TEST", client: db }),
    );
    expect(signerAdapterSignSpy).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("firma fallida -> NO persiste SIGNED, mantiene PENDING_SIGNATURE, registra log vía db", async () => {
    const db = buildFakeRuntimeDb();
    signerAdapterSignSpy.mockResolvedValue({ ok: false, errorCode: "SIGNER_ERROR", message: "Firma rechazada por el firmador." });

    const result = await signContingencyEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false, error: "Firma rechazada por el firmador." });
    expect(db.dteContingencyEvent.update).not.toHaveBeenCalled();
    expect(db.dteTransmissionLog.create).toHaveBeenCalledTimes(1);
  });

  it("evento no encontrado (cross-tenant/location) -> bloquea, signer nunca se invoca", async () => {
    const db = buildFakeRuntimeDb();
    db.dteContingencyEvent.findFirst = vi.fn().mockResolvedValue(null);

    const result = await signContingencyEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(signerAdapterSignSpy).not.toHaveBeenCalled();
  });

  it("evento en estado distinto a PENDING_SIGNATURE -> bloquea, signer nunca se invoca", async () => {
    const db = buildFakeRuntimeDb();
    db.dteContingencyEvent.findFirst = vi.fn().mockResolvedValue({ ...EVENT_PENDING, status: "SIGNED" });

    const result = await signContingencyEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(signerAdapterSignSpy).not.toHaveBeenCalled();
  });

  it("credencial no resuelta para el issuer -> bloquea, signer nunca se invoca", async () => {
    const db = buildFakeRuntimeDb();
    resolveDteSignerConfigForIssuerSpy.mockResolvedValue({ ok: false, error: "Credenciales del firmador DTE no configuradas." });

    const result = await signContingencyEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false, error: "Credenciales del firmador DTE no configuradas." });
    expect(signerAdapterSignSpy).not.toHaveBeenCalled();
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado para callers PLATFORM_NATIVE no migrados)", async () => {
    const result = await signContingencyEvent(BASE_PARAMS);
    expect(result).toMatchObject({ ok: false });
  });
});
