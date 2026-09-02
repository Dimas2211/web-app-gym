// ─────────────────────────────────────────────────────────────────
// dte/lib/dte-credential-encryption.ts
//
// Helper server-only para cifrar/descifrar payloads de DteCredential.
// Usa la utilidad central AES-256-GCM de src/lib/security/encryption.ts.
// NUNCA importar desde Client Components.
// ─────────────────────────────────────────────────────────────────

import { decryptJsonPayload, encryptJsonPayload } from "@/lib/security/encryption";

// ── Tipo de payload conceptual de credenciales DTE ───────────────
// Representa los secretos operativos necesarios para firmar y transmitir al MH.
// Este payload NUNCA debe guardarse en texto plano.

export interface DteCredentialPayload {
  apiUser:                  string; // usuario ante Hacienda
  apiPassword:              string; // contraseña ante Hacienda
  signerUrl:                string; // URL del firmador DTE externo
  signerNit:                string; // NIT del emisor para el firmador
  signerPrivateKeyPassword: string; // contraseña de la llave privada
  // SIGNERPROFILE-MULTITENANT — campo agregado sin migración (vive dentro del
  // envelope cifrado, no es columna nueva). Header X-DTE-Signer-Key propio de
  // este emisor/ambiente para su firmador dedicado. Opcional: si no está
  // presente, el resolver cae al DTE_SIGNER_API_KEY global de proceso. Ver
  // resolveDteSignerConfigForIssuer en dte-credential.service.ts.
  signerApiKey?:             string;
}

// ── Funciones de cifrado/descifrado ──────────────────────────────

/**
 * Cifra un DteCredentialPayload con AES-256-GCM.
 * El resultado es apto para guardar en DteCredential.encrypted_payload.
 */
export function encryptDteCredentialPayload(payload: DteCredentialPayload): string {
  return encryptJsonPayload(payload);
}

/**
 * Descifra el valor de DteCredential.encrypted_payload.
 * Lanza si el payload es inválido o la key no coincide.
 */
export function decryptDteCredentialPayload(encryptedPayload: string): DteCredentialPayload {
  return decryptJsonPayload<DteCredentialPayload>(encryptedPayload);
}
