// ─────────────────────────────────────────────────────────────────
// core/permissions — commerce-access.test.ts
//
// Política de operación de Commerce (ventas/caja) separada de la
// administración (canManageStaff). Casos 1-3, 9-10, 13, 18 de la
// microfase de permisos operativos de recepción.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  session: null as null | { user: Record<string, unknown> },
}));

vi.mock("@/lib/auth/auth", () => ({ auth: vi.fn(async () => h.session) }));
vi.mock("@/modules/platform/runtime/runtime-organization-access-gate", () => ({
  enforceRuntimeOrganizationAccess: vi.fn(async () => {}),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));

import {
  canAdministerCommerce,
  canOperateCommerce,
  evaluateCommerceOperatorAccess,
  COMMERCE_ACCESS_MESSAGES,
} from "./commerce-access";
import { getCapabilities } from "./role-capabilities";
import { requireAdmin, requireCommerceOperator } from "@/lib/permissions/guards";

describe("canOperateCommerce — matriz de roles", () => {
  it.each([
    ["super_admin", true],
    ["branch_admin", true],
    ["reception", true],
    ["trainer", false],
    ["client", false],
    ["desconocido", false],
    ["", false],
  ])("%s → %s", (role, expected) => {
    expect(canOperateCommerce(role)).toBe(expected);
  });
});

describe("canAdministerCommerce — reception NO administra", () => {
  it.each([
    ["super_admin", true],
    ["branch_admin", true],
    ["reception", false],
    ["trainer", false],
    ["client", false],
  ])("%s → %s", (role, expected) => {
    expect(canAdministerCommerce(role)).toBe(expected);
  });

  it("operar Commerce no amplía gestión de personal, sucursales ni reportes de reception", () => {
    const caps = getCapabilities("reception");
    expect(caps.canOperateCommerce).toBe(true);
    expect(caps.canManageStaff).toBe(false);
    expect(caps.canManageLocations).toBe(false);
    expect(caps.isGlobal).toBe(false);
    expect(caps.canViewReports).toBe(false);
  });
});

describe("evaluateCommerceOperatorAccess — alcance de sucursal", () => {
  it("reception con sucursal fija → permitido", () => {
    expect(evaluateCommerceOperatorAccess({ role: "reception", locationId: "loc-1" })).toEqual({ ok: true });
  });

  it("reception SIN sucursal fija → denegado (no elige sucursal por cookie)", () => {
    const r = evaluateCommerceOperatorAccess({ role: "reception", locationId: null });
    expect(r).toMatchObject({ ok: false, reason: "LOCATION_REQUIRED" });
  });

  it("branch_admin sin sucursal fija → denegado", () => {
    expect(evaluateCommerceOperatorAccess({ role: "branch_admin", locationId: undefined }).ok).toBe(false);
  });

  it("super_admin (global) sin sucursal fija → permitido (usa selector validado)", () => {
    expect(evaluateCommerceOperatorAccess({ role: "super_admin", locationId: null }).ok).toBe(true);
  });

  it("trainer/client con sucursal → denegados por rol", () => {
    for (const role of ["trainer", "client"]) {
      expect(evaluateCommerceOperatorAccess({ role, locationId: "loc-1" })).toEqual({
        ok: false,
        reason: "ROLE",
        message: COMMERCE_ACCESS_MESSAGES.ROLE,
      });
    }
  });
});

describe("requireCommerceOperator — puerta de páginas (JWT)", () => {
  beforeEach(() => {
    h.session = null;
  });

  function as(role: string, location_id: string | null) {
    h.session = { user: { id: "u1", role, tenant_id: "tenant-A", location_id, auth_scope: "PLATFORM" } };
  }

  it("reception entra (y requireAdmin la sigue rechazando)", async () => {
    as("reception", "loc-1");
    await expect(requireCommerceOperator()).resolves.toMatchObject({ role: "reception" });
    await expect(requireAdmin()).rejects.toMatchObject({ url: "/dashboard" });
  });

  it.each(["trainer", "client", "otro"])("%s → redirect /dashboard", async (role) => {
    as(role, "loc-1");
    await expect(requireCommerceOperator()).rejects.toMatchObject({ url: "/dashboard" });
  });

  it("reception sin sucursal → redirect /dashboard", async () => {
    as("reception", null);
    await expect(requireCommerceOperator()).rejects.toMatchObject({ url: "/dashboard" });
  });

  it("super_admin y branch_admin conservan acceso", async () => {
    as("super_admin", null);
    await expect(requireCommerceOperator()).resolves.toBeDefined();
    as("branch_admin", "loc-1");
    await expect(requireCommerceOperator()).resolves.toBeDefined();
  });

  it("sin sesión → /login", async () => {
    await expect(requireCommerceOperator()).rejects.toMatchObject({ url: "/login" });
  });
});
