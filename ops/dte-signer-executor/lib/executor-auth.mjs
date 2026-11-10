// ops/dte-signer-executor/lib/executor-auth.mjs
//
// FISCAL-ONBOARDING — firma/verificación de requests Zolvi -> ejecutor.
// HMAC-SHA256 sobre el cuerpo crudo, que incluye `ts` (ms) y `nonce`.
// Compartido por el transporte de Zolvi y el ejecutor del VPS.
//
// Anti-replay: ventana de tiempo (±skew) + nonce de un solo uso. En el
// servicio, los nonces aceptados se persisten en disco (createFileNonceStore)
// ANTES de ejecutar la operación: un reinicio del ejecutor no permite
// repetir una request ya aceptada dentro de su ventana. Cada entrada expira
// a los 2×skew y el almacén tiene un tope duro: si se llena o no puede
// escribirse, la request se rechaza (fail closed), nunca se descarta un
// nonce vigente para hacer lugar.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import * as nodeFs from "node:fs";

export function signExecutorRequest(secret, body) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** El almacén guarda sha256(nonce), nunca el nonce ni el cuerpo ni la firma. */
function nonceKey(nonce) {
  return createHash("sha256").update(String(nonce)).digest("hex");
}

/** Almacén en memoria (tests y CLI de diagnóstico; NO sobrevive a reinicios). */
export function createMemoryNonceStore({ maxEntries = 10_000 } = {}) {
  const seen = new Map();
  return {
    has(key, t) {
      const exp = seen.get(key);
      return exp !== undefined && exp >= t;
    },
    add(key, exp, t) {
      for (const [k, e] of seen) if (e < t) seen.delete(k);
      if (seen.size >= maxEntries) return false;
      seen.set(key, exp);
      return true;
    },
    size() { return seen.size; },
  };
}

/**
 * Almacén persistente: JSON { v: 1, entries: { <sha256(nonce)>: <expMs> } }.
 * - Carga al crear (reinicio): entradas vencidas se descartan.
 * - Archivo ilegible/corrupto -> lanza: el servicio no arranca en lugar de
 *   olvidar nonces vigentes (esperar 2×skew y borrar el archivo a mano).
 * - Escritura atómica (tmp + rename, 0600) antes de aceptar la request.
 */
export function createFileNonceStore(filePath, { fs = nodeFs, maxEntries = 10_000 } = {}) {
  if (typeof filePath !== "string" || !filePath) throw new Error("Ruta del almacén de nonces requerida.");
  const entries = new Map();
  let raw = null;
  try { raw = fs.readFileSync(filePath, "utf8"); } catch (err) {
    if (err?.code !== "ENOENT") throw new Error("No se pudo leer el almacén de nonces.");
  }
  if (raw !== null && raw.trim() !== "") {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error("Almacén de nonces corrupto."); }
    if (!parsed || parsed.v !== 1 || typeof parsed.entries !== "object" || parsed.entries === null) {
      throw new Error("Almacén de nonces con formato desconocido.");
    }
    for (const [k, e] of Object.entries(parsed.entries)) {
      if (/^[a-f0-9]{64}$/.test(k) && typeof e === "number") entries.set(k, e);
    }
  }

  function persist() {
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, entries: Object.fromEntries(entries) }), { mode: 0o600 });
    fs.renameSync(tmp, filePath);
  }

  return {
    has(key, t) {
      const exp = entries.get(key);
      return exp !== undefined && exp >= t;
    },
    add(key, exp, t) {
      for (const [k, e] of entries) if (e < t) entries.delete(k);
      if (entries.size >= maxEntries) return false;
      entries.set(key, exp);
      try {
        persist();
        return true;
      } catch {
        entries.delete(key);
        return false;
      }
    },
    size() { return entries.size; },
  };
}

export function createRequestVerifier(secret, { now = () => Date.now(), skewMs = 300_000, store = createMemoryNonceStore() } = {}) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("ZOLVI_SIGNER_EXECUTOR_SECRET debe tener al menos 32 caracteres.");
  }
  return function verifyRequest(rawBody, signature) {
    const expected = Buffer.from(signExecutorRequest(secret, rawBody), "hex");
    const given = Buffer.from(String(signature ?? ""), "hex");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, code: "BAD_SIGNATURE" };
    let parsed;
    try { parsed = JSON.parse(rawBody); } catch { return { ok: false, code: "BAD_JSON" }; }
    const t = now();
    if (typeof parsed.ts !== "number" || Math.abs(t - parsed.ts) > skewMs) return { ok: false, code: "STALE_REQUEST" };
    if (typeof parsed.nonce !== "string" || parsed.nonce.length < 16) return { ok: false, code: "BAD_NONCE" };
    const key = nonceKey(parsed.nonce);
    if (store.has(key, t)) return { ok: false, code: "REPLAY" };
    // Se registra ANTES de ejecutar: si no puede persistirse, no se ejecuta.
    if (!store.add(key, t + skewMs * 2, t)) return { ok: false, code: "NONCE_STORE_UNAVAILABLE" };
    return { ok: true, request: parsed };
  };
}
