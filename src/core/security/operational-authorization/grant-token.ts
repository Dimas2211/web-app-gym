// ─────────────────────────────────────────────────────────────────
// core/security/operational-authorization — grant-token.ts
//
// Grant temporal firmado (HMAC-SHA256) de la Autorización Operativa.
// Lógica pura (sin Next.js, sin DB) para poder probarla aislada.
//
// Formato: base64url(JSON payload) + "." + base64url(HMAC(payload)).
// El grant viaja en una cookie HttpOnly por (scope, entidad); el
// cliente no puede leerlo ni fabricarlo. Ligado a:
//   tid  tenant efectivo (resuelto en servidor)
//   uid  usuario que introdujo la clave / creó el borrador
//   sc   scope (operación)
//   eid  entidad concreta (producto, cliente, compra, venta)
//   pfp  huella del hash de la Clave de Supervisor vigente (solo grants
//        PIN) → cambiar/restablecer la clave revoca los grants emitidos
//   exp  expiración por inactividad; se renueva en cada uso válido
//   oat  instante de la autorización original; tope absoluto de vida
//
// Clave HMAC derivada de AUTH_SECRET (NEXTAUTH_SECRET como fallback de
// nombre) con separación de dominio — nunca la clave cruda. Sin secreto
// configurado: fail closed.
// ─────────────────────────────────────────────────────────────────

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isGrantScope, isPinGrantScope, type GrantScope } from "./scopes";

if (typeof window !== "undefined") {
  throw new Error("[operational-authorization] Módulo server-only.");
}

export const GRANT_COOKIE_PREFIX = "zoa_";

/** Política de vida por scope, en segundos. */
export const GRANT_POLICY: Record<GrantScope, { idleSeconds: number; maxSeconds: number }> = {
  // Grants por Clave de Supervisor: ~10 min de inactividad, tope 60 min.
  PRODUCT_EDIT: { idleSeconds: 10 * 60, maxSeconds: 60 * 60 },
  CUSTOMER_EDIT: { idleSeconds: 10 * 60, maxSeconds: 60 * 60 },
  PURCHASE_EDIT: { idleSeconds: 10 * 60, maxSeconds: 60 * 60 },
  SALE_EDIT: { idleSeconds: 10 * 60, maxSeconds: 60 * 60 },
  // Grants del creador del borrador: captura normal sin clave.
  PURCHASE_DRAFT_OWNER: { idleSeconds: 60 * 60, maxSeconds: 12 * 60 * 60 },
  SALE_DRAFT_OWNER: { idleSeconds: 60 * 60, maxSeconds: 12 * 60 * 60 },
};

export interface OperationalGrantPayload {
  v: 1;
  tid: string;
  uid: string;
  sc: GrantScope;
  eid: string;
  pfp: string | null;
  iat: number;
  exp: number;
  oat: number;
}

export type GrantVerifyFailure = "MISSING" | "INVALID" | "EXPIRED" | "MISMATCH";

export type GrantVerifyResult =
  | { ok: true; payload: OperationalGrantPayload }
  | { ok: false; reason: GrantVerifyFailure };

export interface GrantExpectation {
  tenantId: string;
  userId: string;
  scope: GrantScope;
  entityId: string;
}

const ENTITY_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidGrantEntityId(entityId: unknown): entityId is string {
  return typeof entityId === "string" && ENTITY_ID_RE.test(entityId);
}

/** Nombre de cookie del grant para (scope, entidad). Lanza si la entidad no es un id válido. */
export function grantCookieName(scope: GrantScope, entityId: string): string {
  if (!isValidGrantEntityId(entityId)) {
    throw new Error("[operational-authorization] entity_id inválido para grant.");
  }
  return `${GRANT_COOKIE_PREFIX}${scope.toLowerCase()}_${entityId}`;
}

export class GrantSecretUnavailableError extends Error {
  constructor() {
    super("[operational-authorization] AUTH_SECRET no configurado — grants deshabilitados.");
    this.name = "GrantSecretUnavailableError";
  }
}

/** Clave HMAC derivada (separación de dominio). Fail closed si no hay secreto. */
export function resolveGrantKey(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Buffer {
  const raw = env.AUTH_SECRET || env.NEXTAUTH_SECRET;
  if (!raw || raw.length < 16) throw new GrantSecretUnavailableError();
  return createHmac("sha256", raw).update("zolvi:operational-authorization:v1").digest();
}

/** Huella corta y no reversible del hash bcrypt vigente (cambia con cada nueva clave por el salt). */
export function pinFingerprint(pinHash: string): string {
  return createHash("sha256").update(pinHash).digest("base64url").slice(0, 22);
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function sign(body: string, key: Buffer): string {
  return createHmac("sha256", key).update(body).digest("base64url");
}

export function signGrant(payload: OperationalGrantPayload, key: Buffer): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body, key)}`;
}

export interface IssueGrantInput {
  tenantId: string;
  userId: string;
  scope: GrantScope;
  entityId: string;
  pinFingerprint: string | null;
  /** Instante de autorización original (renovaciones lo conservan). Default: now. */
  originalAuthAt?: number;
  now?: number;
}

/** Construye el payload con expiración = min(now + idle, oat + max). */
export function buildGrantPayload(input: IssueGrantInput): OperationalGrantPayload {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const oat = input.originalAuthAt ?? now;
  const policy = GRANT_POLICY[input.scope];
  return {
    v: 1,
    tid: input.tenantId,
    uid: input.userId,
    sc: input.scope,
    eid: input.entityId,
    pfp: input.pinFingerprint,
    iat: now,
    exp: Math.min(now + policy.idleSeconds, oat + policy.maxSeconds),
    oat,
  };
}

function parsePayload(raw: unknown): OperationalGrantPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.v !== 1) return null;
  if (typeof p.tid !== "string" || typeof p.uid !== "string") return null;
  if (!isGrantScope(p.sc) || !isValidGrantEntityId(p.eid)) return null;
  if (p.pfp !== null && typeof p.pfp !== "string") return null;
  if (typeof p.iat !== "number" || typeof p.exp !== "number" || typeof p.oat !== "number") return null;
  // Un grant PIN siempre lleva huella; uno de borrador nunca.
  if (isPinGrantScope(p.sc) !== (typeof p.pfp === "string")) return null;
  return p as unknown as OperationalGrantPayload;
}

/**
 * Verifica firma, forma, vigencia y ligadura exacta a tenant + user +
 * scope + entidad. La huella de la clave (pfp) la valida el caller
 * contra la configuración vigente en la Runtime DB.
 */
export function verifyGrant(
  token: string | undefined | null,
  expected: GrantExpectation,
  key: Buffer,
  now: number = Math.floor(Date.now() / 1000),
): GrantVerifyResult {
  if (!token) return { ok: false, reason: "MISSING" };

  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return { ok: false, reason: "INVALID" };
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  const expectedMac = Buffer.from(sign(body, key));
  const givenMac = Buffer.from(mac);
  if (expectedMac.length !== givenMac.length || !timingSafeEqual(expectedMac, givenMac)) {
    return { ok: false, reason: "INVALID" };
  }

  let payload: OperationalGrantPayload | null;
  try {
    payload = parsePayload(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  } catch {
    payload = null;
  }
  if (!payload) return { ok: false, reason: "INVALID" };

  if (
    payload.tid !== expected.tenantId ||
    payload.uid !== expected.userId ||
    payload.sc !== expected.scope ||
    payload.eid !== expected.entityId
  ) {
    return { ok: false, reason: "MISMATCH" };
  }

  const policy = GRANT_POLICY[payload.sc];
  if (now >= payload.exp || now >= payload.oat + policy.maxSeconds) {
    return { ok: false, reason: "EXPIRED" };
  }

  return { ok: true, payload };
}
