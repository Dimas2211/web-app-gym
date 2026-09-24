// ─────────────────────────────────────────────────────────────────
// commerce/customers — update-customer-identification.action.test.ts
//
// SHARED-PILOT-4C-C1 (addendum) — la pestaña Identificación no usa Zod;
// debe rechazar id_type_code fuera de CAT-022 oficial (p. ej. "00")
// ANTES de invocar updateCustomer, y seguir aceptando null / 36.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const { updateCustomerSpy, requireOperationalContextMock, disposeMock } = vi.hoisted(() => ({
  updateCustomerSpy: vi.fn(),
  requireOperationalContextMock: vi.fn(),
  disposeMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/customer.service", () => ({ updateCustomer: updateCustomerSpy }));

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: class extends Error {},
}));

import { updateCustomerIdentificationAction } from "./update-customer-identification.action";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const BASE = { id: "c1", name: "Cliente Test", taxpayer_type: "FINAL_CONSUMER" };

beforeEach(() => {
  updateCustomerSpy.mockReset().mockResolvedValue({ ok: true });
  requireOperationalContextMock.mockReset().mockResolvedValue({
    context: { effectiveUser: { id: "u1", role: "super_admin" }, tenantId: "tenant-1", client: { __marker: "RUNTIME" } },
    dispose: disposeMock,
  });
  disposeMock.mockClear();
});

describe("updateCustomerIdentificationAction — CAT-022", () => {
  it("rechaza id_type_code=00 sin invocar updateCustomer", async () => {
    const result = await updateCustomerIdentificationAction(undefined, fd({ ...BASE, id_type_code: "00" }));
    expect(result).toEqual({ error: "Tipo de identificación inválido." });
    expect(updateCustomerSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("FINAL_CONSUMER sin tipo de identificación (null) sigue válido", async () => {
    const result = await updateCustomerIdentificationAction(undefined, fd({ ...BASE, id_type_code: "" }));
    expect(result).toBeUndefined();
    expect(updateCustomerSpy).toHaveBeenCalledWith(
      "c1", "tenant-1", "u1",
      expect.objectContaining({ taxpayer_type: "FINAL_CONSUMER", id_type_code: null }),
      { __marker: "RUNTIME" },
    );
  });

  it("REGISTERED_TAXPAYER + 36 sigue válido", async () => {
    const result = await updateCustomerIdentificationAction(undefined, fd({
      ...BASE, taxpayer_type: "REGISTERED_TAXPAYER", id_type_code: "36", nit: "0614-010268-009-9",
    }));
    expect(result).toBeUndefined();
    expect(updateCustomerSpy).toHaveBeenCalledWith(
      "c1", "tenant-1", "u1",
      expect.objectContaining({ taxpayer_type: "REGISTERED_TAXPAYER", id_type_code: "36" }),
      { __marker: "RUNTIME" },
    );
  });
});
