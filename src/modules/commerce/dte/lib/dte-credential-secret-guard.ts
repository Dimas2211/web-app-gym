// ─────────────────────────────────────────────────────────────────
// commerce/dte/lib — dte-credential-secret-guard.ts
//
// FISCAL-ONBOARDING — prevención del incidente MetaTraining (guía §04):
// la signerApiKey del firmador quedó igual a la apiPassword de Hacienda.
// Estas utilidades comparan secretos por hash SHA-256 en tiempo
// constante y nunca devuelven ni registran el valor legible.
// ─────────────────────────────────────────────────────────────────

import { createHash, timingSafeEqual } from "node:crypto";

/** Huella parcial (16 hex) — sirve para comparar origen, NO autentica. */
export function fingerprintSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

export type DteSecretField = "apiUser" | "apiPassword" | "signerPrivateKeyPassword" | "signerApiKey";

export interface DteSecretCollision {
  a: DteSecretField;
  b: DteSecretField;
  /** true = bloquea el guardado; false = advertencia. */
  blocking: boolean;
}

export const DTE_SECRET_FIELD_LABELS: Record<DteSecretField, string> = {
  apiUser:                  "usuario MH",
  apiPassword:              "contraseña MH (apiPassword)",
  signerPrivateKeyPassword: "contraseña de la llave privada",
  signerApiKey:             "API Key del firmador (X-DTE-Signer-Key)",
};

export function findDteSecretCollisions(payload: Partial<Record<DteSecretField, string | null | undefined>>): DteSecretCollision[] {
  const pairs: Array<[DteSecretField, DteSecretField, boolean]> = [
    ["signerApiKey", "apiPassword", true],
    ["signerApiKey", "signerPrivateKeyPassword", true],
    ["signerApiKey", "apiUser", true],
    ["apiPassword", "signerPrivateKeyPassword", false],
  ];
  const out: DteSecretCollision[] = [];
  for (const [a, b, blocking] of pairs) {
    const va = payload[a]?.trim();
    const vb = payload[b]?.trim();
    if (va && vb && sameSecret(va, vb)) out.push({ a, b, blocking });
  }
  return out;
}

export function describeBlockingCollisions(collisions: DteSecretCollision[]): string | null {
  const blocking = collisions.filter((c) => c.blocking);
  if (blocking.length === 0) return null;
  const parts = blocking.map((c) => `${DTE_SECRET_FIELD_LABELS[c.a]} = ${DTE_SECRET_FIELD_LABELS[c.b]}`);
  return (
    "Secretos confundidos: " + parts.join("; ") +
    ". La API Key del firmador es un secreto propio del firmador del emisor/ambiente y no puede coincidir con credenciales de Hacienda ni de la llave privada."
  );
}

/** Formato mínimo para API Keys nuevas generadas por el aprovisionador (64 hex). */
export function isStrongSignerApiKey(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
