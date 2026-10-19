// ─────────────────────────────────────────────────────────────────
// commerce/inventory — get-product-movement-report.test.ts
//
// Consulta individual por producto: aislamiento tenant/sucursal,
// filtro exclusivo por producto, orden cronológico determinista,
// período en hora de El Salvador y exportación sin truncado silencioso.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { getProductMovementReport } from "./get-product-movement-report";
import { MOVEMENT_EXPORT_MAX_ROWS } from "./get-inventory-movements";

const BOTELLA = { id: "11111111-1111-1111-1111-111111111111", product_code: "P-001", name: "BOTELLA DE AGUA" };
const BRANCH = {
  id: "loc-A1", tenant_id: "tenant-A", name: "Sucursal Centro", address: null, phone: null,
  status: "active", created_at: new Date(), updated_at: new Date(),
};

function movement(id: string, iso: string, type: string, qty: number, before: number, after: number, extra = {}) {
  return {
    id, tenant_id: "tenant-A", location_id: "loc-A1", product_id: BOTELLA.id, product_location_id: "pl-1",
    movement_type: type, quantity: qty, unit_cost: null, stock_before: before, resulting_stock: after,
    reference_entity: null, reference_id: null, reference_code: null, notes: null, performed_by: "u1",
    created_at: new Date(iso), product: { product_code: BOTELLA.product_code, name: BOTELLA.name },
    performed_by_user: { first_name: "Ana", last_name: "López" }, ...extra,
  };
}

function fakeClient(opts: { product?: typeof BOTELLA | null; rows?: unknown[]; total?: number }) {
  const findMany = vi.fn().mockResolvedValue(opts.rows ?? []);
  const count = vi.fn().mockResolvedValue(opts.total ?? (opts.rows?.length ?? 0));
  return {
    product: { findFirst: vi.fn().mockResolvedValue(opts.product === undefined ? BOTELLA : opts.product) },
    branch: { findFirst: vi.fn().mockResolvedValue(BRANCH) },
    inventoryMovement: { findMany, count },
    purchase: {
      findMany: vi.fn().mockResolvedValue([
        { id: "pur-1", purchase_code: "3", document_number: "FAC-2026-125", document_series: null },
      ]),
    },
    sale: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  };
}

describe("getProductMovementReport", () => {
  it("1. BOTELLA DE AGUA: consulta solo sus movimientos, en tenant y sucursal del servidor", async () => {
    const client = fakeClient({
      rows: [
        movement("m1", "2026-10-01T15:00:00Z", "PURCHASE_IN", 10, 0, 10,
          { reference_entity: "purchase", reference_id: "pur-1", reference_code: "3" }),
        movement("m2", "2026-10-02T15:00:00Z", "PURCHASE_IN", 25, 10, 35),
      ],
    });
    const res = await getProductMovementReport(
      { tenantId: "tenant-A", locationId: "loc-A1", productId: BOTELLA.id },
      client as never,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const args = client.inventoryMovement.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ tenant_id: "tenant-A", location_id: "loc-A1", product_id: BOTELLA.id });
    expect(args.orderBy).toEqual([{ created_at: "asc" }, { id: "asc" }]);

    expect(res.report.product).toEqual(BOTELLA);
    expect(res.report.location).toEqual({ id: "loc-A1", name: "Sucursal Centro" });
    expect(res.report.items.map((i) => i.product_name)).toEqual(["BOTELLA DE AGUA", "BOTELLA DE AGUA"]);
    // Saldos históricos por movimiento — no se suman
    expect(res.report.items.map((i) => [i.stock_before, i.resulting_stock])).toEqual([[0, 10], [10, 35]]);
    // Documento ≠ Correlativo
    expect(res.report.items[0].document_number).toBe("FAC-2026-125");
    expect(res.report.items[0].correlative).toBe("3");
    // Hora de El Salvador (UTC-6)
    expect(res.report.items[0].created_at_label).toBe("01/10/2026 09:00");
  });

  it("12. producto de otro tenant → no encontrado y sin leer movimientos", async () => {
    const client = fakeClient({ product: null });
    const res = await getProductMovementReport(
      { tenantId: "tenant-A", locationId: "loc-A1", productId: "product-of-tenant-B" },
      client as never,
    );
    expect(res).toMatchObject({ ok: false, code: "PRODUCT_NOT_FOUND" });
    expect(client.product.findFirst.mock.calls[0][0].where).toEqual({ id: "product-of-tenant-B", tenant_id: "tenant-A" });
    expect(client.inventoryMovement.findMany).not.toHaveBeenCalled();
  });

  it("período Desde/Hasta cubre el día local completo de El Salvador", async () => {
    const client = fakeClient({});
    await getProductMovementReport(
      { tenantId: "tenant-A", locationId: "loc-A1", productId: BOTELLA.id, dateFrom: "2026-10-01", dateTo: "2026-10-31", movementType: "SALE_OUT" },
      client as never,
    );
    const where = client.inventoryMovement.findMany.mock.calls[0][0].where;
    expect(where.created_at.gte.toISOString()).toBe("2026-10-01T06:00:00.000Z");
    expect(where.created_at.lte.toISOString()).toBe("2026-11-01T05:59:59.999Z");
    expect(where.movement_type).toBe("SALE_OUT");
  });

  it("paginación en pantalla: page 3 de 50 → skip 100, total real informado", async () => {
    const client = fakeClient({ total: 1234 });
    const res = await getProductMovementReport(
      { tenantId: "tenant-A", locationId: "loc-A1", productId: BOTELLA.id, page: 3 },
      client as never,
    );
    const args = client.inventoryMovement.findMany.mock.calls[0][0];
    expect(args.skip).toBe(100);
    expect(args.take).toBe(50);
    expect(res.ok && res.report.total).toBe(1234);
    expect(res.ok && res.report.total_pages).toBe(25);
  });

  it("14. exportación con más filas que el límite → rechazo explícito, nunca archivo parcial", async () => {
    const client = fakeClient({ total: MOVEMENT_EXPORT_MAX_ROWS + 1 });
    const res = await getProductMovementReport(
      { tenantId: "tenant-A", locationId: "loc-A1", productId: BOTELLA.id, exportAll: true },
      client as never,
    );
    expect(res).toMatchObject({ ok: false, code: "EXPORT_TOO_LARGE", total: MOVEMENT_EXPORT_MAX_ROWS + 1 });
  });

  it("exportación de 600 movimientos (> 500 de la grilla) trae todas las filas", async () => {
    const rows = Array.from({ length: 600 }, (_, i) =>
      movement(`m${i}`, "2026-10-01T15:00:00Z", "MANUAL_IN", 1, i, i + 1));
    const client = fakeClient({ rows, total: 600 });
    const res = await getProductMovementReport(
      { tenantId: "tenant-A", locationId: "loc-A1", productId: BOTELLA.id, exportAll: true },
      client as never,
    );
    const args = client.inventoryMovement.findMany.mock.calls[0][0];
    expect(args.take).toBe(MOVEMENT_EXPORT_MAX_ROWS);
    expect(args.skip).toBe(0);
    expect(res.ok && res.report.items.length).toBe(600);
  });
});
