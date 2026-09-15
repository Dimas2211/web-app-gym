// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase-cross-tenant.test.ts
//
// Certifica que el aislamiento por tenant/location de Purchases nace
// del propio WHERE (tenant_id + location_id) pasado a `db`, no de una
// capa adicional — un purchase_id de OTRO tenant nunca es legible ni
// mutable desde tenant A, aunque el ID sea válido en su propia base.
//
// Modelado sobre inventory-cross-tenant.test.ts (FASE VI-D3, commit
// b9d6ea2): cada test inyecta un `db` falso mínimo que simula
// exactamente lo que Postgres devolvería (fila inexistente) cuando
// el WHERE tenant_id/location_id no matchea.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import {
  addPurchaseItem,
  confirmPurchase,
  cancelConfirmedPurchase,
} from "./purchase.service";
import { getPurchaseById } from "../queries/get-purchase-by-id";

describe("purchase.service — aislamiento cross-tenant", () => {
  it("addPurchaseItem: purchase_id pertenece a OTRO tenant -> denegado (findFirst con tenant_id no lo encuentra)", async () => {
    const findFirstMock = vi.fn().mockResolvedValue(null); // tenant A busca purchase de tenant B -> no existe para A
    const fakeDb = {
      purchase: { findFirst: findFirstMock },
    } as never;

    const result = await addPurchaseItem(
      "purchase-of-tenant-B",
      "tenant-A",
      "location-A1",
      "user-1",
      { product_id: "prod-1", quantity: 1, unit_cost: 10, tax_amount: 0 } as never,
      fakeDb,
    );

    expect(result.ok).toBe(false);
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "purchase-of-tenant-B",
          tenant_id: "tenant-A",
          location_id: "location-A1",
        }),
      }),
    );
  });

  it("confirmPurchase: purchase_id pertenece a OTRO tenant -> denegado, sin abrir transacción de stock", async () => {
    const transactionSpy = vi.fn();
    const fakeDb = {
      purchase: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: transactionSpy,
    } as never;

    const result = await confirmPurchase(
      "purchase-of-tenant-B",
      "tenant-A",
      "location-A1",
      "user-1",
      fakeDb,
    );

    expect(result.ok).toBe(false);
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it("cancelConfirmedPurchase: purchase_id pertenece a OTRO tenant -> denegado, sin reversión de inventario", async () => {
    const transactionSpy = vi.fn();
    const fakeDb = {
      purchase: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: transactionSpy,
    } as never;

    const result = await cancelConfirmedPurchase(
      "purchase-of-tenant-B",
      "tenant-A",
      "location-A1",
      "user-1",
      fakeDb,
    );

    expect(result.ok).toBe(false);
    expect(transactionSpy).not.toHaveBeenCalled();
  });
});

describe("get-purchase-by-id — aislamiento cross-tenant", () => {
  it("purchase_id pertenece a OTRO tenant -> devuelve null (WHERE tenant_id/location_id no matchea)", async () => {
    const findFirstMock = vi.fn().mockResolvedValue(null);
    const fakeClient = {
      purchase: { findFirst: findFirstMock },
    } as never;

    const result = await getPurchaseById("purchase-of-tenant-B", "tenant-A", "location-A1", fakeClient);

    expect(result).toBeNull();
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "purchase-of-tenant-B", tenant_id: "tenant-A", location_id: "location-A1" },
      }),
    );
  });
});
