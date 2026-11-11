import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db/prisma", () => ({ prisma: new Proxy({}, { get() { throw new Error("No global DB"); } }) }));
import { getSalesListReport } from "./get-sales-list-report";
import { getSalesLineReport } from "./get-sales-line-report";
import { getSalesByPeriod } from "./get-sales-by-period";
import { getCommerceReportSummary } from "./get-commerce-report-summary";
import { saleReportMovements, salesMovementCountsLabel } from "../utils/sales-report-movements";
import { groupSalesReportLines } from "../utils/group-sales-report-lines";

function fixture(overrides = {}) {
  return {
    id: "sale-1", tenant_id: "meta", location_id: "branch", sale_code: "VTA-0001",
    status: "CANCELLED", payment_status: "REFUNDED", sale_date: new Date("2026-11-11T00:00:00Z"),
    confirmed_at: new Date("2026-11-11T12:00:00Z"), cancelled_at: new Date("2026-11-11T23:00:00Z"),
    subtotal: 100, tax_amount: 13, total_amount: 113, customer_id: "c1", customer: { name: "Cliente" },
    _count: { items: 1 }, ...overrides,
  };
}
type Row = Record<string, unknown>;
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (value as Row[]).every((w) => matches(row, w));
    if (key === "OR") return (value as Row[]).some((w) => matches(row, w));
    if (value && typeof value === "object") {
      const op = value as Row;
      if ("not" in op) return row[key] !== op.not;
      if ("gte" in op || "lte" in op || "lt" in op) {
        if (!row[key]) return false;
        return (!("gte" in op) || Number(row[key]) >= Number(op.gte))
          && (!("lte" in op) || Number(row[key]) <= Number(op.lte))
          && (!("lt" in op) || Number(row[key]) < Number(op.lt));
      }
    }
    return row[key] === value;
  });
}
function dbFor(sales: ReturnType<typeof fixture>[]) {
  const read = vi.fn(async ({ where, take }: { where: Row; take?: number }) => sales.filter((r) => matches(r, where)).slice(0, take));
  const db = {
    sale: { findMany: read },
    saleItem: {
      findMany: vi.fn(async ({ where, take }: { where: Row; take?: number }) => sales.filter((r) => matches(r, where.sale as Row)).slice(0, take).map((sale) => ({
        id: `item-${sale.id}`, product_id: "p1", product_code_snapshot: "P1", product_name_snapshot: "Servicio",
        product_type_snapshot: "SERVICE", quantity: 2, unit_price: 50, line_subtotal: 100,
        tax_amount: 13, line_total: 113, sale, product: { cost_price: 0, category: null, line: null },
      }))),
      groupBy: vi.fn(async () => []),
    },
    purchase: { aggregate: vi.fn(async () => ({ _sum: { total_amount: 0 }, _count: { id: 0 } })) },
  };
  return { client: db as never, read };
}
const november = { tenant_id: "meta", location_id: "branch", date_from: "2026-11-01", date_to: "2026-11-30" };

describe("historial comercial de ventas y anulaciones", () => {
  it("muestra venta positiva y anulación negativa con el mismo correlativo; IVA y total netos cero", async () => {
    const { client } = dbFor([fixture()]);
    const list = await getSalesListReport(november, client);
    expect(list).toHaveLength(2);
    expect(list.map((r) => [r.sale_code, r.movement_type, r.tax_amount, r.total_amount])).toEqual([
      ["VTA-0001", "SALE", 13, 113], ["VTA-0001", "CANCELLATION", -13, -113],
    ]);
    expect(new Set(list.map((r) => r.movement_id)).size).toBe(2);
    const summary = await getCommerceReportSummary(november, client);
    expect(summary).toMatchObject({ total_sales: 0, gross_sales: 113, cancelled_sales: 113, sales_count: 1, cancellations_count: 1 });
    expect(await getSalesByPeriod(november, client)).toEqual([{ date: "2026-11-11", total: 0, gross_sales: 113, cancelled_sales: 113 }]);
  });

  it("separa grupos de detalle para no mezclar una venta con su propia anulación", async () => {
    const { client } = dbFor([fixture()]);
    const lines = await getSalesLineReport(november, client);
    expect(lines.map((r) => [r.quantity, r.line_total, r.cost_estimate])).toEqual([[2, 113, 0], [-2, -113, 0]]);
    expect(groupSalesReportLines(lines)).toHaveLength(2);
    expect(salesMovementCountsLabel(lines)).toBe("1 venta · 1 anulación");
  });

  it("anulación en otro mes: conserva la venta en noviembre y registra la reversa en diciembre", async () => {
    const { client } = dbFor([fixture({ cancelled_at: new Date("2026-12-02T20:00:00Z") })]);
    const december = { ...november, date_from: "2026-12-01", date_to: "2026-12-31" };
    expect((await getSalesListReport(november, client)).map((r) => r.total_amount)).toEqual([113]);
    expect((await getSalesListReport(december, client)).map((r) => [r.sale_date, r.total_amount, r.original_sale_date])).toEqual([["2026-12-02", -113, "2026-11-11"]]);
    expect((await getCommerceReportSummary(december, client)).total_sales).toBe(-113);
  });

  it("respeta medianoche en El Salvador y el límite exclusivo de fin de período", async () => {
    const cancelled_at = new Date("2026-12-01T02:00:00Z"); // Nov 30 20:00 SV
    const { client } = dbFor([fixture({ sale_date: new Date("2026-10-10T00:00:00Z"), cancelled_at })]);
    expect((await getSalesListReport(november, client)).map((r) => [r.sale_date, r.total_amount])).toEqual([["2026-11-30", -113]]);
    const cutoff = dbFor([fixture({ cancelled_at: new Date("2026-12-01T06:00:00Z") })]);
    expect((await getSalesListReport(november, cutoff.client)).map((r) => r.movement_type)).toEqual(["SALE"]);
  });

  it("excluye borradores anulados y no convierte una invalidación fiscal en anulación comercial", async () => {
    const { client } = dbFor([
      fixture({ id: "draft", confirmed_at: null }),
      fixture({ id: "current", status: "CONFIRMED", cancelled_at: null }),
    ]);
    expect((await getSalesListReport(november, client)).map((r) => r.sale_id)).toEqual(["current"]);
    expect(saleReportMovements(fixture({ status: "DRAFT" }), november.date_from, november.date_to)).toEqual([]);
  });

  it("mantiene aislamiento por tenant/sucursal/cliente y conserva pares al limitar documentos", async () => {
    const { client, read } = dbFor([fixture(), fixture({ id: "foreign", tenant_id: "other" }), fixture({ id: "branch2", location_id: "other" })]);
    expect(await getSalesListReport({ ...november, limit: 1 }, client)).toHaveLength(2);
    expect(read.mock.calls[0][0].where).toMatchObject({ tenant_id: "meta", location_id: "branch" });
    expect(await getSalesListReport({ ...november, customer_id: "other" }, client)).toEqual([]);
  });
});
