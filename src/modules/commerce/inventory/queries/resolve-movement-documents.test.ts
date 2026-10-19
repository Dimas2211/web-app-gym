// ─────────────────────────────────────────────────────────────────
// commerce/inventory — resolve-movement-documents.test.ts
//
// Certifica que Documento y Correlativo son conceptos distintos:
// el correlativo interno (purchase_code / sale_code) nunca se usa
// como número de documento, y la resolución es por lote y por tenant.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { formatPurchaseDocument, resolveMovementDocuments } from "./resolve-movement-documents";

function fakeClient(opts: {
  purchases?: { id: string; purchase_code: string; document_number: string | null; document_series: string | null }[];
  sales?: { id: string; sale_code: string; dte_documents: { control_number: string | null }[] }[];
}) {
  return {
    purchase: { findMany: vi.fn().mockResolvedValue(opts.purchases ?? []) },
    sale: { findMany: vi.fn().mockResolvedValue(opts.sales ?? []) },
  };
}

describe("resolveMovementDocuments — compras", () => {
  it("3. compra FAC-2026-125 / correlativo 3 → Documento=FAC-2026-125, Correlativo=3", async () => {
    const client = fakeClient({
      purchases: [{ id: "pur-1", purchase_code: "3", document_number: "FAC-2026-125", document_series: null }],
    });
    const map = await resolveMovementDocuments(
      [{ id: "mv-1", reference_entity: "purchase", reference_id: "pur-1", reference_code: "3" }],
      "tenant-A",
      client as never,
    );
    expect(map.get("mv-1")).toEqual({ document_number: "FAC-2026-125", correlative: "3" });
  });

  it("4. compra sin document_number → Documento null (no se sustituye por purchase_code)", async () => {
    const client = fakeClient({
      purchases: [{ id: "pur-2", purchase_code: "7", document_number: null, document_series: "A" }],
    });
    const map = await resolveMovementDocuments(
      [{ id: "mv-2", reference_entity: "purchase", reference_id: "pur-2", reference_code: "7" }],
      "tenant-A",
      client as never,
    );
    expect(map.get("mv-2")).toEqual({ document_number: null, correlative: "7" });
  });

  it("anulación de compra resuelve los datos documentales de la compra original", async () => {
    const client = fakeClient({
      purchases: [{ id: "pur-3", purchase_code: "12", document_number: "125", document_series: "FAC" }],
    });
    const map = await resolveMovementDocuments(
      [{ id: "mv-3", reference_entity: "purchase_cancellation", reference_id: "pur-3", reference_code: "12" }],
      "tenant-A",
      client as never,
    );
    expect(map.get("mv-3")).toEqual({ document_number: "FAC-125", correlative: "12" });
  });

  it("consulta por lote filtrando tenant_id — una sola consulta para N movimientos", async () => {
    const client = fakeClient({
      purchases: [{ id: "pur-1", purchase_code: "3", document_number: "D1", document_series: null }],
    });
    await resolveMovementDocuments(
      [
        { id: "a", reference_entity: "purchase", reference_id: "pur-1", reference_code: "3" },
        { id: "b", reference_entity: "purchase", reference_id: "pur-1", reference_code: "3" },
        { id: "c", reference_entity: "purchase_cancellation", reference_id: "pur-1", reference_code: "3" },
      ],
      "tenant-A",
      client as never,
    );
    expect(client.purchase.findMany).toHaveBeenCalledTimes(1);
    expect(client.purchase.findMany.mock.calls[0][0].where).toEqual({ tenant_id: "tenant-A", id: { in: ["pur-1"] } });
    expect(client.sale.findMany).not.toHaveBeenCalled();
  });

  it("referencia a una compra que no pertenece al tenant no expone documento", async () => {
    const client = fakeClient({ purchases: [] }); // WHERE tenant_id no la encuentra
    const map = await resolveMovementDocuments(
      [{ id: "mv-x", reference_entity: "purchase", reference_id: "pur-of-B", reference_code: "9" }],
      "tenant-A",
      client as never,
    );
    expect(map.get("mv-x")?.document_number).toBeNull();
  });
});

describe("resolveMovementDocuments — ventas y otros", () => {
  it("venta: Documento = número de control DTE, Correlativo = sale_code", async () => {
    const client = fakeClient({
      sales: [{ id: "sale-1", sale_code: "V-2026-10-0001", dte_documents: [{ control_number: "DTE-01-M001P001-000000000000045" }] }],
    });
    const map = await resolveMovementDocuments(
      [{ id: "mv-s", reference_entity: "sale", reference_id: "sale-1", reference_code: "V-2026-10-0001" }],
      "tenant-A",
      client as never,
    );
    expect(map.get("mv-s")).toEqual({
      document_number: "DTE-01-M001P001-000000000000045",
      correlative: "V-2026-10-0001",
    });
    // Excluye NC 05 y DTE sin número de control
    const where = client.sale.findMany.mock.calls[0][0].select.dte_documents.where;
    expect(where).toMatchObject({ tenant_id: "tenant-A", dte_type_code: { not: "05" }, control_number: { not: null } });
  });

  it("venta sin DTE: sale_code nunca se usa como documento fiscal", async () => {
    const client = fakeClient({ sales: [{ id: "sale-2", sale_code: "V-2026-10-0002", dte_documents: [] }] });
    const map = await resolveMovementDocuments(
      [{ id: "mv-s2", reference_entity: "sale", reference_id: "sale-2", reference_code: "V-2026-10-0002" }],
      "tenant-A",
      client as never,
    );
    expect(map.get("mv-s2")).toEqual({ document_number: null, correlative: "V-2026-10-0002" });
  });

  it("carga inicial por onboarding: sin documento ni correlativo inventados", async () => {
    const map = await resolveMovementDocuments(
      [{ id: "mv-o", reference_entity: "DATA_ONBOARDING", reference_id: null, reference_code: "inventory_initial" }],
      "tenant-A",
      fakeClient({}) as never,
    );
    expect(map.get("mv-o")).toEqual({ document_number: null, correlative: null });
  });

  it("movimiento manual: solo la referencia escrita por el usuario", async () => {
    const map = await resolveMovementDocuments(
      [
        { id: "m1", reference_entity: null, reference_id: null, reference_code: "ACTA-12" },
        { id: "m2", reference_entity: null, reference_id: null, reference_code: null },
      ],
      "tenant-A",
      fakeClient({}) as never,
    );
    expect(map.get("m1")).toEqual({ document_number: "ACTA-12", correlative: null });
    expect(map.get("m2")).toEqual({ document_number: null, correlative: null });
  });
});

describe("formatPurchaseDocument", () => {
  it("une serie y número sin duplicar la serie", () => {
    expect(formatPurchaseDocument(null, "FAC-2026-125")).toBe("FAC-2026-125");
    expect(formatPurchaseDocument("A", "125")).toBe("A-125");
    expect(formatPurchaseDocument("FAC", "FAC-2026-125")).toBe("FAC-2026-125");
    expect(formatPurchaseDocument("A", "  ")).toBeNull();
  });
});
