// ─────────────────────────────────────────────────────────────────
// commerce/inventory — export-inventory-movement-report.test.ts
//
// Fila normalizada común a pantalla, Excel y PDF: tipos en español,
// Documento y Correlativo separados, entradas/salidas numéricas.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  MOVEMENT_REPORT_COLUMNS,
  buildMovementReportHeader,
  describeMovementPeriod,
  formatMovementCost,
  formatMovementQty,
  toMovementExportRow,
} from "./export-inventory-movement-report";
import { ALL_MOVEMENT_TYPES, getMovementTypeLabel, MOVEMENT_TYPE_LABELS } from "./inventory-movement-labels";
import { formatSvDateTime, isValidDateParam, svStartOfDay } from "./sv-datetime";
import type { InventoryMovementItem } from "../types/inventory-movement.types";
import type { ProductMovementReport } from "../queries/get-product-movement-report";

function item(over: Partial<InventoryMovementItem> = {}): InventoryMovementItem {
  return {
    id: "m1", tenant_id: "t", location_id: "l", product_id: "p", product_location_id: "pl",
    product_code: "P-001", product_name: "BOTELLA DE AGUA",
    movement_type: "PURCHASE_IN", movement_direction: "ADDITIVE",
    quantity: 25, unit_cost: 0.5, stock_before: 10, resulting_stock: 35,
    reference_entity: "purchase", reference_id: "pur-1", reference_code: "3",
    document_number: "FAC-2026-125", correlative: "3",
    notes: null, performed_by: "u1", performed_by_name: "Ana López",
    created_at: new Date("2026-10-01T15:00:00Z"), created_at_label: "01/10/2026 09:00",
    ...over,
  };
}

describe("traducciones de movimientos", () => {
  it("5. todos los tipos tienen etiqueta en español y ninguna es el enum técnico", () => {
    expect(MOVEMENT_TYPE_LABELS).toMatchObject({
      PURCHASE_IN: "Entrada por compra",
      SALE_OUT: "Salida por venta",
      MANUAL_IN: "Entrada manual",
      MANUAL_OUT: "Salida manual",
      INITIAL_LOAD: "Carga inicial",
      ADJUSTMENT_UP: "Ajuste positivo",
      ADJUSTMENT_DOWN: "Ajuste negativo",
      TRANSFER_IN: "Entrada por traslado",
      TRANSFER_OUT: "Salida por traslado",
      RETURN_IN: "Entrada por devolución",
      RETURN_OUT: "Salida por devolución",
    });
    for (const t of ALL_MOVEMENT_TYPES) expect(getMovementTypeLabel(t)).not.toMatch(/^[A-Z_]+$/);
  });
});

describe("toMovementExportRow", () => {
  it("compra: Documento y Correlativo en columnas distintas, entrada numérica", () => {
    const r = toMovementExportRow(item());
    expect(r).toMatchObject({
      type: "Entrada por compra",
      direction: "Entrada",
      document: "FAC-2026-125",
      correlative: "3",
      qty_in: 25,
      qty_out: null,
      stock_before: 10,
      resulting_stock: 35,
    });
  });

  it("venta: salida numérica y dirección Salida (no SUBTRACTIVE)", () => {
    const r = toMovementExportRow(item({ movement_type: "SALE_OUT", movement_direction: "SUBTRACTIVE", quantity: 2, document_number: null, correlative: "V-1" }));
    expect(r).toMatchObject({ type: "Salida por venta", direction: "Salida", qty_in: null, qty_out: 2, document: null, correlative: "V-1" });
  });

  it("12 columnas en el orden de la consulta", () => {
    expect(MOVEMENT_REPORT_COLUMNS).toEqual([
      "Fecha y hora", "Tipo de movimiento", "Dirección", "Documento", "Correlativo",
      "Entrada", "Salida", "Existencia anterior", "Existencia resultante",
      "Costo unitario", "Usuario", "Observaciones",
    ]);
  });
});

describe("encabezado y formatos", () => {
  const report = {
    product: { id: "p", product_code: "P-001", name: "BOTELLA DE AGUA" },
    location: { id: "l", name: "Sucursal Centro" },
    date_from: "2026-10-01", date_to: "2026-10-31",
    date_from_label: "01/10/2026", date_to_label: "31/10/2026",
    movement_type: null, generated_at_label: "19/10/2026 12:00",
    items: [], total: 2, page: 1, page_size: 50, total_pages: 1,
  } as ProductMovementReport;

  it("encabezado identifica producto, código, sucursal, período, generación y cantidad", () => {
    expect(buildMovementReportHeader(report, null)).toEqual([
      ["Producto", "BOTELLA DE AGUA"],
      ["Código", "P-001"],
      ["Sucursal", "Sucursal Centro"],
      ["Período", "01/10/2026 al 31/10/2026"],
      ["Fecha de generación", "19/10/2026 12:00"],
      ["Cantidad de movimientos", "2"],
    ]);
    expect(describeMovementPeriod({ date_from_label: null, date_to_label: null })).toBe("Todo el historial");
  });

  it("formato numérico El Salvador (1,234.56)", () => {
    expect(formatMovementQty(1234.5)).toBe("1,234.5");
    expect(formatMovementCost(1234.5)).toBe("1,234.50");
    expect(formatMovementQty(null)).toBe("");
  });

  it("fechas en hora de El Salvador (UTC-6, sin DST)", () => {
    expect(formatSvDateTime(new Date("2026-10-19T23:30:00Z"))).toBe("19/10/2026 17:30");
    expect(formatSvDateTime(new Date("2026-10-20T03:10:00Z"))).toBe("19/10/2026 21:10");
    expect(svStartOfDay("2026-10-19").toISOString()).toBe("2026-10-19T06:00:00.000Z");
    expect(isValidDateParam("2026-02-30")).toBe(false);
    expect(isValidDateParam("2026-02-28")).toBe(true);
  });
});
