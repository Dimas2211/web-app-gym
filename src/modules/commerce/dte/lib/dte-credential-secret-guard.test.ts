// FISCAL-ONBOARDING — prevención del incidente MetaTraining (§04):
// signerApiKey nunca puede igualar apiPassword ni signerPrivateKeyPassword.

import { randomBytes } from "node:crypto";
import { describe, it, expect, vi } from "vitest";

process.env.PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64");

import { findDteSecretCollisions, describeBlockingCollisions, fingerprintSecret } from "./dte-credential-secret-guard";
import { upsertDteCredential, getDteCredentialStatus } from "../services/dte-credential.service";
import { encryptDteCredentialPayload } from "./dte-credential-encryption";

function fakeDb(existing: string | null) {
  const store = { encrypted: existing };
  return {
    store,
    dteIssuerConfig: { findFirst: vi.fn().mockResolvedValue({ id: "iss-1" }) },
    dteCredential: {
      findFirst: vi.fn(async () => (store.encrypted ? { id: "cred-1", encrypted_payload: store.encrypted, is_active: true, updated_at: new Date() } : null)),
      update: vi.fn(async ({ data }: { data: { encrypted_payload: string } }) => { store.encrypted = data.encrypted_payload; return {}; }),
      create: vi.fn(async ({ data }: { data: { encrypted_payload: string } }) => { store.encrypted = data.encrypted_payload; return {}; }),
    },
  };
}

describe("dte-credential-secret-guard", () => {
  it("detecta signerApiKey = apiPassword (bloqueante) sin exponer valores", () => {
    const c = findDteSecretCollisions({ apiPassword: "Clave-MH-2026", signerApiKey: "Clave-MH-2026" });
    expect(c).toEqual([{ a: "signerApiKey", b: "apiPassword", blocking: true }]);
    const msg = describeBlockingCollisions(c)!;
    expect(msg).toContain("Secretos confundidos");
    expect(msg).not.toContain("Clave-MH-2026");
  });

  it("apiPassword = signerPrivateKeyPassword es solo advertencia", () => {
    const c = findDteSecretCollisions({ apiPassword: "x1", signerPrivateKeyPassword: "x1" });
    expect(c[0].blocking).toBe(false);
    expect(describeBlockingCollisions(c)).toBeNull();
  });

  it("huella parcial de 16 hex, determinista y distinta por secreto", () => {
    expect(fingerprintSecret("a")).toMatch(/^[a-f0-9]{16}$/);
    expect(fingerprintSecret("a")).toBe(fingerprintSecret("a"));
    expect(fingerprintSecret("a")).not.toBe(fingerprintSecret("b"));
    expect(fingerprintSecret("")).toBeNull();
  });
});

describe("upsertDteCredential — comprobación en servidor sobre el payload final (merge)", () => {
  it("rechaza guardar una API Key igual a la contraseña MH YA guardada (campo en blanco = conservar)", async () => {
    const db = fakeDb(encryptDteCredentialPayload({
      apiUser: "u", apiPassword: "MH-Secreta-1", signerUrl: "https://firmador-x-test.getzolvi.com/firmardocumento/",
      signerNit: "06140000000000", signerPrivateKeyPassword: "llave-1", signerApiKey: "",
    }));
    const r = await upsertDteCredential("iss-1", "t", "l", null, { signerApiKey: "MH-Secreta-1" }, db as never);
    expect(r.ok).toBe(false);
    expect(db.dteCredential.update).not.toHaveBeenCalled();
  });

  it("acepta una API Key distinta y el estado expone solo presencia + huella", async () => {
    const db = fakeDb(null);
    const key = randomBytes(32).toString("hex");
    const r = await upsertDteCredential("iss-1", "t", "l", null, {
      apiUser: "u", apiPassword: "MH-1", signerUrl: "https://firmador-x-test.getzolvi.com/firmardocumento/",
      signerNit: "06140000000000", signerPrivateKeyPassword: "llave-1", signerApiKey: key,
    }, db as never);
    expect(r).toEqual({ ok: true });
    const st = await getDteCredentialStatus("iss-1", db as never);
    expect(st).toMatchObject({ has_signer_api_key: true, signer_api_key_fingerprint: fingerprintSecret(key), signer_host: "firmador-x-test.getzolvi.com", secret_collisions: [] });
    expect(JSON.stringify(st)).not.toContain(key);
  });

  it("rechaza URL de firmador que no termina en /firmardocumento/", async () => {
    const db = fakeDb(null);
    const r = await upsertDteCredential("iss-1", "t", "l", null, { signerUrl: "https://firmador.getzolvi.com/" }, db as never);
    expect(r.ok).toBe(false);
  });
});
