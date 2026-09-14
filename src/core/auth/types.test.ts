// ─────────────────────────────────────────────────────────────────
// core/auth — types.test.ts
//
// FASE VI-B — certifica isAuthScope() (type guard de frontera) y
// toCoreSessionUser() (normalización fail-closed de auth_scope).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { isAuthScope, toCoreSessionUser, type GymSessionUser } from "./types";

describe("isAuthScope", () => {
  it("acepta PLATFORM y RUNTIME_CLIENT", () => {
    expect(isAuthScope("PLATFORM")).toBe(true);
    expect(isAuthScope("RUNTIME_CLIENT")).toBe(true);
  });

  it("rechaza undefined, null, strings arbitrarios y otros tipos — fail closed", () => {
    expect(isAuthScope(undefined)).toBe(false);
    expect(isAuthScope(null)).toBe(false);
    expect(isAuthScope("platform")).toBe(false); // case-sensitive
    expect(isAuthScope("SUPER_ADMIN")).toBe(false);
    expect(isAuthScope(123)).toBe(false);
    expect(isAuthScope({})).toBe(false);
  });
});

describe("toCoreSessionUser — normalización de auth_scope", () => {
  const base: Omit<GymSessionUser, "auth_scope"> = {
    id: "u1",
    name: "Test User",
    email: "test@example.com",
    role: "super_admin",
    tenant_id: "t1",
    location_id: null,
  };

  it("auth_scope válido (PLATFORM) se preserva", () => {
    const result = toCoreSessionUser({ ...base, auth_scope: "PLATFORM" });
    expect(result.auth_scope).toBe("PLATFORM");
  });

  it("auth_scope ausente (sesión pre-VI-B) se normaliza a undefined", () => {
    const result = toCoreSessionUser({ ...base });
    expect(result.auth_scope).toBeUndefined();
  });

  it("auth_scope corrupto/no reconocido se normaliza a undefined", () => {
    const result = toCoreSessionUser({ ...base, auth_scope: "garbage" });
    expect(result.auth_scope).toBeUndefined();
  });
});
