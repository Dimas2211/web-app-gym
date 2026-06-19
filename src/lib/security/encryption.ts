// ─────────────────────────────────────────────────────────────────
// lib/security/encryption.ts
//
// Utilidad de cifrado AES-256-GCM — SERVER-ONLY.
// Usa el módulo nativo `crypto` de Node.js.
// NUNCA importar desde Client Components ni páginas browser-only.
// ─────────────────────────────────────────────────────────────────

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Guardia runtime para detectar importación accidental en browser
if (typeof window !== "undefined") {
  throw new Error(
    "[encryption] Este módulo es server-only. No puede usarse en contexto de navegador.",
  );
}

// ── Constantes internas ───────────────────────────────────────────

const ALG          = "aes-256-gcm" as const;
const KEY_BYTES    = 32; // 256 bits
const IV_BYTES     = 12; // 96-bit IV recomendado para GCM
const KEY_VERSION  = "v1";
const PAYLOAD_VER  = 1;

// ── Tipo interno del payload cifrado ─────────────────────────────

interface EncryptedEnvelope {
  v:          number;
  alg:        string;
  keyVersion: string;
  iv:         string; // base64
  tag:        string; // base64 — auth tag GCM
  data:       string; // base64 — ciphertext
}

// ── Validación de key ─────────────────────────────────────────────

/**
 * Verifica que PLATFORM_ENCRYPTION_KEY esté configurada y tenga 32 bytes en base64.
 * Lanza un error claro si no está disponible.
 * Llamar explícitamente en startup o antes de operaciones de cifrado críticas.
 */
export function assertEncryptionAvailable(): void {
  const raw = process.env.PLATFORM_ENCRYPTION_KEY;
  if (!raw || raw.trim() === "") {
    throw new Error(
      "[encryption] PLATFORM_ENCRYPTION_KEY no está configurada. " +
      "Agregar al entorno 32 bytes en base64. Ver .env.example.",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.byteLength !== KEY_BYTES) {
    throw new Error(
      `[encryption] PLATFORM_ENCRYPTION_KEY debe ser exactamente ${KEY_BYTES} bytes en base64 ` +
      `(se recibieron ${buf.byteLength} bytes). Regenerar con: ` +
      `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
}

function resolveKey(): Buffer {
  assertEncryptionAvailable();
  return Buffer.from(process.env.PLATFORM_ENCRYPTION_KEY!, "base64");
}

// ── Cifrado/descifrado de texto ───────────────────────────────────

/**
 * Cifra un string plano con AES-256-GCM.
 * Devuelve un string base64 que encapsula el envelope JSON con IV, tag y data.
 */
export function encryptText(plainText: string): string {
  const key    = resolveKey();
  const iv     = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, key, iv);

  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag       = cipher.getAuthTag();

  const envelope: EncryptedEnvelope = {
    v:          PAYLOAD_VER,
    alg:        "AES-256-GCM",
    keyVersion: KEY_VERSION,
    iv:         iv.toString("base64"),
    tag:        tag.toString("base64"),
    data:       encrypted.toString("base64"),
  };

  return Buffer.from(JSON.stringify(envelope)).toString("base64");
}

/**
 * Descifra un string producido por encryptText.
 * Lanza si el envelope es inválido, la key no coincide o el tag GCM falla.
 */
export function decryptText(encryptedPayload: string): string {
  const key = resolveKey();

  let envelope: EncryptedEnvelope;
  try {
    envelope = JSON.parse(Buffer.from(encryptedPayload, "base64").toString("utf8")) as EncryptedEnvelope;
  } catch {
    throw new Error("[encryption] El payload cifrado no tiene formato válido (base64/JSON esperado).");
  }

  if (envelope.v !== PAYLOAD_VER) {
    throw new Error(`[encryption] Versión de payload no soportada: ${envelope.v}.`);
  }
  if (envelope.alg !== "AES-256-GCM") {
    throw new Error(`[encryption] Algoritmo no soportado: ${envelope.alg}.`);
  }

  const iv       = Buffer.from(envelope.iv,   "base64");
  const tag      = Buffer.from(envelope.tag,  "base64");
  const data     = Buffer.from(envelope.data, "base64");
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

// ── Cifrado/descifrado de objetos JSON ────────────────────────────

/**
 * Serializa un objeto a JSON y lo cifra con encryptText.
 */
export function encryptJsonPayload(payload: unknown): string {
  return encryptText(JSON.stringify(payload));
}

/**
 * Descifra y deserializa un payload cifrado por encryptJsonPayload.
 */
export function decryptJsonPayload<T>(encryptedPayload: string): T {
  return JSON.parse(decryptText(encryptedPayload)) as T;
}
