// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase.service.confirm-atomicity.test.ts
//
// FASE VI-D6: certifica que confirmPurchase ya NO deja un
// ProductLocation huérfano si la transacción falla después de
// asegurar el registro de inventario. Antes de este fix, el upsert de
// ProductLocation corría en `db` (fuera de la tx); ahora corre en
// `tx` (dentro de la misma `db.$transaction` que marca CONFIRMED y
// registra los movimientos) — o todo el efecto de negocio ocurre, o
// nada, incluido el ProductLocation.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { confirmPurchase } from "./purchase.service";

describe("confirmPurchase — atomicidad ProductLocation + movimiento + status", () => {
  it("el upsert de ProductLocation ocurre DENTRO de db.$transaction, nunca en `db` directamente", async () => {
    const upsertOnDbSpy = vi.fn(); // no debe llamarse nunca
    const upsertOnTxSpy = vi.fn().mockResolvedValue({ id: "pl-1", is_active: true });

    const fakeDb = {
      purchase: {
        findFirst: vi.fn().mockResolvedValue({
          id: "purchase-1",
          status: "DRAFT",
          purchase_code: "C-0001",
          document_type: "FAC",
          payment_nature: null,
          items: [
            {
              id: "item-1",
              product_id: "prod-1",
              quantity: 5,
              unit_cost: 10,
              product: { is_stockable: true, allow_purchase: true, status: "ACTIVE" },
            },
          ],
        }),
      },
      productLocation: { upsert: upsertOnDbSpy }, // fuera de tx — no debe usarse
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<void>) => {
        const tx = {
          purchase: { update: vi.fn().mockResolvedValue({}) },
          productLocation: {
            upsert: upsertOnTxSpy,
            findFirst: vi.fn().mockResolvedValue({ current_stock: 0, is_active: true }),
            update: vi.fn().mockResolvedValue({}),
          },
          inventoryMovement: { create: vi.fn().mockResolvedValue({}) },
        };
        return cb(tx);
      }),
    } as never;

    const result = await confirmPurchase("purchase-1", "tenant-A", "location-A1", "user-1", fakeDb);

    expect(result.ok).toBe(true);
    expect(upsertOnDbSpy).not.toHaveBeenCalled();
    expect(upsertOnTxSpy).toHaveBeenCalledTimes(1);
  });

  it("si el registro de movimiento falla, el rollback revierte TODO — incluido el ProductLocation recién creado por el upsert", async () => {
    const fakeDb = {
      purchase: {
        findFirst: vi.fn().mockResolvedValue({
          id: "purchase-1",
          status: "DRAFT",
          purchase_code: "C-0001",
          document_type: "FAC",
          payment_nature: null,
          items: [
            {
              id: "item-1",
              product_id: "prod-1",
              quantity: 5,
              unit_cost: 10,
              product: { is_stockable: true, allow_purchase: true, status: "ACTIVE" },
            },
          ],
        }),
      },
      productLocation: { upsert: vi.fn() }, // fuera de tx — no debe usarse
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<void>) => {
        // Simula el comportamiento real de Prisma: si el callback lanza,
        // $transaction rechaza y NINGUNA escritura hecha dentro de tx
        // (incluido el upsert) persiste — por eso basta con verificar que
        // el error se propaga y que el upsert "de fuera" jamás se invocó.
        const tx = {
          purchase: { update: vi.fn().mockResolvedValue({}) },
          productLocation: {
            upsert: vi.fn().mockResolvedValue({ id: "pl-1", is_active: true }),
            findFirst: vi.fn().mockResolvedValue({ current_stock: 0, is_active: true }),
            update: vi.fn().mockResolvedValue({}),
          },
          inventoryMovement: {
            create: vi.fn().mockRejectedValue(new Error("fallo simulado de escritura")),
          },
        };
        return cb(tx);
      }),
    } as never;

    const result = await confirmPurchase("purchase-1", "tenant-A", "location-A1", "user-1", fakeDb);

    expect(result.ok).toBe(false);
    expect((fakeDb as { productLocation: { upsert: ReturnType<typeof vi.fn> } }).productLocation.upsert).not.toHaveBeenCalled();
  });
});
