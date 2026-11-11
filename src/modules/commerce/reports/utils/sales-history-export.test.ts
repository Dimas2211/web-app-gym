import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SalesListRow, SalesLineReportRow } from "../types/commerce-report.types";

const { tables, saved, written } = vi.hoisted(() => ({ tables: vi.fn(), saved: vi.fn(), written: vi.fn() }));
vi.mock("jspdf-autotable", () => ({ autoTable: tables }));
vi.mock("jspdf", async (original) => {
  const actual = await original<typeof import("jspdf")>();
  return { ...actual, default: class extends actual.default {
    constructor(...args: ConstructorParameters<typeof actual.default>) { super(...args); this.save = saved; }
  } };
});
vi.mock("xlsx", async (original) => ({ ...await original<typeof import("xlsx")>(), writeFile: written }));
import { exportSalesListPdf, exportSalesPdf } from "./export-report-pdf";
import { exportSalesListExcel, exportSalesExcel } from "./export-report-excel";
import { utils as xlsxUtils } from "xlsx";
const filters = { date_from: "2026-11-01", date_to: "2026-11-30" };
const rows: SalesListRow[] = [1, -1].map((sign) => ({
  movement_id: `s1:${sign}`, movement_type: sign === 1 ? "SALE" : "CANCELLATION",
  original_sale_date: "2026-11-11", sale_id: "s1", sale_code: "VTA-0010", sale_date: "2026-11-11",
  customer_name: "Cliente", status: "CANCELLED", payment_status: "REFUNDED", item_count: sign,
  subtotal: sign * 100, tax_amount: sign * 13, total_amount: sign * 113, location_id: "branch",
}));
const lines: SalesLineReportRow[] = rows.map((row) => ({
  movement_id: row.movement_id, movement_type: row.movement_type, original_sale_date: row.original_sale_date,
  id: `line:${row.movement_id}`, sale_code: row.sale_code, sale_date: row.sale_date, customer_name: row.customer_name,
  product_code: "P1", product_name: "Servicio", product_type: "SERVICE", category_name: null, line_name: null,
  quantity: row.item_count, unit_price: 100, line_subtotal: row.subtotal, tax_amount: row.tax_amount,
  line_total: row.total_amount, cost_estimate: 0, margin_estimate: row.total_amount, location_id: "branch",
}));
beforeEach(() => vi.clearAllMocks());
describe("trazabilidad de ventas en PDF y Excel", () => {
  it("PDF listado conserva venta y anulación, signo y total neto", () => {
    exportSalesListPdf(rows, filters);
    const table = tables.mock.calls[0][1];
    expect(table.head[0]).toContain("Movimiento");
    expect(table.body.map((row: string[]) => row[1])).toEqual(["Venta", "Anulación"]);
    expect(table.body[1]).toContain("-$113.00");
    expect(table.foot[0].at(-1)).toBe("$0.00");
    expect(saved).toHaveBeenCalledOnce();
  });
  it("PDF detalle separa las dos cabeceras aunque compartan código de venta", () => {
    exportSalesPdf(lines, filters);
    const body = tables.mock.calls[0][1].body;
    expect(body).toHaveLength(4);
    expect(body[0][0].content).toContain("Venta");
    expect(body[0][0].colSpan).toBe(12);
    expect(body[2][0].content).toContain("Anulación");
    expect(body[3]).toContain("-$113.00");
  });
  it("Excel listado contiene números negativos reales y neto cero", () => {
    exportSalesListExcel(rows, filters);
    const workbook = written.mock.calls[0][0];
    const values = xlsxUtils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as unknown[][];
    const original = values.find((row) => row[1] === "Venta")!;
    const reverse = values.find((row) => row[1] === "Anulación")!;
    expect(original.at(-1)).toBe(113);
    expect(reverse.at(-1)).toBe(-113);
    expect(values.at(-1)!.at(-1)).toBe(0);
  });
  it("Excel detalle conserva ambos movimientos en grupos distintos", () => {
    exportSalesExcel(lines, filters);
    const workbook = written.mock.calls[0][0];
    const values = xlsxUtils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as unknown[][];
    expect(values.some((row) => typeof row[0] === "string" && row[0].startsWith("Anulación"))).toBe(true);
    expect(values.some((row) => row[9] === -113)).toBe(true);
  });
});
