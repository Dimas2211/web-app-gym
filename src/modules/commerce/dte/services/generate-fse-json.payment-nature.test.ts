// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-fse-json.payment-nature.test.ts
//
// Prueba local del caso final del bloque de auditoría "Naturaleza del
// pago FSE 14": SERVICES + proveedor persona natural + $333.33.
//
// Usa buildFseJsonFromLoadedData (función pura, sin Prisma) con un
// fixture in-memory que representa exactamente lo que el pipeline real
// cargaría de una Purchase con:
//   payment_nature = SERVICES
//   income_tax_withholding_applies = true
//   income_tax_withholding_base    = 333.33
//   income_tax_withholding_rate    = 10.00
//   income_tax_withholding_amount  = 33.33  (calculado por
//     income-tax-withholding.util.ts — ver su propio test suite)
//
// No usa PrismaClient, no firma, no transmite, no consume correlativo
// real ni toca MariaDB — codigoGeneracion/numeroControl son valores de
// fixture. Distinto del DTE-14-M001P001-000000000020001 ya ACCEPTED,
// que este test NUNCA referencia ni recalcula.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import fseSchema from "../schemas/mh/fse-14.schema.json";
import {
  buildFseJsonFromLoadedData,
  type FseLoadedData,
} from "./generate-fse-json.service";

function validateFseAjv(doc: unknown): { ok: true } | { ok: false; errors: string[] } {
  const ajv = new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 2 });
  addFormats(ajv);
  const validate = ajv.compile(fseSchema as object);
  const valid = validate(doc);
  if (valid) return { ok: true };
  return {
    ok:     false,
    errors: (validate.errors ?? []).map((e) => `${e.instancePath || "(raíz)"} ${e.message ?? "error"}`),
  };
}

// Fixture: DESARROLLO LANDING PAGE, $333.33, Contado + Efectivo,
// sujeto excluido persona natural.
const fixture: FseLoadedData = {
  dteDoc: {
    control_number:  "DTE-14-M001P001-000000000099999", // fixture — no es un correlativo real
    generation_code: "AAAAAAAA-0000-0000-0000-000000000000", // fixture con formato UUID válido — no es un código real
  },
  purchase: {
    tenant_id:                      "fixture-tenant",
    status:                         "CONFIRMED",
    document_type:                  "FSE",
    notes:                          "Prueba local — Naturaleza del pago SERVICES",
    payment_condition:              "CON",
    cancellation_type:              "EFE",
    retention_1pct_applies:         false,
    retention_1pct_amount:          0,
    income_tax_withholding_applies: true,
    income_tax_withholding_amount:  33.33,
    supplier: {
      name:               "Proveedor Persona Natural de Prueba",
      legal_name:         null,
      taxpayer_type:       "EXCLUDED_SUBJECT",
      id_type_code:       "13",
      nit:                null,
      dui:                "01234567-8",
      other_document:     null,
      activity_code:      "62010",
      activity_name:      "Actividades de programación informática",
      dept_code:          "06",
      municipality_code:  "14",
      address_complement: "Colonia de prueba, casa 1",
      phone:              "22223333",
      email:              "proveedor.prueba@example.com",
    },
    items: [{
      dte_line_number: null,
      quantity:        1,
      unit_cost:       333.33,
      line_subtotal:   333.33,
      product: {
        product_code: "SERV-LANDING",
        name:         "DESARROLLO LANDING PAGE",
        product_type: "SERVICE",
        unit:         { mh_unit_code: "99" },
      },
    }],
  },
  issuerConfig: {
    nit:                "06141901011010",
    nrc:                "123456",
    name:               "Emisor de Prueba S.A. de C.V.",
    activity_code:      "62010",
    activity_name:      "Actividades de programación informática",
    establishment_code: null,
    point_of_sale_code: null,
    cod_estable_mh:     null,
    cod_punto_venta_mh: null,
    dept_code:          "06",
    municipality_code:  "14",
    address_complement: "Oficina central de prueba",
    phone:              "22224444",
    email:              "emisor.prueba@example.com",
    environment:        "TEST",
  },
};

describe("buildFseJsonFromLoadedData — Naturaleza del pago SERVICES / persona natural / $333.33", () => {
  it("calcula reteRenta=33.33, totalPagar=300.00 y pagos[0].montoPago=300.00", () => {
    const result = buildFseJsonFromLoadedData(fixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { resumen } = result.json;

    expect(resumen.totalCompra).toBe(333.33);
    expect(resumen.ivaRete1).toBe(0);
    expect(resumen.reteRenta).toBe(33.33);
    expect(resumen.totalPagar).toBe(300);
    expect(resumen.pagos).toHaveLength(1);
    expect(resumen.pagos?.[0].codigo).toBe("01"); // EFE → CAT-017 "01"
    expect(resumen.pagos?.[0].montoPago).toBe(300);
    expect(resumen.condicionOperacion).toBe(1); // Contado
  });

  it("el JSON candidato es válido contra el schema oficial fe-fse-v1 (AJV)", () => {
    const result = buildFseJsonFromLoadedData(fixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ajvResult = validateFseAjv(result.json);
    expect(ajvResult.ok, JSON.stringify((ajvResult as { errors?: string[] }).errors)).toBe(true);
  });

  it("no muta ni referencia el DTE ACCEPTED real DTE-14-M001P001-000000000020001", () => {
    const result = buildFseJsonFromLoadedData(fixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.json.identificacion.numeroControl).not.toBe("DTE-14-M001P001-000000000020001");
    expect(result.json.identificacion.codigoGeneracion).not.toBe("DC22651E-85B4-43AF-91F0-4F14548331A0");
  });
});
