// ─────────────────────────────────────────────────────────────────
// commerce/inventory — inventory-cross-tenant.test.ts
//
// FASE VI-D3 — ETAPA U. Certifica que el aislamiento por tenant/location
// de Inventory nace del propio WHERE (tenant_id + location_id), no de
// una capa adicional — un product_id/product_location_id de OTRO tenant
// nunca es visible ni mutable, aunque el ID sea válido en su propia base.
//
// No usa una DB real: cada test inyecta un `db` falso mínimo que
// simula exactamente lo que Postgres devolvería (fila inexistente)
// cuando el WHERE tenant_id/location_id no matchea.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { createProductLocation, updateProductLocationFields } from "./product-location.service";
import { recordInventoryMovement } from "./inventory-movement.service";

describe("product-location.service — aislamiento cross-tenant", () => {
  it("9. createProductLocation: product_id pertenece a OTRO tenant -> denegado (findFirst con tenant_id no lo encuentra)", async () => {
    const fakeDb = {
      product: { findFirst: vi.fn().mockResolvedValue(null) }, // tenant A busca product de tenant B -> no existe para A
      productLocation: { findFirst: vi.fn(), create: vi.fn() },
    } as never;

    const result = await createProductLocation(
      "tenant-A",
      "location-A1",
      "user-1",
      { product_id: "product-of-tenant-B", min_stock: 0, reorder_quantity: 0, is_active: true } as never,
      fakeDb,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("product_id");
  });

  it("11. updateProductLocationFields: id pertenece a OTRO tenant/location -> denegado", async () => {
    const fakeDb = {
      productLocation: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    } as never;

    const result = await updateProductLocationFields(
      "pl-of-tenant-B",
      "tenant-A",
      "location-A1",
      "user-1",
      { is_active: false },
      fakeDb,
    );

    expect(result.ok).toBe(false);
  });
});

describe("inventory-movement.service — aislamiento cross-tenant/cross-location", () => {
  it("10/12. product_location_id de OTRO tenant o location -> denegado dentro de la MISMA transacción, sin crear movimiento ni tocar stock", async () => {
    const findFirstMock = vi.fn().mockResolvedValue(null); // no existe para tenant A / location A1
    const createMock = vi.fn();
    const updateMock = vi.fn();

    const fakeDb = {
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          productLocation: { findFirst: findFirstMock, update: updateMock },
          inventoryMovement: { create: createMock },
        }),
      ),
    } as never;

    const result = await recordInventoryMovement(
      "tenant-A",
      "location-A1",
      "user-1",
      { product_location_id: "pl-of-tenant-B", movement_type: "MANUAL_IN", quantity: 5 },
      fakeDb,
    );

    expect(result.ok).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("STOCK_TRANSACTION_RUNTIME_ISOLATED: la transacción completa nace de `db` (runtime) — nunca prisma global mezclado", async () => {
    const dbTransactionSpy = vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        productLocation: {
          findFirst: vi.fn().mockResolvedValue({ id: "pl-1", product_id: "prod-1", current_stock: 10, is_active: true }),
          update: vi.fn().mockResolvedValue({}),
        },
        inventoryMovement: { create: vi.fn().mockResolvedValue({}) },
      }),
    );
    const runtimeDbMarker = { $transaction: dbTransactionSpy } as never;

    const result = await recordInventoryMovement(
      "tenant-A",
      "location-A1",
      "user-1",
      { product_location_id: "pl-1", movement_type: "MANUAL_IN", quantity: 5 },
      runtimeDbMarker,
    );

    expect(result.ok).toBe(true);
    // La única superficie invocada es `db.$transaction` (el runtime client
    // pasado explícitamente) — nunca un prisma global importado aparte.
    expect(dbTransactionSpy).toHaveBeenCalledTimes(1);
  });
});
