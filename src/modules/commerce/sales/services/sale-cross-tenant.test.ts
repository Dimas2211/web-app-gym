// ─────────────────────────────────────────────────────────────────
// commerce/sales — sale-cross-tenant.test.ts
//
// Certifica que el aislamiento por tenant/location de Sales nace del
// propio WHERE (tenant_id + location_id), no de una capa adicional —
// un sale_id/product_id/customer_id de OTRO tenant nunca es visible
// ni mutable, aunque el ID sea válido en su propia base.
//
// Modelado sobre inventory-cross-tenant.test.ts (FASE VI-D3): no usa
// una DB real, cada test inyecta un `db` falso mínimo que simula
// exactamente lo que Postgres devolvería (fila inexistente) cuando el
// WHERE tenant_id/location_id no matchea.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import {
  createSaleDraft,
  addSaleItemToDraft,
  updateSaleItemInDraft,
  removeSaleItemFromDraft,
  confirmSale,
  cancelDraftSale,
} from "./sale.service";

describe("sale.service — aislamiento cross-tenant", () => {
  it("createSaleDraft: customer_id pertenece a OTRO tenant -> denegado (findFirst con tenant_id no lo encuentra)", async () => {
    const fakeDb = {
      customer: { findFirst: vi.fn().mockResolvedValue(null) }, // tenant A busca customer de tenant B -> no existe para A
      $transaction: vi.fn(),
    } as never;

    const result = await createSaleDraft(
      "tenant-A",
      "location-A1",
      "user-1",
      { customer_id: "customer-of-tenant-B", sale_date: "2026-01-15" } as never,
      fakeDb,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("customer_id");
    expect((fakeDb as { $transaction: ReturnType<typeof vi.fn> }).$transaction).not.toHaveBeenCalled();
  });

  it("addSaleItemToDraft: sale_id pertenece a OTRO tenant/location -> denegado, producto nunca se consulta", async () => {
    const saleFindFirst    = vi.fn().mockResolvedValue(null); // tenant A busca sale de tenant B -> no existe para A
    const productFindFirst = vi.fn();

    const fakeDb = {
      sale:    { findFirst: saleFindFirst },
      product: { findFirst: productFindFirst },
      $transaction: vi.fn(),
    } as never;

    const result = await addSaleItemToDraft(
      "sale-of-tenant-B",
      "tenant-A",
      "location-A1",
      "user-1",
      { product_id: "prod-1", quantity: 1, unit_price: 10 } as never,
      fakeDb,
    );

    expect(result.ok).toBe(false);
    expect(productFindFirst).not.toHaveBeenCalled();
  });

  it("addSaleItemToDraft: sale propia de tenant A pero product_id de OTRO tenant -> denegado, sin crear línea", async () => {
    const saleFindFirst = vi.fn().mockResolvedValue({ id: "sale-A1", status: "DRAFT" });
    const productFindFirst = vi.fn().mockResolvedValue(null); // producto de tenant B -> no existe para A
    const transactionSpy = vi.fn();

    const fakeDb = {
      sale:    { findFirst: saleFindFirst },
      product: { findFirst: productFindFirst },
      $transaction: transactionSpy,
    } as never;

    const result = await addSaleItemToDraft(
      "sale-A1",
      "tenant-A",
      "location-A1",
      "user-1",
      { product_id: "product-of-tenant-B", quantity: 1, unit_price: 10 } as never,
      fakeDb,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("product_id");
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it("updateSaleItemInDraft: sale_id de OTRO tenant -> denegado, línea nunca se consulta", async () => {
    const saleFindFirst = vi.fn().mockResolvedValue(null);
    const itemFindFirst  = vi.fn();

    const fakeDb = {
      sale:     { findFirst: saleFindFirst },
      saleItem: { findFirst: itemFindFirst },
      $transaction: vi.fn(),
    } as never;

    const result = await updateSaleItemInDraft(
      "item-1",
      "sale-of-tenant-B",
      "tenant-A",
      "location-A1",
      "user-1",
      { quantity: 2 } as never,
      fakeDb,
    );

    expect(result.ok).toBe(false);
    expect(itemFindFirst).not.toHaveBeenCalled();
  });

  it("removeSaleItemFromDraft: sale_id de OTRA location del mismo tenant -> denegado, delete nunca se invoca", async () => {
    const saleFindFirst = vi.fn().mockResolvedValue(null); // sale existe pero en location-A2, no location-A1
    const transactionSpy = vi.fn();

    const fakeDb = {
      sale: { findFirst: saleFindFirst },
      $transaction: transactionSpy,
    } as never;

    const result = await removeSaleItemFromDraft(
      "item-1",
      "sale-of-other-location",
      "tenant-A",
      "location-A1",
      "user-1",
      fakeDb,
    );

    expect(result.ok).toBe(false);
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it("confirmSale: sale_id pertenece a OTRO tenant -> denegado, transacción (SALE_OUT + pagos) nunca se abre", async () => {
    const saleFindFirst  = vi.fn().mockResolvedValue(null); // tenant A busca sale de tenant B -> no existe para A
    const transactionSpy = vi.fn();

    const fakeDb = {
      sale: { findFirst: saleFindFirst },
      $transaction: transactionSpy,
    } as never;

    const result = await confirmSale("sale-of-tenant-B", "tenant-A", "location-A1", "user-1", fakeDb);

    expect(result.ok).toBe(false);
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it("confirmSale: la transacción de reclamo + SALE_OUT + pago nace de `db` (runtime) — nunca prisma global mezclado", async () => {
    const saleFindFirst = vi.fn().mockResolvedValue({
      id: "sale-A1",
      status: "DRAFT",
      sale_code: "VTA-2026-01-0001",
      total_amount: 0,
      payment_method_code: null,
      primary_dte_type_code: "01",
      customer_id: null,
      inventory_moved: false,
      items: [{
        id: "item-1",
        product_id: "prod-1",
        product_name_snapshot: "Producto 1",
        quantity: 1,
        unit_price: 10,
        line_total: 10,
        is_stockable_snapshot: false, // sin líneas stockables -> no toca productLocation
      }],
    });

    const claimUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const dbTransactionSpy = vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        sale: { updateMany: claimUpdateMany },
        salePayment: { create: vi.fn() },
        productLocation: { updateMany: vi.fn(), findFirst: vi.fn() },
        inventoryMovement: { create: vi.fn() },
      }),
    );

    const fakeDb = {
      sale: { findFirst: saleFindFirst },
      productLocation: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: dbTransactionSpy,
    } as never;

    const result = await confirmSale("sale-A1", "tenant-A", "location-A1", "user-1", fakeDb);

    expect(result.ok).toBe(true);
    expect(dbTransactionSpy).toHaveBeenCalledTimes(1);
  });

  it("cancelDraftSale: sale_id de OTRO tenant -> denegado, update nunca se invoca", async () => {
    const saleFindFirst = vi.fn().mockResolvedValue(null);
    const updateSpy = vi.fn();

    const fakeDb = {
      sale: { findFirst: saleFindFirst, update: updateSpy },
    } as never;

    const result = await cancelDraftSale("sale-of-tenant-B", "tenant-A", "location-A1", "user-1", fakeDb);

    expect(result.ok).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
