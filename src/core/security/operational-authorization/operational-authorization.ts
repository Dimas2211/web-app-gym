// ─────────────────────────────────────────────────────────────────
// core/security/operational-authorization — operational-authorization.ts
//
// Motor central de la Autorización Operativa (Clave de Supervisor).
// Integra la verificación de clave (supervisor-pin.ts) con el grant
// firmado (grant-token.ts) transportado en cookie HttpOnly.
//
// Contrato de uso — SIEMPRE después de requireOperationalContext():
//
//   // 1. Autorizar (diálogo "Clave de supervisor"):
//   await authorizeWithSupervisorPin(context, "SALE_EDIT", saleId, pin);
//
//   // 2. Antes de CADA write protegido (server action / route handler):
//   const grant = await checkOperationalGrant(context, SALE_DRAFT_WRITE_SCOPES, saleId);
//   if (!grant.ok) return { error: grant.error };
//
//   // 3. Página de edición (Server Component, sin renovar cookie):
//   const grant = await checkOperationalGrant(context, [...], id, { renew: false });
//
// Identidad: tenant = context.tenantId y user = context.effectiveUser.id,
// ambos resueltos en servidor. Nada que venga del cliente (tenant_id,
// user_id, flags de UI) se usa como autoridad.
// ─────────────────────────────────────────────────────────────────

import { cookies } from "next/headers";
import type { PrismaClient } from "@prisma/client";
import {
  buildGrantPayload,
  GRANT_COOKIE_PREFIX,
  GRANT_POLICY,
  grantCookieName,
  isValidGrantEntityId,
  resolveGrantKey,
  signGrant,
  verifyGrant,
  GrantSecretUnavailableError,
  type GrantVerifyFailure,
} from "./grant-token";
import { getActivePinFingerprint, verifySupervisorPin } from "./supervisor-pin";
import { OPERATIONAL_AUTH_MESSAGES } from "./messages";
import {
  isPinGrantScope,
  type DraftOwnerScope,
  type GrantScope,
  type PinGrantScope,
  type PinOneShotScope,
} from "./scopes";

if (typeof window !== "undefined") {
  throw new Error("[operational-authorization] Módulo server-only.");
}

/** Subconjunto de OperationalContext que necesita el motor. */
export interface OperationalAuthContext {
  tenantId: string;
  client: PrismaClient;
  effectiveUser: { id: string };
}

export type OperationalAuthResult = { ok: true } | { ok: false; error: string };

export type GrantCheckResult =
  | { ok: true; scope: GrantScope }
  | { ok: false; error: string; reason: GrantVerifyFailure | "PIN_NOT_CONFIGURED" | "UNAVAILABLE" };

const PIN_ERROR_MESSAGES = {
  REQUIRED: OPERATIONAL_AUTH_MESSAGES.PIN_REQUIRED,
  NOT_CONFIGURED: OPERATIONAL_AUTH_MESSAGES.PIN_NOT_CONFIGURED,
  INVALID: OPERATIONAL_AUTH_MESSAGES.PIN_INVALID,
  LOCKED: OPERATIONAL_AUTH_MESSAGES.PIN_LOCKED,
} as const;

/** Máximo de grants de creador vivos por scope (acota el tamaño del header Cookie). */
const MAX_DRAFT_OWNER_GRANTS_PER_SCOPE = 5;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: Math.max(1, maxAgeSeconds),
  };
}

async function writeGrantCookie(
  ctx: OperationalAuthContext,
  scope: GrantScope,
  entityId: string,
  pinFp: string | null,
  originalAuthAt?: number,
): Promise<void> {
  const key = resolveGrantKey();
  const now = nowSeconds();
  const payload = buildGrantPayload({
    tenantId: ctx.tenantId,
    userId: ctx.effectiveUser.id,
    scope,
    entityId,
    pinFingerprint: pinFp,
    originalAuthAt,
    now,
  });
  const store = await cookies();
  store.set(grantCookieName(scope, entityId), signGrant(payload, key), cookieOptions(payload.exp - now));
}

/**
 * Verifica la Clave de Supervisor y, si es correcta, emite un grant
 * temporal para (tenant, user, scope, entidad).
 */
export async function authorizeWithSupervisorPin(
  ctx: OperationalAuthContext,
  scope: PinGrantScope,
  entityId: string,
  pin: string,
): Promise<OperationalAuthResult> {
  if (!isPinGrantScope(scope) || !isValidGrantEntityId(entityId)) {
    return { ok: false, error: OPERATIONAL_AUTH_MESSAGES.GRANT_MISSING };
  }
  try {
    resolveGrantKey(); // fail closed ANTES de consumir un intento de clave
  } catch (err) {
    if (err instanceof GrantSecretUnavailableError) {
      return { ok: false, error: OPERATIONAL_AUTH_MESSAGES.UNAVAILABLE };
    }
    throw err;
  }

  const result = await verifySupervisorPin(ctx.client, ctx.tenantId, pin);
  if (!result.ok) return { ok: false, error: PIN_ERROR_MESSAGES[result.code] };

  await writeGrantCookie(ctx, scope, entityId, result.fingerprint);
  return { ok: true };
}

/**
 * Operaciones de un solo uso (eliminar borrador, anular confirmada): la
 * clave se verifica en la misma request que ejecuta la operación. No se
 * emite grant reutilizable.
 */
export async function verifySupervisorPinForOperation(
  ctx: OperationalAuthContext,
  _scope: PinOneShotScope,
  pin: string,
): Promise<OperationalAuthResult> {
  const result = await verifySupervisorPin(ctx.client, ctx.tenantId, pin);
  if (!result.ok) return { ok: false, error: PIN_ERROR_MESSAGES[result.code] };
  return { ok: true };
}

/**
 * Emite el grant del creador de un borrador recién creado (sin clave).
 * Errores de emisión no deben romper la creación: el borrador queda y
 * el usuario podrá reabrirlo con clave.
 */
export async function issueDraftOwnerGrant(
  ctx: OperationalAuthContext,
  scope: DraftOwnerScope,
  entityId: string,
): Promise<void> {
  try {
    await pruneDraftOwnerGrants(scope);
    await writeGrantCookie(ctx, scope, entityId, null);
  } catch (err) {
    console.error("[operational-authorization] no se pudo emitir grant de borrador", {
      scope,
      name: err instanceof Error ? err.name : "unknown",
    });
  }
}

/** Conserva solo los grants de creador más recientes del scope (descarta por iat). */
async function pruneDraftOwnerGrants(scope: DraftOwnerScope): Promise<void> {
  const store = await cookies();
  const prefix = `${GRANT_COOKIE_PREFIX}${scope.toLowerCase()}_`;
  const owned = store
    .getAll()
    .filter((c) => c.name.startsWith(prefix))
    .map((c) => {
      let iat = 0;
      try {
        iat = Number(JSON.parse(Buffer.from(c.value.split(".")[0], "base64url").toString("utf8")).iat) || 0;
      } catch {
        // cookie ilegible → se descarta primero
      }
      return { name: c.name, iat };
    })
    .sort((a, b) => b.iat - a.iat);
  for (const stale of owned.slice(MAX_DRAFT_OWNER_GRANTS_PER_SCOPE - 1)) store.delete(stale.name);
}

/**
 * Comprueba que exista un grant válido para la entidad en alguno de los
 * scopes aceptados. Por defecto renueva la ventana de inactividad (solo
 * posible en Server Actions / Route Handlers; las páginas deben pasar
 * `renew: false`).
 */
export async function checkOperationalGrant(
  ctx: OperationalAuthContext,
  scopes: readonly GrantScope[],
  entityId: string | null | undefined,
  options: { renew?: boolean } = {},
): Promise<GrantCheckResult> {
  const renew = options.renew ?? true;
  if (!isValidGrantEntityId(entityId)) {
    return { ok: false, error: OPERATIONAL_AUTH_MESSAGES.GRANT_MISSING, reason: "MISSING" };
  }

  let key: Buffer;
  try {
    key = resolveGrantKey();
  } catch (err) {
    if (err instanceof GrantSecretUnavailableError) {
      return { ok: false, error: OPERATIONAL_AUTH_MESSAGES.UNAVAILABLE, reason: "UNAVAILABLE" };
    }
    throw err;
  }

  const store = await cookies();
  let sawExpired = false;
  let pinMissing = false;
  let activeFp: string | null | undefined; // lazy: solo se consulta si hay grant PIN

  for (const scope of scopes) {
    const token = store.get(grantCookieName(scope, entityId))?.value;
    const verdict = verifyGrant(
      token,
      { tenantId: ctx.tenantId, userId: ctx.effectiveUser.id, scope, entityId },
      key,
    );
    if (!verdict.ok) {
      if (verdict.reason === "EXPIRED") sawExpired = true;
      continue;
    }

    if (isPinGrantScope(scope)) {
      // La clave debe seguir configurada y ser la MISMA que emitió el grant.
      if (activeFp === undefined) activeFp = await getActivePinFingerprint(ctx.client, ctx.tenantId);
      if (!activeFp) {
        pinMissing = true;
        continue;
      }
      if (verdict.payload.pfp !== activeFp) {
        sawExpired = true;
        continue;
      }
    }

    // Ventana deslizante: se renueva solo cuando queda menos de la mitad
    // (evita reescribir la cookie —y re-renderizar la página— en cada write).
    const remaining = verdict.payload.exp - nowSeconds();
    if (renew && remaining < GRANT_POLICY[scope].idleSeconds / 2) {
      try {
        await writeGrantCookie(ctx, scope, entityId, verdict.payload.pfp, verdict.payload.oat);
      } catch {
        // Renovación best-effort: el grant actual sigue siendo válido.
      }
    }
    return { ok: true, scope };
  }

  if (pinMissing) {
    return { ok: false, error: OPERATIONAL_AUTH_MESSAGES.PIN_NOT_CONFIGURED, reason: "PIN_NOT_CONFIGURED" };
  }
  if (sawExpired) {
    return { ok: false, error: OPERATIONAL_AUTH_MESSAGES.GRANT_EXPIRED, reason: "EXPIRED" };
  }
  return { ok: false, error: OPERATIONAL_AUTH_MESSAGES.GRANT_MISSING, reason: "MISSING" };
}

/** Elimina los grants de una entidad (ej. tras eliminar/descartar el borrador). */
export async function revokeOperationalGrants(
  scopes: readonly GrantScope[],
  entityId: string,
): Promise<void> {
  if (!isValidGrantEntityId(entityId)) return;
  try {
    const store = await cookies();
    for (const scope of scopes) store.delete(grantCookieName(scope, entityId));
  } catch {
    // best-effort
  }
}
