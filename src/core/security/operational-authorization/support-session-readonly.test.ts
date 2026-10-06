// ─────────────────────────────────────────────────────────────────
// core/security/operational-authorization — support-session-readonly.test.ts
//
// (18) Support Session (SUPPORT_RUNTIME, readOnly) con el
// requireOperationalContext REAL: no puede configurar la Clave de
// Supervisor, no puede obtener grants y no puede ejecutar writes
// protegidos — ni siquiera con la clave correcta o un grant previo.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  jar: new Map<string, { value: string; options?: Record<string, unknown> }>(),
  runtime: null as unknown as Record<string, unknown>,
  updateSaleItemInDraft: vi.fn(),
  discardDraftSale: vi.fn(),
  cancelConfirmedSale: vi.fn(),
}));

vi.mock("next/headers", async () => {
  const { cookieStoreFrom } = await import("./operational-authorization.test-fixtures");
  return { cookies: async () => cookieStoreFrom(h.jar) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, { get() { throw new Error("Prisma global NO debe usarse"); } }),
}));

const SUPER_ADMIN = { id: "platform-admin", tenant_id: "platform-tenant", location_id: null, role: "super_admin", auth_scope: "PLATFORM" };
vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => SUPER_ADMIN),
  requireGlobalAdmin: vi.fn(async () => SUPER_ADMIN),
}));
vi.mock("@/lib/location/active-location", () => ({ getEffectiveLocationId: vi.fn(async () => "loc-1") }));
vi.mock("@/modules/platform/runtime/effective-tenant-context", () => ({
  resolveEffectiveTenantContext: vi.fn(async () => ({
    context: {
      tenantId: "tenant-A",
      client: h.runtime,
      runtime: { readOnly: true },
      locationId: "loc-1",
      runtimeMode: "SUPPORT_RUNTIME",
      readOnly: true,
      effectiveRole: "super_admin",
    },
    dispose: vi.fn(async () => {}),
  })),
}));
vi.mock("@/modules/platform/runtime/commercial-enforcement", () => ({
  resolveCommercialEnforcementContext: vi.fn(async () => ({ organizationId: "org-1" })),
  assertOrganizationModule: vi.fn(),
  CommercialEnforcementError: class extends Error {},
}));
vi.mock("@/modules/platform/lib/provisioning/resolve-optional-gym-for-tenant", () => ({
  resolveOptionalGymForTenant: vi.fn(async () => null),
}));
vi.mock("@/modules/commerce/sales/services/sale.service", () => ({
  updateSaleItemInDraft: h.updateSaleItemInDraft,
  discardDraftSale: h.discardDraftSale,
  cancelConfirmedSale: h.cancelConfirmedSale,
}));

import { RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { setSupervisorPinAction } from "./actions/set-supervisor-pin.action";
import { authorizeWithSupervisorPin } from "./operational-authorization";
import { editSaleAuthAction } from "@/modules/commerce/sales/actions/edit-sale-auth.action";
import { verifyEditKeyAction } from "@/modules/commerce/products/actions/verify-edit-key.action";
import { authorizeCustomerEditAction } from "@/modules/commerce/customers/actions/authorize-customer-edit.action";
import { updateSaleItemAction } from "@/modules/commerce/sales/actions/update-sale-item.action";
import { deleteDraftSaleWithAuthAction } from "@/modules/commerce/sales/actions/delete-draft-sale-with-auth.action";
import { cancelConfirmedSaleAction } from "@/modules/commerce/sales/actions/cancel-confirmed-sale.action";
import { createFakeSecurityDb, seedSupervisorPin, TEST_AUTH_SECRET } from "./operational-authorization.test-fixtures";

const ORIGINAL_SECRET = process.env.AUTH_SECRET;
let security: ReturnType<typeof createFakeSecurityDb>;

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(async () => {
  h.jar.clear();
  process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  security = createFakeSecurityDb();
  await seedSupervisorPin(security, "tenant-A", "123456");
  h.runtime = {
    tenantSecurityConfig: (security.client as unknown as Record<string, unknown>).tenantSecurityConfig,
    sale: { findFirst: vi.fn(async () => ({ status: "DRAFT" })) },
    product: { findFirst: vi.fn(async () => ({ id: "p" })) },
    customer: { findFirst: vi.fn(async () => ({ id: "c" })) },
  };
  h.updateSaleItemInDraft.mockReset().mockResolvedValue({ ok: true });
  h.discardDraftSale.mockReset().mockResolvedValue({ ok: true });
  h.cancelConfirmedSale.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => {
  process.env.AUTH_SECRET = ORIGINAL_SECRET;
});

describe("(18) Support Session read-only", () => {
  it("no puede configurar / cambiar la Clave de Supervisor", async () => {
    const before = security.rows.get("tenant-A")!.supervisor_pin_hash;
    const r = await setSupervisorPinAction(undefined, form({ new_pin: "nueva-123", confirm_pin: "nueva-123" }));
    expect(r).toEqual({ ok: false, error: RUNTIME_READONLY_MESSAGE });
    expect(security.calls.upsert).toBe(0);
    expect(security.rows.get("tenant-A")!.supervisor_pin_hash).toBe(before);
  });

  it.each([
    ["editSaleAuthAction", editSaleAuthAction],
    ["verifyEditKeyAction", verifyEditKeyAction],
    ["authorizeCustomerEditAction", authorizeCustomerEditAction],
  ] as const)("%s no emite grant aunque la clave sea correcta", async (_n, action) => {
    const r = await action(undefined, form({ entity_id: "entity-1", supervisor_pin: "123456" }));
    expect(r).toEqual({ ok: false, error: RUNTIME_READONLY_MESSAGE });
    expect(h.jar.size).toBe(0);
    expect(security.calls.findUnique).toBe(0);
  });

  it("write protegido bloqueado incluso con un grant previo válido", async () => {
    await authorizeWithSupervisorPin(
      { tenantId: "tenant-A", client: h.runtime as never, effectiveUser: { id: SUPER_ADMIN.id } },
      "SALE_EDIT",
      "sale-1",
      "123456",
    );
    expect(h.jar.size).toBe(1);
    const r = await updateSaleItemAction("item-1", "sale-1", { quantity: 1 });
    expect(r).toEqual({ ok: false, error: RUNTIME_READONLY_MESSAGE });
    expect(h.updateSaleItemInDraft).not.toHaveBeenCalled();
  });

  it("operación de un solo uso (eliminar borrador) bloqueada aun con clave correcta", async () => {
    const r = await deleteDraftSaleWithAuthAction(undefined, form({ sale_id: "sale-1", supervisor_pin: "123456" }));
    expect(r).toEqual({ ok: false, error: RUNTIME_READONLY_MESSAGE });
    expect(h.discardDraftSale).not.toHaveBeenCalled();
  });

  it("anular venta CONFIRMED (un solo uso) bloqueada aun con clave correcta", async () => {
    const r = await cancelConfirmedSaleAction(undefined, form({ sale_id: "sale-1", supervisor_pin: "123456" }));
    expect(r).toEqual({ ok: false, error: RUNTIME_READONLY_MESSAGE });
    expect(h.cancelConfirmedSale).not.toHaveBeenCalled();
    expect(security.calls.findUnique).toBe(0);
  });
});
