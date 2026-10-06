// ─────────────────────────────────────────────────────────────────
// core/security/operational-authorization — grant-token.test.ts
//
// Grant firmado: ligadura exacta tenant + user + scope + entidad,
// expiración por inactividad y tope absoluto, integridad de firma y
// fail closed sin secreto.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  buildGrantPayload,
  grantCookieName,
  GRANT_POLICY,
  GrantSecretUnavailableError,
  pinFingerprint,
  resolveGrantKey,
  signGrant,
  verifyGrant,
  type GrantExpectation,
} from "./grant-token";
import type { GrantScope } from "./scopes";
import { TEST_AUTH_SECRET } from "./operational-authorization.test-fixtures";

const KEY = resolveGrantKey({ AUTH_SECRET: TEST_AUTH_SECRET });
const NOW = 1_800_000_000;

function issue(over: Partial<{ tenantId: string; userId: string; scope: GrantScope; entityId: string; pfp: string | null }> = {}) {
  const scope = over.scope ?? "SALE_EDIT";
  return signGrant(
    buildGrantPayload({
      tenantId: over.tenantId ?? "tenant-A",
      userId: over.userId ?? "user-A",
      scope,
      entityId: over.entityId ?? "entity-A",
      pinFingerprint: over.pfp !== undefined ? over.pfp : scope.endsWith("_DRAFT_OWNER") ? null : "fp-1",
      now: NOW,
    }),
    KEY,
  );
}

function expectation(over: Partial<GrantExpectation> = {}): GrantExpectation {
  return { tenantId: "tenant-A", userId: "user-A", scope: "SALE_EDIT", entityId: "entity-A", ...over };
}

describe("grant-token — ligadura y vigencia", () => {
  it("grant correcto verifica OK", () => {
    const r = verifyGrant(issue(), expectation(), KEY, NOW + 1);
    expect(r.ok).toBe(true);
  });

  it("(5) grant del tenant A no sirve en tenant B", () => {
    const r = verifyGrant(issue(), expectation({ tenantId: "tenant-B" }), KEY, NOW + 1);
    expect(r).toEqual({ ok: false, reason: "MISMATCH" });
  });

  it("(6) grant del user A no sirve para user B", () => {
    const r = verifyGrant(issue(), expectation({ userId: "user-B" }), KEY, NOW + 1);
    expect(r).toEqual({ ok: false, reason: "MISMATCH" });
  });

  it.each([
    ["PRODUCT_EDIT"],
    ["PURCHASE_EDIT"],
    ["SALE_EDIT"],
    ["CUSTOMER_EDIT"],
  ] as const)("(7-10) %s para entidad A no autoriza entidad B", (scope) => {
    const token = issue({ scope, entityId: "entity-A" });
    expect(verifyGrant(token, expectation({ scope, entityId: "entity-A" }), KEY, NOW + 1).ok).toBe(true);
    expect(verifyGrant(token, expectation({ scope, entityId: "entity-B" }), KEY, NOW + 1)).toEqual({
      ok: false,
      reason: "MISMATCH",
    });
  });

  it("no hay escalación entre scopes: PRODUCT_EDIT no vale como SALE_EDIT ni DRAFT_OWNER", () => {
    const token = issue({ scope: "PRODUCT_EDIT" });
    expect(verifyGrant(token, expectation({ scope: "SALE_EDIT" }), KEY, NOW + 1).ok).toBe(false);
    expect(verifyGrant(token, expectation({ scope: "SALE_DRAFT_OWNER" }), KEY, NOW + 1).ok).toBe(false);
  });

  it("(11) grant expirado por inactividad falla", () => {
    const idle = GRANT_POLICY.SALE_EDIT.idleSeconds;
    expect(verifyGrant(issue(), expectation(), KEY, NOW + idle - 1).ok).toBe(true);
    expect(verifyGrant(issue(), expectation(), KEY, NOW + idle)).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("PIN grant dura ~10 minutos de inactividad", () => {
    expect(GRANT_POLICY.PRODUCT_EDIT.idleSeconds).toBe(600);
    expect(GRANT_POLICY.CUSTOMER_EDIT.idleSeconds).toBe(600);
    expect(GRANT_POLICY.PURCHASE_EDIT.idleSeconds).toBe(600);
    expect(GRANT_POLICY.SALE_EDIT.idleSeconds).toBe(600);
  });

  it("renovación conserva oat y nunca supera el tope absoluto", () => {
    const max = GRANT_POLICY.SALE_EDIT.maxSeconds;
    const renewedAt = NOW + max - 60;
    const renewed = buildGrantPayload({
      tenantId: "tenant-A", userId: "user-A", scope: "SALE_EDIT", entityId: "entity-A",
      pinFingerprint: "fp-1", originalAuthAt: NOW, now: renewedAt,
    });
    expect(renewed.exp).toBe(NOW + max);
    const token = signGrant(renewed, KEY);
    expect(verifyGrant(token, expectation(), KEY, NOW + max)).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("firma alterada o payload manipulado → INVALID", () => {
    const token = issue();
    const [body, mac] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), uid: "user-B" }),
    ).toString("base64url");
    expect(verifyGrant(`${forgedBody}.${mac}`, expectation({ userId: "user-B" }), KEY, NOW + 1)).toEqual({
      ok: false,
      reason: "INVALID",
    });
    expect(verifyGrant(`${body}.AAAA`, expectation(), KEY, NOW + 1)).toEqual({ ok: false, reason: "INVALID" });
  });

  it("grant firmado con otra clave → INVALID", () => {
    const otherKey = resolveGrantKey({ AUTH_SECRET: "another-secret-value-for-tests-xyz" });
    expect(verifyGrant(issue(), expectation(), otherKey, NOW + 1)).toEqual({ ok: false, reason: "INVALID" });
  });

  it("sin token → MISSING", () => {
    expect(verifyGrant(undefined, expectation(), KEY, NOW)).toEqual({ ok: false, reason: "MISSING" });
  });

  it("PIN grant sin huella o DRAFT_OWNER con huella → INVALID (forma estricta)", () => {
    expect(verifyGrant(issue({ scope: "SALE_EDIT", pfp: null }), expectation(), KEY, NOW + 1).ok).toBe(false);
    expect(
      verifyGrant(issue({ scope: "SALE_DRAFT_OWNER", pfp: "fp" }), expectation({ scope: "SALE_DRAFT_OWNER" }), KEY, NOW + 1).ok,
    ).toBe(false);
  });

  it("fail closed: sin AUTH_SECRET no hay clave HMAC", () => {
    expect(() => resolveGrantKey({})).toThrow(GrantSecretUnavailableError);
    expect(() => resolveGrantKey({ AUTH_SECRET: "short" })).toThrow(GrantSecretUnavailableError);
  });

  it("cookie name ligado a scope + entidad y rechaza ids no seguros", () => {
    expect(grantCookieName("SALE_EDIT", "abc-123")).toBe("zoa_sale_edit_abc-123");
    expect(() => grantCookieName("SALE_EDIT", "a;b=c")).toThrow();
  });

  it("pinFingerprint no revela el hash", () => {
    const hash = "$2b$10$abcdefghijklmnopqrstuuJ8m6m8r2o8Xb5pWwqk9w7n6nYQeQx3e";
    const fp = pinFingerprint(hash);
    expect(fp).not.toContain("$2b$");
    expect(hash).not.toContain(fp);
  });
});
