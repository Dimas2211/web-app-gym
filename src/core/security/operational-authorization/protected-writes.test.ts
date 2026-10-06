// ─────────────────────────────────────────────────────────────────
// core/security/operational-authorization — protected-writes.test.ts
//
// Certifica que NINGÚN entry point protegido (Server Action, Route
// Handler, página de edición) puede ejecutarse sin grant válido, aunque
// se invoque directamente, y que con el grant correcto sí procede.
// Usa el motor REAL (cookies firmadas en un jar en memoria) y una
// Runtime DB falsa; Prisma global es un proxy que explota si se toca
// (Dedicated Runtime: todo contra context.client).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const UUID = {
  productA: "11111111-1111-4111-8111-111111111111",
  productB: "11111111-1111-4111-8111-222222222222",
  category: "22222222-2222-4222-8222-222222222222",
  unit: "33333333-3333-4333-8333-333333333333",
  purchaseA: "44444444-4444-4444-8444-444444444441",
  purchaseB: "44444444-4444-4444-8444-444444444442",
  saleA: "55555555-5555-4555-8555-555555555551",
  saleB: "55555555-5555-4555-8555-555555555552",
  customerA: "66666666-6666-4666-8666-666666666661",
  customerB: "66666666-6666-4666-8666-666666666662",
  item: "77777777-7777-4777-8777-777777777777",
  supplier: "88888888-8888-4888-8888-888888888888",
};

const h = vi.hoisted(() => {
  class RedirectSignal extends Error {
    constructor(public url: string) {
      super(`REDIRECT:${url}`);
    }
  }
  return {
    jar: new Map<string, { value: string; options?: Record<string, unknown> }>(),
    state: { ctx: null as unknown as Record<string, unknown> },
    RedirectSignal,
    svc: {
      updateCustomer: vi.fn(),
      updateSaleDraft: vi.fn(),
      addSaleItemToDraft: vi.fn(),
      updateSaleItemInDraft: vi.fn(),
      removeSaleItemFromDraft: vi.fn(),
      discardDraftSale: vi.fn(),
      recalculateSaleTotals: vi.fn(),
      cancelDraftSale: vi.fn(),
      cancelConfirmedSale: vi.fn(),
      createSaleDraft: vi.fn(),
      addPurchaseItem: vi.fn(),
      updatePurchaseItem: vi.fn(),
      removePurchaseItem: vi.fn(),
      updatePurchaseHeader: vi.fn(),
      createPurchase: vi.fn(),
      deleteDraftPurchase: vi.fn(),
      cancelConfirmedPurchase: vi.fn(),
      cancelPurchase: vi.fn(),
      updatePurchasePaymentNature: vi.fn(),
      getSaleDetailById: vi.fn(),
      getPurchaseById: vi.fn(),
    },
  };
});

vi.mock("next/headers", async () => {
  const { cookieStoreFrom } = await import("./operational-authorization.test-fixtures");
  return { cookies: async () => cookieStoreFrom(h.jar) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new h.RedirectSignal(url);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, { get() { throw new Error("Prisma global NO debe usarse"); } }),
}));

const SESSION_USER = { id: "user-A", tenant_id: "tenant-A", location_id: "loc-1", role: "super_admin", auth_scope: "RUNTIME_CLIENT" };
vi.mock("@/lib/auth/auth", () => ({ auth: vi.fn(async () => ({ user: SESSION_USER })) }));
vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => SESSION_USER),
  requireGlobalAdmin: vi.fn(async () => SESSION_USER),
  getSessionOrRedirect: vi.fn(async () => SESSION_USER),
}));
vi.mock("@/lib/location/active-location", () => ({
  getEffectiveLocationId: vi.fn(async () => "loc-1"),
  ACTIVE_LOCATION_COOKIE: "active_location",
}));
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: vi.fn(async () => ({ context: h.state.ctx, dispose: vi.fn(async () => {}) })),
  OperationalContextError: class extends Error {
    userMessage = "ctx error";
  },
}));
vi.mock("@/modules/platform/runtime/effective-tenant-context", () => ({
  resolveEffectiveTenantContext: vi.fn(async () => ({
    context: {
      tenantId: h.state.ctx.tenantId,
      client: h.state.ctx.client,
      runtime: null,
      locationId: "loc-1",
      runtimeMode: "RUNTIME_CLIENT",
      readOnly: false,
      effectiveRole: "super_admin",
    },
    dispose: vi.fn(async () => {}),
  })),
  resolveRuntimeFirstLocationId: vi.fn(async () => "loc-1"),
}));
vi.mock("@/modules/platform/runtime/runtime-session", () => ({ RUNTIME_READONLY_MESSAGE: "solo lectura" }));
vi.mock("@/modules/platform/runtime/commercial-enforcement", () => ({
  resolveCommercialEnforcementContext: vi.fn(async () => ({})),
  assertOrganizationModule: vi.fn(),
  CommercialEnforcementError: class extends Error {},
}));
vi.mock("@/modules/commerce/customers/services/customer.service", () => ({ updateCustomer: h.svc.updateCustomer }));
vi.mock("@/modules/commerce/sales/services/sale.service", () => ({
  updateSaleDraft: h.svc.updateSaleDraft,
  addSaleItemToDraft: h.svc.addSaleItemToDraft,
  updateSaleItemInDraft: h.svc.updateSaleItemInDraft,
  removeSaleItemFromDraft: h.svc.removeSaleItemFromDraft,
  discardDraftSale: h.svc.discardDraftSale,
  recalculateSaleTotals: h.svc.recalculateSaleTotals,
  cancelDraftSale: h.svc.cancelDraftSale,
  cancelConfirmedSale: h.svc.cancelConfirmedSale,
  createSaleDraft: h.svc.createSaleDraft,
}));
vi.mock("@/modules/commerce/purchases/services/purchase.service", () => ({
  addPurchaseItem: h.svc.addPurchaseItem,
  updatePurchaseItem: h.svc.updatePurchaseItem,
  removePurchaseItem: h.svc.removePurchaseItem,
  updatePurchaseHeader: h.svc.updatePurchaseHeader,
  createPurchase: h.svc.createPurchase,
  deleteDraftPurchase: h.svc.deleteDraftPurchase,
  cancelConfirmedPurchase: h.svc.cancelConfirmedPurchase,
  cancelPurchase: h.svc.cancelPurchase,
  updatePurchasePaymentNature: h.svc.updatePurchasePaymentNature,
}));
vi.mock("@/modules/commerce/purchases/queries/get-purchase-by-id", () => ({ getPurchaseById: h.svc.getPurchaseById }));
vi.mock("@/modules/commerce/sales/queries/get-sale-detail-by-id", () => ({ getSaleDetailById: h.svc.getSaleDetailById }));
vi.mock("@/modules/commerce/purchases/components/purchase-form-client", () => ({ PurchaseFormClient: () => null }));
vi.mock("@/modules/commerce/sales/components/sale-new-client", () => ({ SaleNewClient: () => null }));
vi.mock("@/modules/commerce/dte/queries/list-dte-catalog-items", () => ({ listDteCatalogItems: vi.fn(async () => []) }));
vi.mock("@/core/modules/locations/queries", () => ({ getLocationById: vi.fn(async () => ({ id: "loc-1", name: "Sede" })) }));
vi.mock("@/modules/commerce/sales/export/services/sales-export-availability", () => ({
  resolveSalesExportAvailability: vi.fn(async () => ({ enabled: false })),
}));

import { authorizeWithSupervisorPin, issueDraftOwnerGrant } from "./operational-authorization";
import { OPERATIONAL_AUTH_MESSAGES as M } from "./messages";
import type { GrantScope, PinGrantScope } from "./scopes";
import { createFakeSecurityDb, seedSupervisorPin, TEST_AUTH_SECRET } from "./operational-authorization.test-fixtures";

// Products
import { updateProductAction } from "@/modules/commerce/products/actions/update-product.action";
// Customers
import { updateCustomerAction } from "@/modules/commerce/customers/actions/update-customer.action";
import { updateCustomerContactAction } from "@/modules/commerce/customers/actions/update-customer-contact.action";
import { updateCustomerIdentificationAction } from "@/modules/commerce/customers/actions/update-customer-identification.action";
import { updateCustomerAddressAction } from "@/modules/commerce/customers/actions/update-customer-address.action";
import { updateCustomerActivityAction } from "@/modules/commerce/customers/actions/update-customer-activity.action";
import { updateCustomerStatusAction } from "@/modules/commerce/customers/actions/update-customer-status.action";
import { PATCH as customerPATCH } from "@/app/api/customers/[id]/route";
// Purchases
import { savePurchaseHeaderAction } from "@/modules/commerce/purchases/actions/save-purchase-header.action";
import { updatePurchaseHeaderAction } from "@/modules/commerce/purchases/actions/update-purchase-header.action";
import {
  addPurchaseItemAction,
  updatePurchaseItemAction,
  removePurchaseItemAction,
} from "@/modules/commerce/purchases/actions/manage-purchase-items.action";
import { updatePurchasePaymentNatureAction } from "@/modules/commerce/purchases/actions/update-purchase-payment-nature.action";
import { cancelPurchaseAction } from "@/modules/commerce/purchases/actions/cancel-purchase.action";
import { deleteDraftPurchaseWithAuthAction } from "@/modules/commerce/purchases/actions/delete-draft-purchase-with-auth.action";
import { cancelConfirmedPurchaseAction } from "@/modules/commerce/purchases/actions/cancel-confirmed-purchase.action";
import { editPurchaseAuthAction } from "@/modules/commerce/purchases/actions/edit-purchase-auth.action";
import { POST as purchaseItemsPOST } from "@/app/api/purchases/[id]/items/route";
import { PATCH as purchaseItemPATCH, DELETE as purchaseItemDELETE } from "@/app/api/purchases/[id]/items/[itemId]/route";
import { POST as purchaseCancelPOST } from "@/app/api/purchases/[id]/cancel/route";
import { DELETE as purchaseDELETE } from "@/app/api/purchases/[id]/route";
import EditPurchasePage from "@/app/(dashboard)/dashboard/purchases/[id]/edit/page";
// Sales
import { createSaleDraftAction } from "@/modules/commerce/sales/actions/create-sale-draft.action";
import { updateSaleDraftAction } from "@/modules/commerce/sales/actions/update-sale-draft.action";
import { addSaleItemAction } from "@/modules/commerce/sales/actions/add-sale-item.action";
import { updateSaleItemAction } from "@/modules/commerce/sales/actions/update-sale-item.action";
import { removeSaleItemAction } from "@/modules/commerce/sales/actions/remove-sale-item.action";
import { recalculateSaleTotalsAction } from "@/modules/commerce/sales/actions/recalculate-sale-totals.action";
import { discardDraftSaleAction } from "@/modules/commerce/sales/actions/discard-draft-sale.action";
import { cancelDraftSaleAction } from "@/modules/commerce/sales/actions/cancel-draft-sale.action";
import { deleteDraftSaleWithAuthAction } from "@/modules/commerce/sales/actions/delete-draft-sale-with-auth.action";
import { cancelConfirmedSaleAction } from "@/modules/commerce/sales/actions/cancel-confirmed-sale.action";
import { editSaleAuthAction } from "@/modules/commerce/sales/actions/edit-sale-auth.action";
import { PATCH as salePATCH } from "@/app/api/sales/[id]/route";
import { POST as saleItemsPOST } from "@/app/api/sales/[id]/items/route";
import { PATCH as saleItemPATCH, DELETE as saleItemDELETE } from "@/app/api/sales/[id]/items/[itemId]/route";
import { POST as saleRecalcPOST } from "@/app/api/sales/[id]/recalculate/route";
import NewSalePage from "@/app/(dashboard)/dashboard/sales/new/page";
// Products authorize
import { verifyEditKeyAction } from "@/modules/commerce/products/actions/verify-edit-key.action";
import { authorizeCustomerEditAction } from "@/modules/commerce/customers/actions/authorize-customer-edit.action";

// ── Runtime DB falsa (TrustMe / Dedicated Runtime) ─────────────────

const ORIGINAL_SECRET = process.env.AUTH_SECRET;
let security: ReturnType<typeof createFakeSecurityDb>;
let runtime: Record<string, unknown> & {
  product: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  purchase: { findFirst: ReturnType<typeof vi.fn> };
  sale: { findFirst: ReturnType<typeof vi.fn> };
  customer: { findFirst: ReturnType<typeof vi.fn> };
};

function found() {
  return { findFirst: vi.fn(async () => ({ id: "x" })) };
}

function engineCtx() {
  return { tenantId: "tenant-A", client: runtime as never, effectiveUser: { id: "user-A" } };
}

async function grantPin(scope: PinGrantScope, entityId: string) {
  const r = await authorizeWithSupervisorPin(engineCtx(), scope, entityId, "123456");
  expect(r).toEqual({ ok: true });
}

async function grantOwner(scope: GrantScope & `${string}_DRAFT_OWNER`, entityId: string) {
  await issueDraftOwnerGrant(engineCtx(), scope, entityId);
}

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

function jsonReq(body: unknown) {
  return { json: async () => body } as never;
}

beforeEach(async () => {
  h.jar.clear();
  process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  security = createFakeSecurityDb();
  await seedSupervisorPin(security, "tenant-A", "123456");
  runtime = {
    __marker: "RUNTIME_DB",
    tenantSecurityConfig: (security.client as unknown as Record<string, unknown>).tenantSecurityConfig,
    product: { findFirst: vi.fn(async () => ({ id: UUID.productA })), update: vi.fn(async () => ({})) },
    productCategory: found(),
    unitOfMeasure: found(),
    purchase: { findFirst: vi.fn(async () => ({ status: "DRAFT" })) },
    sale: { findFirst: vi.fn(async () => ({ status: "DRAFT" })) },
    customer: { findFirst: vi.fn(async () => ({ id: UUID.customerA })) },
  };
  h.state.ctx = {
    tenantId: "tenant-A",
    locationId: "loc-1",
    client: runtime,
    readOnly: false,
    organizationId: null,
    effectiveUser: { id: "user-A", tenant_id: "tenant-A", location_id: "loc-1", role: "super_admin" },
  };
  for (const fn of Object.values(h.svc)) fn.mockReset();
  h.svc.updateCustomer.mockResolvedValue({ ok: true });
  for (const k of [
    "updateSaleDraft", "updateSaleItemInDraft", "removeSaleItemFromDraft", "discardDraftSale",
    "recalculateSaleTotals", "cancelDraftSale", "cancelConfirmedSale", "updatePurchaseItem", "removePurchaseItem",
    "updatePurchaseHeader", "deleteDraftPurchase", "cancelConfirmedPurchase", "cancelPurchase",
  ] as const) h.svc[k].mockResolvedValue({ ok: true });
  h.svc.addSaleItemToDraft.mockResolvedValue({ ok: true, item_id: "i1", line_number: 1 });
  h.svc.addPurchaseItem.mockResolvedValue({ ok: true });
  h.svc.createSaleDraft.mockResolvedValue({ ok: true, id: UUID.saleA, sale_code: "V-1" });
  h.svc.updatePurchasePaymentNature.mockResolvedValue({ ok: true });
  h.svc.getPurchaseById.mockResolvedValue({
    id: UUID.purchaseA, status: "DRAFT", supplier_id: UUID.supplier, supplier_name: "Prov", supplier_nrc: null,
    purchase_date: new Date("2026-10-01"), purchase_code: "1", document_type: "CCF", document_series: "A",
    document_number: "1", payment_condition: "CON", cancellation_type: "EFE", notes: null, source_type: "MANUAL",
  });
  h.svc.getSaleDetailById.mockResolvedValue({ id: UUID.saleA, status: "DRAFT" });
});

afterEach(() => {
  process.env.AUTH_SECRET = ORIGINAL_SECRET;
});

// ── PRODUCTS ───────────────────────────────────────────────────────

function productForm(id: string) {
  return form({
    id, name: "Producto", product_type: "PRODUCT", category_id: UUID.category, unit_id: UUID.unit,
    is_stockable: "true", allow_purchase: "true", allow_sale: "true",
  });
}

describe("PRODUCTS — updateProductAction", () => {
  it("(17) sin grant falla aunque se invoque directamente; no escribe", async () => {
    const r = await updateProductAction(undefined, productForm(UUID.productA));
    expect(r).toEqual({ error: M.GRANT_MISSING });
    expect(runtime.product.update).not.toHaveBeenCalled();
  });

  it("(7) PRODUCT_EDIT del producto A no autoriza editar el producto B", async () => {
    await grantPin("PRODUCT_EDIT", UUID.productA);
    const r = await updateProductAction(undefined, productForm(UUID.productB));
    expect(r).toEqual({ error: M.GRANT_MISSING });
    expect(runtime.product.update).not.toHaveBeenCalled();
  });

  it("con PRODUCT_EDIT del producto procede contra la Runtime DB", async () => {
    await grantPin("PRODUCT_EDIT", UUID.productA);
    const r = await updateProductAction(undefined, productForm(UUID.productA));
    expect(r).toBeUndefined();
    expect(runtime.product.update).toHaveBeenCalledTimes(1);
  });

  it("verifyEditKeyAction ya no depende de EDIT_CATALOG_PIN: valida la clave del tenant", async () => {
    process.env.EDIT_CATALOG_PIN = "999999";
    expect(await verifyEditKeyAction(undefined, form({ entity_id: UUID.productA, supervisor_pin: "999999" }))).toEqual({
      ok: false,
      error: M.PIN_INVALID,
    });
    expect(await verifyEditKeyAction(undefined, form({ entity_id: UUID.productA, supervisor_pin: "123456" }))).toEqual({
      ok: true,
    });
    delete process.env.EDIT_CATALOG_PIN;
  });
});

// ── CUSTOMERS ──────────────────────────────────────────────────────

const CUSTOMER_TAB_ACTIONS = [
  ["updateCustomerContactAction", updateCustomerContactAction, { phone: "7777-7777" }],
  ["updateCustomerIdentificationAction", updateCustomerIdentificationAction, { name: "Cliente", taxpayer_type: "FINAL_CONSUMER" }],
  ["updateCustomerAddressAction", updateCustomerAddressAction, {}],
  ["updateCustomerActivityAction", updateCustomerActivityAction, {}],
] as const;

describe("CUSTOMERS — edición del maestro", () => {
  it.each(CUSTOMER_TAB_ACTIONS)("(16) %s sin grant falla y no escribe", async (_n, action, extra) => {
    const r = await action(undefined, form({ id: UUID.customerA, ...extra }));
    expect(r).toEqual({ error: M.GRANT_MISSING });
    expect(h.svc.updateCustomer).not.toHaveBeenCalled();
  });

  it.each(CUSTOMER_TAB_ACTIONS)("(10) %s: CUSTOMER_EDIT del cliente A no autoriza al cliente B", async (_n, action, extra) => {
    await grantPin("CUSTOMER_EDIT", UUID.customerA);
    const r = await action(undefined, form({ id: UUID.customerB, ...extra }));
    expect(r).toEqual({ error: M.GRANT_MISSING });
    expect(h.svc.updateCustomer).not.toHaveBeenCalled();
  });

  it.each(CUSTOMER_TAB_ACTIONS)("%s con grant del cliente procede", async (_n, action, extra) => {
    await grantPin("CUSTOMER_EDIT", UUID.customerA);
    const r = await action(undefined, form({ id: UUID.customerA, ...extra }));
    expect(r).toBeUndefined();
    expect(h.svc.updateCustomer).toHaveBeenCalledTimes(1);
    expect(h.svc.updateCustomer.mock.calls[0][4]).toBe(runtime);
  });

  it("(16) updateCustomerAction sin grant falla; con grant procede", async () => {
    expect(await updateCustomerAction(UUID.customerA, { name: "X" } as never)).toEqual({ ok: false, error: M.GRANT_MISSING });
    expect(h.svc.updateCustomer).not.toHaveBeenCalled();
    await grantPin("CUSTOMER_EDIT", UUID.customerA);
    expect(await updateCustomerAction(UUID.customerA, { name: "X" } as never)).toEqual({ ok: true });
  });

  it("(16) PATCH /api/customers/:id sin grant → 403 (no es bypass)", async () => {
    const res = await customerPATCH(jsonReq({ name: "X" }), { params: Promise.resolve({ id: UUID.customerA }) });
    expect(res.status).toBe(403);
    expect(h.svc.updateCustomer).not.toHaveBeenCalled();
  });

  it("cambio de estado activo/inactivo sigue sin clave (igual que products)", async () => {
    expect(await updateCustomerStatusAction(UUID.customerA, "inactive")).toEqual({ ok: true });
    expect(h.svc.updateCustomer).toHaveBeenCalledWith(UUID.customerA, "tenant-A", "user-A", { status: "inactive" }, runtime);
  });

  it("authorizeCustomerEditAction con clave correcta emite grant del cliente", async () => {
    expect(
      await authorizeCustomerEditAction(undefined, form({ entity_id: UUID.customerA, supervisor_pin: "123456" })),
    ).toEqual({ ok: true });
    expect(h.jar.has(`zoa_customer_edit_${UUID.customerA}`)).toBe(true);
  });
});

// ── PURCHASES ──────────────────────────────────────────────────────

function headerForm(purchaseId: string) {
  return form({
    purchase_id: purchaseId, supplier_id: UUID.supplier, purchase_date: "2026-10-01", purchase_code: "10",
    document_type: "CCF", document_series: "A", document_number: "1", payment_condition: "CON", cancellation_type: "EFE",
  });
}

describe("PURCHASES — mutaciones de borrador", () => {
  const cases = [
    ["savePurchaseHeaderAction (update)", (id: string) => savePurchaseHeaderAction(undefined, headerForm(id)), "updatePurchaseHeader"],
    ["updatePurchaseHeaderAction", (id: string) => updatePurchaseHeaderAction(id, undefined, headerForm(id)), "updatePurchaseHeader"],
    ["addPurchaseItemAction", (id: string) => addPurchaseItemAction(undefined, form({ purchase_id: id, product_id: UUID.productA, quantity: "1", unit_cost: "1" })), "addPurchaseItem"],
    ["updatePurchaseItemAction", (id: string) => updatePurchaseItemAction(undefined, form({ purchase_id: id, item_id: UUID.item, quantity: "2" })), "updatePurchaseItem"],
    ["removePurchaseItemAction", (id: string) => removePurchaseItemAction(undefined, form({ purchase_id: id, item_id: UUID.item })), "removePurchaseItem"],
    ["updatePurchasePaymentNatureAction (DRAFT)", (id: string) => updatePurchasePaymentNatureAction(id, "SERVICES", null), "updatePurchasePaymentNature"],
  ] as const;

  it.each(cases)("(14) %s sin grant falla aunque se invoque directamente", async (_n, run, svc) => {
    const r = (await run(UUID.purchaseA)) as { ok?: boolean; error?: string } | undefined;
    expect(r?.error).toBe(M.GRANT_MISSING);
    expect(h.svc[svc]).not.toHaveBeenCalled();
  });

  it.each(cases)("(8) %s: PURCHASE_EDIT de la compra A no autoriza la compra B", async (_n, run, svc) => {
    await grantPin("PURCHASE_EDIT", UUID.purchaseA);
    const r = (await run(UUID.purchaseB)) as { error?: string } | undefined;
    expect(r?.error).toBe(M.GRANT_MISSING);
    expect(h.svc[svc]).not.toHaveBeenCalled();
  });

  it.each(cases)("%s con PURCHASE_EDIT de la compra procede", async (_n, run, svc) => {
    await grantPin("PURCHASE_EDIT", UUID.purchaseA);
    await run(UUID.purchaseA);
    expect(h.svc[svc]).toHaveBeenCalledTimes(1);
  });

  it("captura normal: el creador del borrador (PURCHASE_DRAFT_OWNER) edita sin clave", async () => {
    await grantOwner("PURCHASE_DRAFT_OWNER", UUID.purchaseA);
    await addPurchaseItemAction(undefined, form({ purchase_id: UUID.purchaseA, product_id: UUID.productA, quantity: "1", unit_cost: "1" }));
    expect(h.svc.addPurchaseItem).toHaveBeenCalledTimes(1);
  });

  it("crear borrador emite grant de creador para ese id", async () => {
    h.svc.createPurchase.mockResolvedValue({ ok: true, id: UUID.purchaseB });
    const r = await savePurchaseHeaderAction(undefined, headerForm(""));
    expect(r).toMatchObject({ ok: true, id: UUID.purchaseB, created: true });
    expect(h.jar.has(`zoa_purchase_draft_owner_${UUID.purchaseB}`)).toBe(true);
  });

  it("naturaleza de pago en compra CONFIRMED (flujo FSE) no exige grant", async () => {
    runtime.purchase.findFirst.mockResolvedValue({ status: "CONFIRMED" });
    await updatePurchasePaymentNatureAction(UUID.purchaseA, "SERVICES", null);
    expect(h.svc.updatePurchasePaymentNature).toHaveBeenCalledTimes(1);
  });

  it("anular DRAFT (cancelPurchaseAction) exige grant de creador; PURCHASE_EDIT no basta", async () => {
    await grantPin("PURCHASE_EDIT", UUID.purchaseA);
    expect(await cancelPurchaseAction(undefined, form({ purchase_id: UUID.purchaseA }))).toEqual({ error: M.GRANT_MISSING });
    expect(h.svc.cancelPurchase).not.toHaveBeenCalled();
  });

  it("(14) API items POST / PATCH / DELETE y cancel sin grant → 403", async () => {
    const p = { params: Promise.resolve({ id: UUID.purchaseA, itemId: UUID.item }) };
    expect((await purchaseItemsPOST(jsonReq({ product_id: UUID.productA, quantity: 1, unit_cost: 1 }), p)).status).toBe(403);
    expect((await purchaseItemPATCH(jsonReq({ quantity: 2 }), p)).status).toBe(403);
    expect((await purchaseItemDELETE(jsonReq({}), p)).status).toBe(403);
    expect((await purchaseCancelPOST(jsonReq({}), p)).status).toBe(403);
    expect(h.svc.addPurchaseItem).not.toHaveBeenCalled();
    expect(h.svc.updatePurchaseItem).not.toHaveBeenCalled();
    expect(h.svc.removePurchaseItem).not.toHaveBeenCalled();
    expect(h.svc.cancelPurchase).not.toHaveBeenCalled();
  });

  it("DELETE /api/purchases/:id deshabilitado (403) — no es bypass", async () => {
    expect((await purchaseDELETE()).status).toBe(403);
    expect(h.svc.deleteDraftPurchase).not.toHaveBeenCalled();
  });

  it("eliminar borrador exige clave (PURCHASE_DELETE_DRAFT)", async () => {
    expect(
      await deleteDraftPurchaseWithAuthAction(undefined, form({ purchase_id: UUID.purchaseA, supervisor_pin: "000000" })),
    ).toEqual({ ok: false, error: M.PIN_INVALID });
    expect(h.svc.deleteDraftPurchase).not.toHaveBeenCalled();

    expect(
      await deleteDraftPurchaseWithAuthAction(undefined, form({ purchase_id: UUID.purchaseA, supervisor_pin: "123456" })),
    ).toEqual({ ok: true });
    expect(h.svc.deleteDraftPurchase).toHaveBeenCalledWith(UUID.purchaseA, "tenant-A", "loc-1", runtime);
  });

  it("anular compra CONFIRMED exige clave (PURCHASE_CANCEL_CONFIRMED), sin correo/contraseña", async () => {
    expect(
      await cancelConfirmedPurchaseAction(undefined, form({ purchase_id: UUID.purchaseA, auth_email: "a@b.c", auth_password: "x" })),
    ).toEqual({ ok: false, error: M.PIN_REQUIRED });
    expect(h.svc.cancelConfirmedPurchase).not.toHaveBeenCalled();
    expect(
      await cancelConfirmedPurchaseAction(undefined, form({ purchase_id: UUID.purchaseA, supervisor_pin: "123456" })),
    ).toEqual({ ok: true });
    expect(h.svc.cancelConfirmedPurchase).toHaveBeenCalledTimes(1);
  });

  it("(3) tenant sin clave: eliminar/anular fallan cerrado", async () => {
    security.rows.clear();
    expect(
      await deleteDraftPurchaseWithAuthAction(undefined, form({ purchase_id: UUID.purchaseA, supervisor_pin: "123456" })),
    ).toEqual({ ok: false, error: M.PIN_NOT_CONFIGURED });
    expect(
      await cancelConfirmedPurchaseAction(undefined, form({ purchase_id: UUID.purchaseA, supervisor_pin: "123456" })),
    ).toEqual({ ok: false, error: M.PIN_NOT_CONFIGURED });
  });

  it("editPurchaseAuthAction rechaza compras no DRAFT", async () => {
    runtime.purchase.findFirst.mockResolvedValue({ status: "CONFIRMED" });
    const r = await editPurchaseAuthAction(undefined, form({ entity_id: UUID.purchaseA, supervisor_pin: "123456" }));
    expect(r?.ok).toBe(false);
    expect(h.jar.size).toBe(0);
  });
});

describe("PURCHASES — /dashboard/purchases/[id]/edit", () => {
  it("(12) URL directa sin grant redirige a la consulta", async () => {
    await expect(EditPurchasePage({ params: Promise.resolve({ id: UUID.purchaseA }) })).rejects.toMatchObject({
      url: "/dashboard/purchases?auth=required",
    });
  });

  it("(12) grant de OTRA compra tampoco abre la edición", async () => {
    await grantPin("PURCHASE_EDIT", UUID.purchaseB);
    await expect(EditPurchasePage({ params: Promise.resolve({ id: UUID.purchaseA }) })).rejects.toMatchObject({
      url: "/dashboard/purchases?auth=required",
    });
  });

  it("con PURCHASE_EDIT de la compra renderiza la edición", async () => {
    await grantPin("PURCHASE_EDIT", UUID.purchaseA);
    const el = await EditPurchasePage({ params: Promise.resolve({ id: UUID.purchaseA }) });
    expect(el).toBeTruthy();
  });
});

// ── SALES ──────────────────────────────────────────────────────────

describe("SALES — mutaciones de borrador", () => {
  const cases = [
    ["updateSaleDraftAction", (id: string) => updateSaleDraftAction(id, { notes: "x" }), "updateSaleDraft"],
    ["addSaleItemAction", (id: string) => addSaleItemAction(id, { product_id: UUID.productA, quantity: 1, unit_price: 1 } as never), "addSaleItemToDraft"],
    ["updateSaleItemAction", (id: string) => updateSaleItemAction(UUID.item, id, { quantity: 2 }), "updateSaleItemInDraft"],
    ["removeSaleItemAction", (id: string) => removeSaleItemAction(UUID.item, id), "removeSaleItemFromDraft"],
    ["recalculateSaleTotalsAction", (id: string) => recalculateSaleTotalsAction(id), "recalculateSaleTotals"],
  ] as const;

  it.each(cases)("(15) %s sin grant falla aunque se invoque directamente", async (_n, run, svc) => {
    expect(await run(UUID.saleA)).toEqual({ ok: false, error: M.GRANT_MISSING });
    expect(h.svc[svc]).not.toHaveBeenCalled();
  });

  it.each(cases)("(9) %s: SALE_EDIT de la venta A no autoriza la venta B", async (_n, run, svc) => {
    await grantPin("SALE_EDIT", UUID.saleA);
    expect(await run(UUID.saleB)).toEqual({ ok: false, error: M.GRANT_MISSING });
    expect(h.svc[svc]).not.toHaveBeenCalled();
  });

  it.each(cases)("%s con SALE_EDIT de la venta procede", async (_n, run, svc) => {
    await grantPin("SALE_EDIT", UUID.saleA);
    expect((await run(UUID.saleA)).ok).toBe(true);
    expect(h.svc[svc]).toHaveBeenCalledTimes(1);
  });

  it("captura normal: createSaleDraftAction emite grant de creador y la captura sigue sin clave", async () => {
    const created = await createSaleDraftAction({ sale_date: "2026-10-05" } as never);
    expect(created).toMatchObject({ ok: true, id: UUID.saleA });
    expect(await addSaleItemAction(UUID.saleA, { product_id: UUID.productA, quantity: 1, unit_price: 1 } as never)).toMatchObject({ ok: true });
    expect(await discardDraftSaleAction(UUID.saleA)).toEqual({ ok: true });
  });

  it("descartar borrador: SALE_EDIT (clave) NO basta — evita escalar edición → eliminación", async () => {
    await grantPin("SALE_EDIT", UUID.saleA);
    expect(await discardDraftSaleAction(UUID.saleA)).toEqual({ ok: false, error: M.GRANT_MISSING });
    expect(await cancelDraftSaleAction(UUID.saleA)).toEqual({ ok: false, error: M.GRANT_MISSING });
    expect(h.svc.discardDraftSale).not.toHaveBeenCalled();
    expect(h.svc.cancelDraftSale).not.toHaveBeenCalled();
  });

  it("(15) API PATCH cabecera, items POST/PATCH/DELETE y recalculate sin grant → 403", async () => {
    const p = { params: Promise.resolve({ id: UUID.saleA, itemId: UUID.item }) };
    expect((await salePATCH(jsonReq({ notes: "x" }), p)).status).toBe(403);
    expect((await saleItemsPOST(jsonReq({ product_id: UUID.productA, quantity: 1, unit_price: 1 }), p)).status).toBe(403);
    expect((await saleItemPATCH(jsonReq({ quantity: 2 }), p)).status).toBe(403);
    expect((await saleItemDELETE(jsonReq({}), p)).status).toBe(403);
    expect((await saleRecalcPOST(jsonReq({}), p)).status).toBe(403);
    for (const k of ["updateSaleDraft", "addSaleItemToDraft", "updateSaleItemInDraft", "removeSaleItemFromDraft", "recalculateSaleTotals"] as const) {
      expect(h.svc[k]).not.toHaveBeenCalled();
    }
  });

  it("eliminar borrador exige clave (SALE_DELETE_DRAFT), ya no correo/contraseña", async () => {
    expect(
      await deleteDraftSaleWithAuthAction(undefined, form({ sale_id: UUID.saleA, auth_email: "a@b.c", auth_password: "x" })),
    ).toEqual({ ok: false, error: M.PIN_REQUIRED });
    expect(await deleteDraftSaleWithAuthAction(undefined, form({ sale_id: UUID.saleA, supervisor_pin: "123456" }))).toEqual({ ok: true });
    expect(h.svc.discardDraftSale).toHaveBeenCalledWith(UUID.saleA, "tenant-A", "loc-1", runtime);
  });

  it("anular venta CONFIRMED exige clave (SALE_CANCEL_CONFIRMED), sin correo/contraseña ni grant previo", async () => {
    expect(
      await cancelConfirmedSaleAction(undefined, form({ sale_id: UUID.saleA, auth_email: "a@b.c", auth_password: "x" })),
    ).toEqual({ ok: false, error: M.PIN_REQUIRED });
    expect(h.svc.cancelConfirmedSale).not.toHaveBeenCalled();

    // Un grant SALE_EDIT previo NO autoriza anular (evita escalar edición → anulación).
    await grantPin("SALE_EDIT", UUID.saleA);
    expect(await cancelConfirmedSaleAction(undefined, form({ sale_id: UUID.saleA }))).toEqual({
      ok: false,
      error: M.PIN_REQUIRED,
    });
    expect(h.svc.cancelConfirmedSale).not.toHaveBeenCalled();
  });

  it("(2) anular venta con clave incorrecta no invoca el service (nada cambia)", async () => {
    expect(
      await cancelConfirmedSaleAction(undefined, form({ sale_id: UUID.saleA, supervisor_pin: "000000" })),
    ).toEqual({ ok: false, error: M.PIN_INVALID });
    expect(h.svc.cancelConfirmedSale).not.toHaveBeenCalled();
  });

  it("anular venta con clave correcta: service con tenant/location/usuario efectivos y context.client; sin grant reutilizable", async () => {
    const jarBefore = h.jar.size;
    expect(
      await cancelConfirmedSaleAction(undefined, form({ sale_id: UUID.saleA, supervisor_pin: "123456" })),
    ).toEqual({ ok: true });
    expect(h.svc.cancelConfirmedSale).toHaveBeenCalledWith(UUID.saleA, "tenant-A", "loc-1", "user-A", runtime);
    expect(h.jar.size).toBe(jarBefore); // un solo uso: no se emite cookie de grant
  });

  it("anular venta: bloqueo del service (ej. DTE aceptado) llega tal cual a la UI", async () => {
    h.svc.cancelConfirmedSale.mockResolvedValue({ ok: false, error: "La venta tiene un DTE aceptado por Hacienda. Debes invalidar el DTE antes de anular la venta." });
    expect(
      await cancelConfirmedSaleAction(undefined, form({ sale_id: UUID.saleA, supervisor_pin: "123456" })),
    ).toEqual({ ok: false, error: "La venta tiene un DTE aceptado por Hacienda. Debes invalidar el DTE antes de anular la venta." });
  });

  it("(3) anular venta en tenant sin clave falla cerrado", async () => {
    security.rows.clear();
    expect(
      await cancelConfirmedSaleAction(undefined, form({ sale_id: UUID.saleA, supervisor_pin: "123456" })),
    ).toEqual({ ok: false, error: M.PIN_NOT_CONFIGURED });
    expect(h.svc.cancelConfirmedSale).not.toHaveBeenCalled();
  });

  it("(19) editSaleAuthAction valida la clave contra context.client (Runtime DB), nunca Prisma global", async () => {
    const r = await editSaleAuthAction(undefined, form({ entity_id: UUID.saleA, supervisor_pin: "123456" }));
    expect(r).toEqual({ ok: true });
    expect(runtime.sale.findFirst).toHaveBeenCalledWith({ where: { id: UUID.saleA, tenant_id: "tenant-A" }, select: { status: true } });
    expect(security.calls.findUnique).toBeGreaterThan(0);
    expect(h.jar.has(`zoa_sale_edit_${UUID.saleA}`)).toBe(true);
  });

  it("(3) editSaleAuthAction en tenant sin clave falla cerrado", async () => {
    security.rows.clear();
    expect(await editSaleAuthAction(undefined, form({ entity_id: UUID.saleA, supervisor_pin: "123456" }))).toEqual({
      ok: false,
      error: M.PIN_NOT_CONFIGURED,
    });
  });
});

describe("SALES — /dashboard/sales/new?sale_id=", () => {
  it("(13) URL directa sin grant NO carga el DRAFT editable (redirige)", async () => {
    await expect(NewSalePage({ searchParams: Promise.resolve({ sale_id: UUID.saleA }) })).rejects.toMatchObject({
      url: "/dashboard/sales?auth=required",
    });
    expect(h.svc.getSaleDetailById).not.toHaveBeenCalled();
  });

  it("(13) grant de otra venta no carga este DRAFT", async () => {
    await grantPin("SALE_EDIT", UUID.saleB);
    await expect(NewSalePage({ searchParams: Promise.resolve({ sale_id: UUID.saleA }) })).rejects.toMatchObject({
      url: "/dashboard/sales?auth=required",
    });
    expect(h.svc.getSaleDetailById).not.toHaveBeenCalled();
  });

  it("con SALE_EDIT de la venta carga el DRAFT", async () => {
    await grantPin("SALE_EDIT", UUID.saleA);
    await NewSalePage({ searchParams: Promise.resolve({ sale_id: UUID.saleA }) });
    expect(h.svc.getSaleDetailById).toHaveBeenCalledWith(UUID.saleA, "tenant-A", "loc-1", runtime);
  });

  it("nueva venta sin sale_id sigue funcionando sin clave", async () => {
    await NewSalePage({ searchParams: Promise.resolve({}) });
    expect(h.svc.getSaleDetailById).not.toHaveBeenCalled();
  });
});
