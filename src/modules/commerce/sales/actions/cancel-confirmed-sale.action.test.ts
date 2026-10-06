// ─────────────────────────────────────────────────────────────────
// commerce/sales — cancel-confirmed-sale.action.test.ts
//
// (22) La anulación de venta CONFIRMED usa exactamente el scope de un
// solo uso SALE_CANCEL_CONFIRMED (nunca SALE_DELETE_DRAFT ni un grant
// SALE_EDIT), exige contexto operacional con write=true sobre
// commerce.sales y ejecuta el service contra context.client.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));
vi.mock("@/lib/location/active-location", () => ({ getEffectiveLocationId: vi.fn(async () => "loc-1") }));

const h = vi.hoisted(() => ({
  verifyPin: vi.fn(),
  checkGrant: vi.fn(),
  authorizeWithPin: vi.fn(),
  cancelConfirmedSale: vi.fn(),
  cancelDraftSale: vi.fn(),
  discardDraftSale: vi.fn(),
  requireOperationalContext: vi.fn(),
}));

vi.mock("@/core/security/operational-authorization/operational-authorization", () => ({
  verifySupervisorPinForOperation: h.verifyPin,
  checkOperationalGrant: h.checkGrant,
  authorizeWithSupervisorPin: h.authorizeWithPin,
}));
vi.mock("../services/sale.service", () => ({
  cancelConfirmedSale: h.cancelConfirmedSale,
  cancelDraftSale: h.cancelDraftSale,
  discardDraftSale: h.discardDraftSale,
}));
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: h.requireOperationalContext,
  OperationalContextError: class extends Error {
    userMessage = "ctx error";
  },
}));

import { cancelConfirmedSaleAction } from "./cancel-confirmed-sale.action";
import { OPERATIONAL_SCOPES, PIN_ONE_SHOT_SCOPES, PIN_GRANT_SCOPES } from "@/core/security/operational-authorization/scopes";

const RUNTIME = { __marker: "RUNTIME_CLIENT_DB" };

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset();
  h.requireOperationalContext.mockResolvedValue({
    context: { tenantId: "tenant-1", locationId: "loc-1", client: RUNTIME, effectiveUser: { id: "u1", role: "super_admin" } },
    dispose: vi.fn(async () => {}),
  });
  h.verifyPin.mockResolvedValue({ ok: true });
  h.cancelConfirmedSale.mockResolvedValue({ ok: true });
});

describe("(22) cancelConfirmedSaleAction — scope SALE_CANCEL_CONFIRMED", () => {
  it("SALE_CANCEL_CONFIRMED es de un solo uso (no emite grant)", () => {
    expect(OPERATIONAL_SCOPES.SALE_CANCEL_CONFIRMED).toBe("SALE_CANCEL_CONFIRMED");
    expect(PIN_ONE_SHOT_SCOPES).toContain("SALE_CANCEL_CONFIRMED");
    expect(PIN_GRANT_SCOPES as readonly string[]).not.toContain("SALE_CANCEL_CONFIRMED");
  });

  it("verifica la clave con SALE_CANCEL_CONFIRMED y ningún otro mecanismo de autorización", async () => {
    const r = await cancelConfirmedSaleAction(undefined, form({ sale_id: "sale-1", supervisor_pin: "123456" }));
    expect(r).toEqual({ ok: true });
    expect(h.requireOperationalContext).toHaveBeenCalledWith(expect.anything(), { module: "commerce.sales", write: true });
    expect(h.verifyPin).toHaveBeenCalledTimes(1);
    expect(h.verifyPin.mock.calls[0][1]).toBe("SALE_CANCEL_CONFIRMED");
    expect(h.verifyPin.mock.calls[0][2]).toBe("123456");
    expect(h.checkGrant).not.toHaveBeenCalled();
    expect(h.authorizeWithPin).not.toHaveBeenCalled();
    expect(h.cancelConfirmedSale).toHaveBeenCalledWith("sale-1", "tenant-1", "loc-1", "u1", RUNTIME);
    expect(h.cancelDraftSale).not.toHaveBeenCalled();
    expect(h.discardDraftSale).not.toHaveBeenCalled();
  });

  it("clave rechazada → el service nunca se ejecuta", async () => {
    h.verifyPin.mockResolvedValue({ ok: false, error: "Clave incorrecta." });
    const r = await cancelConfirmedSaleAction(undefined, form({ sale_id: "sale-1", supervisor_pin: "x" }));
    expect(r).toEqual({ ok: false, error: "Clave incorrecta." });
    expect(h.cancelConfirmedSale).not.toHaveBeenCalled();
  });

  it("sin sale_id no verifica clave ni ejecuta nada", async () => {
    const r = await cancelConfirmedSaleAction(undefined, form({ supervisor_pin: "123456" }));
    expect(r?.ok).toBe(false);
    expect(h.verifyPin).not.toHaveBeenCalled();
    expect(h.cancelConfirmedSale).not.toHaveBeenCalled();
  });
});
