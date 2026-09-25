// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-fex-json.v3.test.ts
//
// FEX-PROD-0B — contrato FEX 11 v3: builder puro + AJV contra la copia
// oficial fe-fex-v3.json (schemas/mh/fex-11-v3.schema.json).
// Sin Prisma, sin red, sin firma.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import fexV3Schema from "../schemas/mh/fex-11-v3.schema.json";
import { buildFexJsonFromLoadedData, type FexLoadedData } from "./generate-fex-json.service";
import { FEX_GOODS_TIPO_REGIMEN_BLOCKED_ERROR } from "../utils/fex11-v3-rules";
import type { FexJsonDocument } from "../types/fex-json.types";
import { makeFexV3LoadedData, validateAgainstFexV3 } from "./fex11-v3.test-fixture";

function build(mutate?: (d: FexLoadedData) => void) {
  const data = makeFexV3LoadedData();
  mutate?.(data);
  return buildFexJsonFromLoadedData(data);
}

function buildOk(mutate?: (d: FexLoadedData) => void): FexJsonDocument {
  const result = build(mutate);
  if (!result.ok) throw new Error(`builder falló: ${result.error}`);
  return result.json;
}

function buildError(mutate: (d: FexLoadedData) => void): string {
  const result = build(mutate);
  if (result.ok) throw new Error("se esperaba error del builder");
  return result.error;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

describe("schema FEX v3 instalado", () => {
  it("es la copia oficial (md5 e40610cf… registrado en FEX-PROD-0)", () => {
    // El original oficial usa LF; se normaliza CRLF por core.autocrlf en Windows.
    const file = path.resolve(__dirname, "../schemas/mh/fex-11-v3.schema.json");
    const content = readFileSync(file, "utf-8").replace(/\r\n/g, "\n");
    const md5 = createHash("md5").update(content, "utf-8").digest("hex");
    expect(md5).toBe("e40610cf975822b48ddefad0d3122e55");
  });

  it("identificacion.version admite solo 3", () => {
    const version = (fexV3Schema as { properties: { identificacion: { properties: { version: { const: number } } } } })
      .properties.identificacion.properties.version;
    expect(version.const).toBe(3);
  });

  it("rechaza un documento con forma v1", () => {
    const json = clone(buildOk()) as unknown as Record<string, unknown>;
    const v1 = {
      ...json,
      identificacion: {
        ...(json.identificacion as object),
        version: 1,
        motivoContigencia: null,
      },
    } as Record<string, unknown>;
    delete (v1.identificacion as Record<string, unknown>).motivoContin;
    delete v1.documentoRelacionado;
    delete v1.compraTercero;
    expect(validateAgainstFexV3(v1).ok).toBe(false);
  });
});

describe("FEX v3 — documento estándar", () => {
  it("A. fixture estándar de exportación de servicios → AJV PASS", () => {
    const json = buildOk();
    const result = validateAgainstFexV3(json);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(json.identificacion.version).toBe(3);
  });

  it("B. version=1 → AJV FAIL", () => {
    const json = clone(buildOk()) as unknown as { identificacion: { version: number } };
    json.identificacion.version = 1;
    expect(validateAgainstFexV3(json).ok).toBe(false);
  });

  it("C. usa motivoContin (null en operación normal) y nunca motivoContigencia", () => {
    const json = buildOk();
    expect(json.identificacion).toHaveProperty("motivoContin", null);
    expect(json.identificacion).not.toHaveProperty("motivoContigencia");

    const legacy = clone(json) as unknown as { identificacion: Record<string, unknown> };
    legacy.identificacion.motivoContigencia = null;
    expect(validateAgainstFexV3(legacy).ok).toBe(false);
  });

  it("D. campos eliminados en v3 no se emiten y, si aparecen, AJV falla", () => {
    const json = buildOk();
    for (const f of ["tipoEstablecimiento", "codEstableMH", "codPuntoVentaMH"]) {
      expect(json.emisor).not.toHaveProperty(f);
      const doc = clone(json) as unknown as { emisor: Record<string, unknown> };
      doc.emisor[f] = f === "tipoEstablecimiento" ? "02" : null;
      expect(validateAgainstFexV3(doc).ok).toBe(false);
    }
    expect(json.resumen).not.toHaveProperty("descuento");
    const withDescuento = clone(json) as unknown as { resumen: Record<string, unknown> };
    withDescuento.resumen.descuento = 0;
    expect(validateAgainstFexV3(withDescuento).ok).toBe(false);
  });

  it("E. documentoRelacionado: null en operación estándar; [] inválido; elemento válido aceptado", () => {
    const json = buildOk();
    expect(json.documentoRelacionado).toBeNull();

    const empty = clone(json) as unknown as Record<string, unknown>;
    empty.documentoRelacionado = [];
    expect(validateAgainstFexV3(empty).ok).toBe(false);

    const withDoc = clone(json) as unknown as Record<string, unknown>;
    withDoc.documentoRelacionado = [{
      tipoDocumento: "09", tipoGeneracion: 1, numeroDocumento: "DOC-001", fechaEmision: "2026-09-01",
    }];
    expect(validateAgainstFexV3(withDoc).ok).toBe(true);

    const missing = clone(json) as unknown as Record<string, unknown>;
    delete missing.documentoRelacionado;
    expect(validateAgainstFexV3(missing).ok).toBe(false);
  });

  it("F. compraTercero: null en operación propia; exclusión mutua con ventaTercero", () => {
    const json = buildOk();
    expect(json.compraTercero).toBeNull();
    expect(json.ventaTercero).toBeNull();

    const compra = clone(json) as unknown as Record<string, unknown>;
    compra.compraTercero = { numDocumento: "12345678", nombre: "TERCERO SA" };
    expect(validateAgainstFexV3(compra).ok).toBe(true);

    const ambos = clone(compra);
    ambos.ventaTercero = { nit: "06140000000000", nombre: "OTRO", codDomiciliado: 1 };
    expect(validateAgainstFexV3(ambos).ok).toBe(false);

    const missing = clone(json) as unknown as Record<string, unknown>;
    delete missing.compraTercero;
    expect(validateAgainstFexV3(missing).ok).toBe(false);
  });

  it("G. emisor.direccion.distrito desde Municipality.district_code; sin distrito → error claro", () => {
    const json = buildOk();
    expect(json.emisor.direccion).toEqual({
      departamento: "05",
      municipio:    "11",
      distrito:     "050611",
      complemento:  "Calle Principal 123, Santa Tecla",
    });
    const error = buildError((d) => { d.emisorDistrictCode = null; });
    expect(error).toContain("distrito");
  });

  it("H. emisor.tipoRegimen: null en exportación de servicios; bienes bloqueados", () => {
    const json = buildOk();
    expect(json.emisor.tipoRegimen).toBeNull();
    expect(json.emisor.recintoFiscal).toBeNull();
    expect(json.emisor.regimen).toBeNull();
    expect(json.emisor.tipoItemExpor).toBe(2);

    for (const itemType of [1, 3]) {
      const error = buildError((d) => {
        d.sale.export_details!.item_type_export = itemType;
        d.sale.export_details!.fiscal_precinct_code = "02";
        d.sale.export_details!.regime_code = "EX-1.1000.000";
      });
      expect(error).toBe(FEX_GOODS_TIPO_REGIMEN_BLOCKED_ERROR);
    }
  });

  it("I. cuerpo: tipoItem CAT-011, numeroDocumento null, codTributo null, tributos C3", () => {
    const json = buildOk();
    for (const item of json.cuerpoDocumento) {
      expect(item.tipoItem).toBe(2);
      expect(item.numeroDocumento).toBeNull();
      expect(item.codTributo).toBeNull();
      expect(item.tributos).toEqual(["C3"]);
      expect(item.noGravado).toBe(0);
    }
    const error = buildError((d) => { d.sale.items[0].product_type_snapshot = "PRODUCT"; });
    expect(error).toContain("es un bien");
  });

  it("J. resumen: descuGravada 0, tributos [C3 valor 0], totalNoOnerosas 0, saldoFavor 0", () => {
    const { resumen } = buildOk();
    expect(resumen.descuGravada).toBe(0);
    expect(resumen.tributos).toEqual([
      { codigo: "C3", descripcion: "Impuesto al Valor Agregado (exportaciones) 0%", valor: 0 },
    ]);
    expect(resumen.totalNoOnerosas).toBe(0);
    expect(resumen.saldoFavor).toBe(0);
    expect(resumen.porcentajeDescuento).toBe(0);
  });
});

describe("FEX v3 — país CAT-020", () => {
  it("K. US (CAT-020 vigente) → codPais/nombrePais oficiales", () => {
    const json = buildOk();
    expect(json.receptor.codPais).toBe("US");
    expect(json.receptor.nombrePais).toBe("Estados Unidos");
  });

  it("L. código legado FEX v1 (9540) → error de negocio, sin conversión", () => {
    const error = buildError((d) => {
      d.sale.customer!.country_code = "9540";
      d.sale.customer!.country_name = "ESTADOS UNIDOS";
      d.receptorCountry = null;
    });
    expect(error).toContain("versión anterior");
    expect(error).toContain("CAT-020");
  });

  it("El Salvador no es país destino de exportación", () => {
    const error = buildError((d) => {
      d.sale.customer!.country_code = "SV";
      d.receptorCountry = { code: "SV", name: "El Salvador" };
    });
    expect(error).toContain("El Salvador");
  });
});

describe("FEX v3 — límites de longitud (sin truncar)", () => {
  it("M. product_code > 25 → error claro, no truncado", () => {
    const longCode = "SRV-CODIGO-MUY-LARGO-00001"; // 26
    expect(longCode.length).toBe(26);
    const error = buildError((d) => { d.sale.items[0].product_code_snapshot = longCode; });
    expect(error).toContain(longCode);
    expect(error).toContain("máximo 25");

    const exact = "SRV-CODIGO-MUY-LARGO-0001"; // 25
    const json = buildOk((d) => { d.sale.items[0].product_code_snapshot = exact; });
    expect(json.cuerpoDocumento[0].codigo).toBe(exact);
  });

  it("N. receptor.complemento > 200 → error claro", () => {
    const error = buildError((d) => { d.sale.customer!.address_complement = "x".repeat(201); });
    expect(error).toContain("complemento");
    expect(error).toContain("200");
    const json = buildOk((d) => { d.sale.customer!.address_complement = "x".repeat(200); });
    expect(json.receptor.complemento).toHaveLength(200);
  });

  it("numeroControl fuera del patrón v3 → error claro", () => {
    const error = buildError((d) => { d.dteDoc.control_number = "DTE-11-A1B2C3D4-000000000000001"; });
    expect(error).toContain("número de control");
  });

  it("strings vacíos en campos minLength 1 se emiten como null", () => {
    const json = buildOk((d) => {
      d.sale.notes = "  ";
      d.sale.export_details!.incoterm_desc = "";
      d.sale.customer!.legal_name = "";
    });
    expect(json.resumen.observaciones).toBeNull();
    expect(json.resumen.descIncoterms).toBeNull();
    expect(json.receptor.nombreComercial).toBeNull();
    expect(validateAgainstFexV3(json).ok).toBe(true);
  });

  it("línea con IVA distinto de 0% → error (exportación C3 0%)", () => {
    const error = buildError((d) => { d.sale.items[0].tax_rate_snapshot = 13; });
    expect(error).toContain("0% (C3)");
  });

  it("línea sin valor (transferencia no onerosa) → error", () => {
    const error = buildError((d) => {
      d.sale.items[1].unit_price = 0;
      d.sale.items[1].discount_amount = 0;
      d.sale.items[1].line_subtotal = 0;
      d.sale.items[1].line_total = 0;
      d.sale.total_amount = 300;
      d.sale.payments[0].amount = 300;
    });
    expect(error).toContain("mayor a cero");
  });
});

describe("FEX v3 — fórmulas del resumen", () => {
  it("O. descuento por ítem en montoDescu; totalDescu = Σ montoDescu; descuGravada = 0", () => {
    const json = buildOk();
    expect(json.cuerpoDocumento.map((i) => i.montoDescu)).toEqual([0, 50]);
    expect(json.resumen.totalDescu).toBe(50);
    expect(json.resumen.descuGravada).toBe(0);
    expect(json.resumen.totalGravada).toBe(450);
  });

  it("P/Q/R. seguro y flete suman a montoTotalOperacion; totalPagar = montoTotalOperacion + totalNoGravado", () => {
    const json = buildOk((d) => {
      d.sale.export_details!.insurance_amount = "12.5";
      d.sale.export_details!.freight_amount = 37.25;
    });
    expect(json.resumen.seguro).toBe(12.5);
    expect(json.resumen.flete).toBe(37.25);
    expect(json.resumen.montoTotalOperacion).toBe(499.75);
    expect(json.resumen.totalNoGravado).toBe(0);
    expect(json.resumen.totalPagar).toBe(499.75);
    expect(json.resumen.totalLetras).toBe("CUATROCIENTOS NOVENTA Y NUEVE 75/100 DOLARES");
    expect(validateAgainstFexV3(json).ok).toBe(true);
  });

  it("montoTotalOperacion >= 10000 sin correo del receptor → error (regla Zolvi)", () => {
    const error = buildError((d) => {
      d.sale.customer!.email = null;
      d.sale.export_details!.freight_amount = 9600;
    });
    expect(error).toContain("correo");
  });
});

describe("FEX v3 — aislamiento tenant", () => {
  it("T. SaleExportDetails de otro tenant → error", () => {
    const error = buildError((d) => { d.sale.export_details!.tenant_id = "tenant-otro"; });
    expect(error).toContain("tenant");
  });
});
