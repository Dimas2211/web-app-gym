// ─────────────────────────────────────────────────────────────────
// commerce/cash — cash-register-admin.actions.test.ts
//
// Boundary de las server actions de administración de cajas con el
// requireOperationalContext REAL:
//   - tenant/location salen del contexto efectivo, nunca del browser;
//   - la DB es context.client (Prisma global explota si se toca);
//   - code/name se normalizan (trim + uppercase) antes del service;
//   - Support Session READ_ONLY y módulo commerce.cash deshabilitado
//     bloquean antes de ejecutar cualquier write.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  class FakeCommercialEnforcementError extends Error {
    httpStatus = 403;
    constructor(public userMessage: string) {
      super(userMessage);
    }
  }
  return {
    FakeCommercialEnforcementError,
    runtime: { __marker: "RUNTIME_CLIENT_DB" },
    commercialCtx: { mode: "MANAGED", tenantId: "tenant-A" },
    readOnly: false,
    moduleEnabled: true,
    modulesChecked: [] as string[],
    svc: {
      createCashRegister: vi.fn(),
      updateCashRegister: vi.fn(),
      setCashRegisterActive: vi.fn(),
    },
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, { get() { throw new Error("Prisma global NO debe usarse"); } }),
}));
vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({
    id: "user-A", tenant_id: "tenant-A", location_id: "loc-1", role: "super_admin", auth_scope: "RUNTIME_CLIENT",
  })),
}));
vi.mock("@/lib/location/active-location", () => ({ getEffectiveLocationId: vi.fn(async () => "loc-1") }));
vi.mock("@/modules/platform/runtime/effective-tenant-context", () => ({
  resolveEffectiveTenantContext: vi.fn(async () => ({
    context: {
      tenantId: "tenant-A",
      client: h.runtime,
      runtime: h.readOnly ? { readOnly: true } : null,
      locationId: "loc-1",
      runtimeMode: h.readOnly ? "SUPPORT_RUNTIME" : "RUNTIME_CLIENT",
      readOnly: h.readOnly,
      effectiveRole: "super_admin",
    },
    dispose: vi.fn(async () => {}),
  })),
}));
vi.mock("@/modules/platform/runtime/commercial-enforcement", () => ({
  resolveCommercialEnforcementContext: vi.fn(async () => h.commercialCtx),
  assertOrganizationModule: vi.fn((_ctx: unknown, module: string) => {
    h.modulesChecked.push(module);
    if (!h.moduleEnabled) throw new h.FakeCommercialEnforcementError("El módulo de Caja no está habilitado en tu plan.");
  }),
  CommercialEnforcementError: h.FakeCommercialEnforcementError,
}));
vi.mock("@/modules/platform/lib/provisioning/resolve-optional-gym-for-tenant", () => ({
  resolveOptionalGymForTenant: vi.fn(async () => null),
}));
vi.mock("../services/cash-register-admin.service", () => h.svc);

import { RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { createCashRegisterAction } from "./create-cash-register.action";
import { updateCashRegisterAction } from "./update-cash-register.action";
import { setCashRegisterActiveAction } from "./set-cash-register-active.action";

const REG_ID = "11111111-1111-4111-8111-111111111111";
const OK = { ok: true, data: { id: REG_ID, code: "CAJA-01", name: "Caja principal", is_active: true } };
const SCOPE = { tenant_id: "tenant-A", location_id: "loc-1", user_id: "user-A" };

beforeEach(() => {
  h.readOnly = false;
  h.moduleEnabled = true;
  h.modulesChecked.length = 0;
  for (const fn of Object.values(h.svc)) fn.mockReset().mockResolvedValue(OK);
});

describe("createCashRegisterAction", () => {
  it("(2/5) tenant_id/location_id/is_active del browser se ignoran; scope del servidor y context.client", async () => {
    const r = await createCashRegisterAction({
      code: "  caja-01 ",
      name: "  Caja principal ",
      tenant_id: "tenant-EVIL",
      location_id: "loc-EVIL",
      is_active: false,
    } as never);
    expect(r).toEqual(OK);
    expect(h.svc.createCashRegister).toHaveBeenCalledWith(
      SCOPE,
      { code: "CAJA-01", name: "Caja principal" },
      h.runtime,
      h.commercialCtx,
    );
    expect(h.modulesChecked).toEqual(["commerce.cash"]);
  });

  it("código vacío o con caracteres inválidos → error, sin llamar al service", async () => {
    expect((await createCashRegisterAction({ code: "   ", name: "Caja" })).ok).toBe(false);
    expect((await createCashRegisterAction({ code: "CAJA 01", name: "Caja" })).ok).toBe(false);
    expect((await createCashRegisterAction({ code: "CAJA-01", name: "  " })).ok).toBe(false);
    expect((await createCashRegisterAction({ code: "X".repeat(21), name: "Caja" })).ok).toBe(false);
    expect(h.svc.createCashRegister).not.toHaveBeenCalled();
  });
});

describe("updateCashRegisterAction / setCashRegisterActiveAction", () => {
  it("edición: normaliza y usa scope del servidor + context.client", async () => {
    await updateCashRegisterAction({ cash_register_id: REG_ID, code: "caja-10", name: " Mostrador ", location_id: "x" } as never);
    expect(h.svc.updateCashRegister).toHaveBeenCalledWith(
      SCOPE,
      { cash_register_id: REG_ID, code: "CAJA-10", name: "Mostrador" },
      h.runtime,
    );
  });

  it("activar/desactivar: scope del servidor, context.client y commercialContext", async () => {
    await setCashRegisterActiveAction({ cash_register_id: REG_ID, is_active: false, tenant_id: "x" } as never);
    expect(h.svc.setCashRegisterActive).toHaveBeenCalledWith(
      SCOPE,
      { cash_register_id: REG_ID, is_active: false },
      h.runtime,
      h.commercialCtx,
    );
  });

  it("id no UUID → error sin service", async () => {
    expect((await setCashRegisterActiveAction({ cash_register_id: "no-uuid", is_active: true })).ok).toBe(false);
    expect((await updateCashRegisterAction({ cash_register_id: "no-uuid", code: "A", name: "B" })).ok).toBe(false);
    expect(h.svc.setCashRegisterActive).not.toHaveBeenCalled();
    expect(h.svc.updateCashRegister).not.toHaveBeenCalled();
  });
});

describe("bloqueos de contexto operacional", () => {
  const all = [
    ["createCashRegisterAction", () => createCashRegisterAction({ code: "CAJA-01", name: "Caja" })],
    ["updateCashRegisterAction", () => updateCashRegisterAction({ cash_register_id: REG_ID, code: "CAJA-01", name: "Caja" })],
    ["setCashRegisterActiveAction", () => setCashRegisterActiveAction({ cash_register_id: REG_ID, is_active: false })],
  ] as const;

  it.each(all)("(6) Support Session READ_ONLY bloquea %s", async (_n, run) => {
    h.readOnly = true;
    expect(await run()).toEqual({ ok: false, error: RUNTIME_READONLY_MESSAGE });
    for (const fn of Object.values(h.svc)) expect(fn).not.toHaveBeenCalled();
  });

  it.each(all)("(7) módulo commerce.cash deshabilitado bloquea %s", async (_n, run) => {
    h.moduleEnabled = false;
    expect(await run()).toEqual({ ok: false, error: "El módulo de Caja no está habilitado en tu plan." });
    for (const fn of Object.values(h.svc)) expect(fn).not.toHaveBeenCalled();
  });
});
