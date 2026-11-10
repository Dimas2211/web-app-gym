// FISCAL-ONBOARDING — preflight PRODUCTION verifica el firmador EFECTIVO
// del emisor (no las variables globales del proceso, que pueden ser de
// otro cliente). Sin red: health check simulado.

import { randomBytes } from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64");

vi.mock("../adapters/dte-signer.adapter", () => ({
  MhHttpDteSignerAdapter: class { checkHealth = vi.fn(async () => ({ ok: true })); },
}));

import { getDteProductionPreflight } from "./dte-production-preflight.service";
import { encryptDteCredentialPayload, type DteCredentialPayload } from "../lib/dte-credential-encryption";

const PROD_ISSUER = {
  id: "iss-prod", nit: "06140000000000", nrc: "123", name: "Emisor", activity_code: "93110", activity_name: "Gimnasios",
  establishment_code: "M001", establishment_type_code: "02", point_of_sale_code: "P001", cod_estable_mh: "M001", cod_punto_venta_mh: "P001",
  dept_code: "06", municipality_code: "14",
};

function db(opts: { prod?: boolean; creds: Record<string, DteCredentialPayload | undefined> }) {
  return {
    dteIssuerConfig: {
      findFirst: vi.fn(async ({ where }: { where: { environment: string } }) =>
        where.environment === "PRODUCTION" ? (opts.prod === false ? null : PROD_ISSUER)
        : where.environment === "TEST" ? { id: "iss-test" } : null),
      count: vi.fn(async () => 1),
    },
    dteCredential: {
      findFirst: vi.fn(async ({ where }: { where: { issuer_config_id: string } }) => {
        const p = opts.creds[where.issuer_config_id];
        return p ? { id: `c-${where.issuer_config_id}`, encrypted_payload: encryptDteCredentialPayload(p), is_active: true, updated_at: new Date() } : null;
      }),
    },
    dteCorrelative: { findMany: vi.fn(async () => []) },
  } as never;
}

const OWN_PROD: DteCredentialPayload = {
  apiUser: "u", apiPassword: "mh-prod", signerUrl: "https://firmador-cliente-prod.getzolvi.com/firmardocumento/",
  signerNit: "06140000000000", signerPrivateKeyPassword: "llave-prod", signerApiKey: randomBytes(32).toString("hex"),
};
const OWN_TEST: DteCredentialPayload = {
  apiUser: "u", apiPassword: "mh-test", signerUrl: "https://firmador-cliente-test.getzolvi.com/firmardocumento/",
  signerNit: "06140000000000", signerPrivateKeyPassword: "llave-test", signerApiKey: randomBytes(32).toString("hex"),
};

const blocked = (r: Awaited<ReturnType<typeof getDteProductionPreflight>>) => r.checks.filter((c) => c.status === "blocked").map((c) => c.code);

const ENV_KEYS = ["DTE_SIGNER_URL_PRODUCTION", "DTE_SIGNER_NIT", "DTE_SIGNER_PASSWORD", "DTE_SIGNER_API_KEY"];
beforeEach(() => {
  // Simula un proceso que tiene firmador GLOBAL de otro cliente (TrustMe).
  process.env.DTE_SIGNER_URL_PRODUCTION = "https://firmador-trustme.example.com/firmardocumento/";
  process.env.DTE_SIGNER_NIT = "99999999999999";
  process.env.DTE_SIGNER_PASSWORD = "trustme-llave";
  process.env.DTE_SIGNER_API_KEY = "trustme-global-key";
});
afterEach(() => { for (const k of ENV_KEYS) delete process.env[k]; });

describe("getDteProductionPreflight — firmador efectivo por emisor", () => {
  it("MetaTraining PROD hoy: sin DteIssuerConfig PRODUCTION -> BLOCKED", async () => {
    const r = await getDteProductionPreflight("t", "l", db({ prod: false, creds: {} }));
    expect(r.status).toBe("BLOCKED");
    expect(blocked(r)).toContain("ISSUER_CONFIG_EXISTS");
  });

  it("emisor PROD sin credencial propia: NO acepta el firmador global de otro cliente", async () => {
    const r = await getDteProductionPreflight("t", "l", db({ creds: {} }));
    expect(r.status).toBe("BLOCKED");
    expect(blocked(r)).toEqual(expect.arrayContaining(["CREDENTIAL_EXISTS", "SIGNER_EFFECTIVE"]));
  });

  it("credencial sin signerUrl ni signerApiKey propias -> bloquea (caería en DTE_SIGNER_* global)", async () => {
    const r = await getDteProductionPreflight("t", "l", db({ creds: { "iss-prod": { ...OWN_PROD, signerUrl: "", signerApiKey: "" } } }));
    expect(blocked(r)).toEqual(expect.arrayContaining(["SIGNER_URL_OWN", "SIGNER_API_KEY_OWN"]));
  });

  it("firmador propio, aislado de TEST, NIT coincidente -> sin bloqueos de firmador", async () => {
    const r = await getDteProductionPreflight("t", "l", db({ creds: { "iss-prod": OWN_PROD, "iss-test": OWN_TEST } }));
    expect(blocked(r)).toEqual([]);
    expect(r.checks.find((c) => c.code === "SIGNER_EFFECTIVE")?.detail).toContain("ISSUER_CREDENTIAL");
    expect(r.checks.find((c) => c.code === "SIGNER_ENV_ISOLATION")?.status).toBe("ok");
  });

  it("PROD apuntando al firmador TEST o reutilizando su API Key -> bloquea", async () => {
    const sameUrl = await getDteProductionPreflight("t", "l", db({ creds: { "iss-prod": { ...OWN_PROD, signerUrl: OWN_TEST.signerUrl }, "iss-test": OWN_TEST } }));
    expect(blocked(sameUrl)).toContain("SIGNER_ENV_ISOLATION");
    const sameKey = await getDteProductionPreflight("t", "l", db({ creds: { "iss-prod": { ...OWN_PROD, signerApiKey: OWN_TEST.signerApiKey }, "iss-test": OWN_TEST } }));
    expect(blocked(sameKey)).toContain("SIGNER_ENV_ISOLATION");
  });

  it("signerApiKey = apiPassword (incidente MetaTraining) -> bloquea", async () => {
    const r = await getDteProductionPreflight("t", "l", db({ creds: { "iss-prod": { ...OWN_PROD, signerApiKey: OWN_PROD.apiPassword } } }));
    expect(blocked(r)).toContain("SIGNER_SECRETS_DISTINCT");
  });

  it("NIT del certificado distinto al del emisor -> bloquea", async () => {
    const r = await getDteProductionPreflight("t", "l", db({ creds: { "iss-prod": { ...OWN_PROD, signerNit: "06149999999999" } } }));
    expect(blocked(r)).toContain("SIGNER_NIT_MATCH");
  });
});
