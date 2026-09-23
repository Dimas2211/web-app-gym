// ─────────────────────────────────────────────────────────────────
// users — actions.role-escalation.test.ts
//
// FASE VI-D4 — ETAPA H. Certifica anti-escalación de privilegios con el
// ROL LIVE (context.effectiveUser.role), no el rol stale del JWT:
//
//   - createUserAction ya bloqueaba branch_admin -> super_admin/branch_admin.
//   - updateUserAction NO tenía el mismo bloqueo (hallazgo VI-D4): un
//     branch_admin podía editar un usuario que sí puede gestionar (ej.
//     reception, permitido por canManageUser) y escalarle el rol a
//     super_admin vía el campo `role` del formulario de edición. Cerrado
//     aquí reusando BRANCH_ADMIN_ASSIGNABLE_ROLES — misma fuente de
//     política que createUserAction, sin inventar una regla nueva.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u-branch-admin", tenant_id: "tenant-1", location_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", role: "branch_admin" })),
  getSessionOrRedirect: vi.fn(async () => ({ id: "u-branch-admin", tenant_id: "tenant-1", location_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", role: "branch_admin" })),
  // canManageUser real: branch_admin puede gestionar reception de SU branch
  // (no tiene canManageStaff), pero no a otro branch_admin/super_admin.
  canManageUser: vi.fn((sessionUser: { location_id: string | null }, target: { branch_id: string; role: string }) => {
    if (sessionUser.location_id !== target.branch_id) return false;
    return target.role === "reception" || target.role === "trainer";
  }),
}));

const {
  createCoreUserSpy,
  updateCoreUserSpy,
  requireOperationalContextMock,
  disposeMock,
  FakeOperationalContextError,
} = vi.hoisted(() => {
  class FakeOperationalContextError extends Error {
    code: string;
    httpStatus: number;
    userMessage: string;
    constructor(code: string, userMessage: string, httpStatus: number) {
      super(userMessage);
      this.code = code;
      this.httpStatus = httpStatus;
      this.userMessage = userMessage;
    }
  }
  return {
    createCoreUserSpy: vi.fn(),
    updateCoreUserSpy: vi.fn(),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("@/core/modules/users/actions", () => ({
  createCoreUser: createCoreUserSpy,
  updateCoreUser: updateCoreUserSpy,
  toggleCoreUserStatus: vi.fn(),
}));

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("@/lib/utils/operational-codes", () => ({
  suggestNextStaffCode: vi.fn(async () => "A0001"),
  generateQrToken: vi.fn(() => "qr-token"),
}));

import { createUserAction, updateUserAction } from "./actions";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

function fakeHandle(overrides: Partial<{ role: string; locationId: string | null; client: unknown }> = {}) {
  return {
    context: {
      effectiveUser: {
        id: "u-branch-admin",
        role: overrides.role ?? "branch_admin",
        tenant_id: "tenant-1",
        location_id: overrides.locationId ?? "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      },
      tenantId: "tenant-1",
      client: overrides.client ?? {
        user: { findFirst: vi.fn().mockResolvedValue({ id: "target-1", role: "reception", branch_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", trainer_profile: null }) },
        gym: { findUnique: vi.fn().mockResolvedValue(null) },
      },
      commercialContext: { organizationId: null },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  createCoreUserSpy.mockReset();
  updateCoreUserSpy.mockReset();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
});

describe("createUserAction — anti-escalación con rol LIVE", () => {
  it("branch_admin (rol LIVE) intenta crear super_admin -> denegado, createCoreUser NUNCA se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    const result = await createUserAction(undefined, fd({
      email: "nuevo@test.com", first_name: "Test", last_name: "User",
      role: "super_admin", branch_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", password: "synthetic-pass-123",
    }));

    expect(result?.error).toBeTruthy();
    expect(createCoreUserSpy).not.toHaveBeenCalled();
  });

  it("branch_admin (rol LIVE) crea reception en SU sucursal -> permitido", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());
    createCoreUserSpy.mockResolvedValue({ success: true, id: "new-user-1" });

    await createUserAction(undefined, fd({
      email: "nuevo@test.com", first_name: "Test", last_name: "User",
      role: "reception", branch_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", password: "synthetic-pass-123",
    }));

    expect(createCoreUserSpy).toHaveBeenCalled();
  });

  it("branch_admin intenta crear en OTRA sucursal -> denegado", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    const result = await createUserAction(undefined, fd({
      email: "nuevo@test.com", first_name: "Test", last_name: "User",
      role: "reception", branch_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", password: "synthetic-pass-123",
    }));

    expect(result?.error).toBeTruthy();
    expect(createCoreUserSpy).not.toHaveBeenCalled();
  });

  it("tenant SIEMPRE viene de context.tenantId (servidor), nunca de un campo del form", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ role: "super_admin", locationId: null }));
    createCoreUserSpy.mockResolvedValue({ success: true, id: "new-user-1" });

    await createUserAction(undefined, fd({
      email: "nuevo@test.com", first_name: "Test", last_name: "User",
      role: "reception", branch_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", password: "synthetic-pass-123",
    }));

    expect(createCoreUserSpy).toHaveBeenCalledWith(
      "tenant-1", // context.tenantId — el form no tiene ni podría tener un campo tenant_id
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});

describe("updateUserAction — anti-escalación con rol LIVE (hallazgo VI-D4, antes ausente)", () => {
  it("branch_admin edita un target reception y intenta escalarlo a super_admin -> denegado, updateCoreUser NUNCA se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    const result = await updateUserAction(undefined, fd({
      id: "target-1", email: "reception@test.com", first_name: "Reception", last_name: "Target",
      role: "super_admin", branch_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    }));

    expect(result?.error).toBeTruthy();
    expect(updateCoreUserSpy).not.toHaveBeenCalled();
  });

  it("branch_admin edita un target reception y intenta escalarlo a branch_admin -> denegado", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    const result = await updateUserAction(undefined, fd({
      id: "target-1", email: "reception@test.com", first_name: "Reception", last_name: "Target",
      role: "branch_admin", branch_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    }));

    expect(result?.error).toBeTruthy();
    expect(updateCoreUserSpy).not.toHaveBeenCalled();
  });

  it("branch_admin edita un target reception manteniéndolo reception -> permitido", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());
    updateCoreUserSpy.mockResolvedValue({ success: true, id: "target-1", previousRole: "reception", newRole: "reception" });

    const result = await updateUserAction(undefined, fd({
      id: "target-1", email: "reception@test.com", first_name: "Reception", last_name: "Target",
      role: "reception", branch_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    }));

    expect(result).toBeUndefined();
    expect(updateCoreUserSpy).toHaveBeenCalled();
  });

  it("branch_admin intenta reasignar el target a OTRA sucursal -> denegado", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    const result = await updateUserAction(undefined, fd({
      id: "target-1", email: "reception@test.com", first_name: "Reception", last_name: "Target",
      role: "reception", branch_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    }));

    expect(result?.error).toBeTruthy();
    expect(updateCoreUserSpy).not.toHaveBeenCalled();
  });
});
