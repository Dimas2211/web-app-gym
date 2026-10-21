// GYM-BOOKINGS 3A — alcance administrativo LIVE y traducción de rechazos de BD.
import { describe, expect, it } from "vitest";
import { gymAdminDbErrorMessage, gymAdminScope, scopeCoversLocation, uniqueViolationFields } from "./admin-support";

const ctx = (role: string, locationId: string | null = "loc-1") => ({
  effectiveUser: { id: "u", tenant_id: "t", location_id: locationId, role, auth_scope: "PLATFORM" as const },
  locationId,
});

describe("gymAdminScope (rol LIVE)", () => {
  it("super_admin → todo el tenant", () => {
    expect(gymAdminScope(ctx("super_admin", null))).toEqual({ ok: true, isGlobal: true, locationId: null });
  });
  it("branch_admin → solo su sucursal; sin sucursal → denegado", () => {
    expect(gymAdminScope(ctx("branch_admin"))).toEqual({ ok: true, isGlobal: false, locationId: "loc-1" });
    expect(gymAdminScope(ctx("branch_admin", null)).ok).toBe(false);
  });
  it.each(["reception", "trainer", "client", "desconocido"])("%s → sin administración GYM", (role) => {
    expect(gymAdminScope(ctx(role)).ok).toBe(false);
  });
  it("scopeCoversLocation: BA no cubre otra sede ni registros globales", () => {
    const ba = gymAdminScope(ctx("branch_admin"));
    const sa = gymAdminScope(ctx("super_admin", null));
    if (!ba.ok || !sa.ok) throw new Error("scope");
    expect(scopeCoversLocation(ba, "loc-1")).toBe(true);
    expect(scopeCoversLocation(ba, "loc-2")).toBe(false);
    expect(scopeCoversLocation(ba, null)).toBe(false);
    expect(scopeCoversLocation(sa, null)).toBe(true);
  });
});

describe("gymAdminDbErrorMessage / uniqueViolationFields", () => {
  it("traduce los tokens de los triggers de 2A", () => {
    expect(gymAdminDbErrorMessage(new Error("GYM_LOCATION_MISMATCH: x"))).toMatch(/sucursal/);
    expect(gymAdminDbErrorMessage(new Error("GYM_DEPENDENT_SESSIONS_CONFLICT: x"))).toMatch(/vigentes/);
    expect(gymAdminDbErrorMessage(new Error("GYM_TENANT_MISMATCH: x"))).toMatch(/organización/);
    expect(gymAdminDbErrorMessage(new Error("otro"))).toBeNull();
  });
  it("lee los campos del P2002", () => {
    expect(uniqueViolationFields({ code: "P2002", meta: { target: ["tenant_id", "code"] } })).toEqual(["tenant_id", "code"]);
    expect(uniqueViolationFields(new Error("x"))).toEqual([]);
  });
});
