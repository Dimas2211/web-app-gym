// ─────────────────────────────────────────────────────────────────
// commerce/sales — get-sale-detail-by-id.dte-json.test.ts
//
// has_json_document se deriva en servidor para el DTE de la venta y
// para la NC relacionada (ids distintos), y el JSON completo nunca
// viaja en SaleDetail.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { getSaleDetailById } from "./get-sale-detail-by-id";

function baseRow(dteDocuments: unknown[]) {
  const now = new Date("2026-11-01T12:00:00Z");
  return {
    id: "sale-1", tenant_id: "t", location_id: "l", customer_id: null, customer: null,
    sale_code: "VTA-2026-11-0002", sale_year: 2026, sale_month: 11, sale_sequence: 2,
    sale_date: now, status: "CONFIRMED", payment_status: "PAID",
    primary_dte_type_code: "03", payment_method_code: null, condition_operation_code: null,
    payment_term_code: null, payment_term_value: null,
    subtotal: 10, discount_amount: 0, tax_amount: 1.3, total_amount: 11.3,
    inventory_moved: true, cash_session_id: null, notes: null,
    confirmed_at: null, confirmed_by: null, confirmed_by_user: null,
    cancelled_at: null, cancelled_by: null, cancelled_by_user: null,
    created_at: now, created_by: null, created_by_user: null,
    updated_at: now, updated_by: null, updated_by_user: null,
    items: [],
    dte_documents: dteDocuments,
  };
}

function dteRow(over: Record<string, unknown>) {
  return {
    id: "dte-ccfe", dte_type_code: "03", generation_code: "G", control_number: "C",
    reception_stamp: "S", dte_status: "ACCEPTED", environment: "TEST", rejection_reason: null,
    issued_at: null, accepted_at: null, rejected_at: null, invalidated_at: null,
    created_at: new Date(), json_document: { identificacion: { tipoDte: "03" } },
    related_in_relations: [], transmission_logs: [], invalidation_events: [],
    ...over,
  };
}

function clientWith(row: unknown) {
  return { sale: { findFirst: vi.fn(async () => row) } } as never;
}

describe("getSaleDetailById — has_json_document", () => {
  it("DTE con JSON y NC sin JSON: flags independientes por documento", async () => {
    const row = baseRow([dteRow({
      related_in_relations: [{
        source_document: {
          id: "dte-nc", dte_type_code: "05", control_number: "NC-C", generation_code: "NC-G",
          dte_status: "GENERATED", reception_stamp: null, created_at: new Date(), json_document: null,
        },
      }],
    })]);

    const detail = await getSaleDetailById("sale-1", "t", "l", clientWith(row));

    expect(detail!.dte_document!.id).toBe("dte-ccfe");
    expect(detail!.dte_document!.has_json_document).toBe(true);
    expect(detail!.dte_related_nc!.id).toBe("dte-nc");
    expect(detail!.dte_related_nc!.has_json_document).toBe(false);

    // El contenido nunca viaja en SaleDetail.
    expect(JSON.stringify(detail)).not.toContain("tipoDte");
    expect(detail!.dte_document).not.toHaveProperty("json_document");
  });

  it("DTE sin JSON (PENDING_GENERATION) → has_json_document=false", async () => {
    const row = baseRow([dteRow({ dte_status: "PENDING_GENERATION", json_document: null })]);
    const detail = await getSaleDetailById("sale-1", "t", "l", clientWith(row));
    expect(detail!.dte_document!.has_json_document).toBe(false);
  });
});
