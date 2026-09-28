// ─────────────────────────────────────────────────────────────────
// commerce/dte — sign-dte-document.service.fex-routing.test.ts
//
// FEX-PROD-1 — firma FEX 11 PRODUCTION enrutada al emisor PROD del
// mismo tenant/location y a la credencial/firmador de ESE emisor. Sin
// cambios criptográficos: adapter del firmador y resolver de credencial
// mockeados — cero HTTP. Una sola DB fake con dos tenants (A/B).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, {
    get() {
      throw new Error("RUNTIME_UNSAFE: signDteDocument tocó el Prisma global.");
    },
  }),
}));

const { signerAdapterSignSpy, resolveDteSignerConfigForIssuerSpy } = vi.hoisted(() => ({
  signerAdapterSignSpy: vi.fn(),
  resolveDteSignerConfigForIssuerSpy: vi.fn(),
}));

vi.mock("../adapters/dte-signer.adapter", () => ({
  MhHttpDteSignerAdapter: vi.fn().mockImplementation(() => ({ sign: signerAdapterSignSpy })),
}));

vi.mock("./dte-credential.service", () => ({
  resolveDteSignerConfigForIssuer: resolveDteSignerConfigForIssuerSpy,
}));

import { signDteDocument } from "./sign-dte-document.service";

const TENANT_A = "tenant-A";
const TENANT_B = "tenant-B";

const ISSUERS = [
  { id: "issuer-A-prod", tenant_id: TENANT_A, location_id: "loc-A", environment: "PRODUCTION" },
  { id: "issuer-A-test", tenant_id: TENANT_A, location_id: "loc-A", environment: "TEST" },
  { id: "issuer-B-prod", tenant_id: TENANT_B, location_id: "loc-B", environment: "PRODUCTION" },
];

function fexDoc(environment: string, issuer_config_id: string) {
  return {
    id: "dte-fex",
    dte_type_code: "11",
    dte_status: "SCHEMA_VALIDATED",
    json_document: { identificacion: { version: 3, ambiente: environment === "PRODUCTION" ? "01" : "00" } },
    signed_jws: null,
    retry_count: 0,
    environment,
    issuer_config_id,
  };
}

function sharedDb(doc: Omit<ReturnType<typeof fexDoc>, "json_document"> & { json_document: unknown }) {
  return {
    dteOutgoingDocument: {
      findFirst: vi.fn(async () => doc),
      update: vi.fn(async () => ({})),
    },
    dteIssuerConfig: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenant_id: string; location_id: string } }) => {
        const row = ISSUERS.find((i) => i.id === where.id && i.tenant_id === where.tenant_id && i.location_id === where.location_id);
        return row ? { environment: row.environment } : null;
      }),
    },
    dteTransmissionLog: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  };
}

const SIGNER_OK = {
  ok: true as const,
  source: "ISSUER_CREDENTIAL" as const,
  config: { signerUrl: "https://signer.example.test/firmardocumento/", timeoutMs: 10_000, healthUrl: "https://signer.example.test/status" },
  nit: "06141234567890",
  passwordPri: "dummy",
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveDteSignerConfigForIssuerSpy.mockResolvedValue(SIGNER_OK);
  signerAdapterSignSpy.mockResolvedValue({ ok: true, signedJws: "jws", signedAt: new Date("2026-09-28T00:00:00.000Z") });
});

describe("signDteDocument — FEX 11 PRODUCTION routing (FEX-PROD-1)", () => {
  it("FEX PROD -> emisor PROD del mismo tenant -> credencial/firmador de ESE emisor en PRODUCTION", async () => {
    const db = sharedDb(fexDoc("PRODUCTION", "issuer-A-prod"));

    const result = await signDteDocument(
      { dteDocumentId: "dte-fex", userId: "u1", tenantId: TENANT_A, locationId: "loc-A" },
      db as never,
    );

    expect(result).toMatchObject({ ok: true });
    expect(db.dteIssuerConfig.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "issuer-A-prod", tenant_id: TENANT_A, location_id: "loc-A" },
    }));
    expect(resolveDteSignerConfigForIssuerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ issuerConfigId: "issuer-A-prod", environment: "PRODUCTION", client: db }),
    );
    expect(signerAdapterSignSpy).toHaveBeenCalledWith(
      expect.objectContaining({ nit: SIGNER_OK.nit }),
      SIGNER_OK.config,
    );
  });

  it("documento PROD + emisor TEST (mismatch) -> falla antes de resolver credencial y del adapter", async () => {
    const db = sharedDb(fexDoc("PRODUCTION", "issuer-A-test"));

    const result = await signDteDocument(
      { dteDocumentId: "dte-fex", userId: "u1", tenantId: TENANT_A, locationId: "loc-A" },
      db as never,
    );

    expect(result.ok).toBe(false);
    expect(resolveDteSignerConfigForIssuerSpy).not.toHaveBeenCalled();
    expect(signerAdapterSignSpy).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("tenant B no puede firmar con el emisor/credencial de tenant A -> falla antes del adapter", async () => {
    const db = sharedDb(fexDoc("PRODUCTION", "issuer-A-prod"));

    const result = await signDteDocument(
      { dteDocumentId: "dte-fex", userId: "u-b", tenantId: TENANT_B, locationId: "loc-B" },
      db as never,
    );

    expect(result.ok).toBe(false);
    expect(resolveDteSignerConfigForIssuerSpy).not.toHaveBeenCalled();
    expect(signerAdapterSignSpy).not.toHaveBeenCalled();
  });

  it("FEX JSON legado v1 en PROD -> no se firma", async () => {
    const doc = { ...fexDoc("PRODUCTION", "issuer-A-prod"), json_document: { identificacion: { version: 1 } } };
    const db = sharedDb(doc);

    const result = await signDteDocument(
      { dteDocumentId: "dte-fex", userId: "u1", tenantId: TENANT_A, locationId: "loc-A" },
      db as never,
    );

    expect(result.ok).toBe(false);
    expect(signerAdapterSignSpy).not.toHaveBeenCalled();
  });
});
