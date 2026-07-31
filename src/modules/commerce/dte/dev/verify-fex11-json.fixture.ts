// ─────────────────────────────────────────────────────────────────
// commerce/dte — verify-fex11-json.fixture.ts
//
// Microfase F3-C6 — verificador dev-only (tsx) para el flujo técnico:
//   buildFexJsonFromLoadedData → AJV (mismo schema/config que
//   validate-dte-json-schema.service.ts usa para tipo "11")
//
// No usa PrismaClient real, no lee .env, no persiste nada. Los datos
// de venta/cliente/emisor son un fixture in-memory que representa lo
// que generateFexJsonForSale cargaría de Prisma.
//
// Ejecutar:  npx tsx src/modules/commerce/dte/dev/verify-fex11-json.fixture.ts
// ─────────────────────────────────────────────────────────────────

import Ajv from "ajv";
import addFormats from "ajv-formats";
import fexSchema from "../schemas/mh/fex-11.schema.json";
import {
  buildFexJsonFromLoadedData,
  type FexLoadedData,
  type GenerateFexJsonResult,
} from "../services/generate-fex-json.service";
import type { FexJsonDocument } from "../types/fex-json.types";

// ── AJV: misma configuración que validate-dte-json-schema.service.ts ──

function validateFexAjv(doc: unknown): { ok: true } | { ok: false; errors: string[] } {
  const ajv = new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 2 });
  addFormats(ajv);
  const validate = ajv.compile(fexSchema as object);
  const valid = validate(doc);
  if (valid) return { ok: true };
  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath || "(raíz)"} ${e.message ?? "error desconocido"}`,
  );
  return { ok: false, errors };
}

// ── Fixture base ────────────────────────────────────────────────────

function makeBaseLoadedData(overrides: {
  unitPrice: number;
  quantity: number;
  customerEmail: string | null;
  insurance?: number;
  freight?: number;
}): FexLoadedData {
  const { unitPrice, quantity, customerEmail, insurance = 0, freight = 0 } = overrides;

  const lineSubtotal = unitPrice * quantity;
  const lineTotal = lineSubtotal; // tax_rate_snapshot = 0, sin descuento

  return {
    tenant_id: "tenant-001",
    dteDoc: {
      control_number: "DTE-11-A1B2C3D4-000000000000001",
      generation_code: "A1B2C3D4-E5F6-1234-5678-9ABCDEF01234",
    },
    sale: {
      status: "CONFIRMED",
      inventory_moved: true,
      customer_id: "customer-001",
      primary_dte_type_code: "11",
      condition_operation_code: "1",
      payment_method_code: "01",
      payment_term_code: null,
      payment_term_value: null,
      total_amount: lineTotal,
      notes: null,
      customer: {
        id: "customer-001",
        name: "ACME EXPORTS LLC",
        legal_name: "ACME EXPORTS",
        id_type_code: "03",
        nit: null,
        dui: "AB1234567",
        activity_name: "COMERCIO AL POR MAYOR",
        address_complement: "1234 MAIN ST, MIAMI FL",
        phone: "+13051234567",
        email: customerEmail,
        is_foreign: true,
        country_code: "9540",
        country_name: "ESTADOS UNIDOS",
        customer_person_type: "2",
      },
      export_details: {
        tenant_id: "tenant-001",
        item_type_export: 1,
        fiscal_precinct_code: "10",
        regime_code: "EX01",
        incoterm_code: "FOB",
        incoterm_desc: "FREE ON BOARD",
        insurance_amount: insurance,
        freight_amount: freight,
      },
      items: [
        {
          line_number: 1,
          product_code_snapshot: "PROD-001",
          product_name_snapshot: "CAMISA DE ALGODON",
          quantity,
          unit_price: unitPrice,
          discount_amount: 0,
          tax_rate_snapshot: 0,
          line_subtotal: lineSubtotal,
          line_total: lineTotal,
          product: {
            unit: { mh_unit_code: "36" },
          },
        },
      ],
      payments: [
        {
          mh_payment_form_code: "01",
          amount: lineTotal,
          reference: null,
        },
      ],
    },
    issuerConfig: {
      nit: "06140000000000",
      nrc: "1234560",
      name: "MI EMPRESA SA DE CV",
      legal_name: "MI EMPRESA",
      activity_code: "47190",
      activity_name: "VENTA AL POR MENOR",
      establishment_code: "0001",
      establishment_type_code: "02",
      point_of_sale_code: "0001",
      cod_estable_mh: "0001",
      cod_punto_venta_mh: "0001",
      dept_code: "06",
      municipality_code: "01",
      address_complement: "COLONIA CENTRO, SAN SALVADOR",
      phone: "22345678",
      email: "facturacion@miempresa.com",
      environment: "TEST",
    },
  };
}

// ── Runner ────────────────────────────────────────────────────────

interface ScenarioResult {
  name: string;
  builderOk: boolean;
  ajvOk: boolean | null;
  builderError?: string;
  ajvErrors?: string[];
}

function assertBusinessChecks(json: FexJsonDocument): string[] {
  const problems: string[] = [];
  if (json.identificacion.tipoDte !== "11") problems.push("identificacion.tipoDte != 11");
  if (!json.identificacion.numeroControl.startsWith("DTE-11-")) problems.push("numeroControl no inicia con DTE-11");
  if (!json.identificacion.codigoGeneracion) problems.push("codigoGeneracion vacío");
  if (!json.emisor) problems.push("emisor faltante");
  if (!json.receptor) problems.push("receptor faltante");
  if (!json.receptor.codPais) problems.push("receptor.codPais faltante");
  if (!json.receptor.nombrePais) problems.push("receptor.nombrePais faltante");
  if (json.cuerpoDocumento.length === 0) problems.push("cuerpoDocumento sin líneas");
  if (json.cuerpoDocumento.some((i) => !i.uniMedida)) problems.push("línea sin uniMedida");
  if (json.cuerpoDocumento.some((i) => !i.tributos?.includes("C3"))) problems.push("línea sin tributo C3");
  if (json.resumen.montoTotalOperacion == null) problems.push("resumen.montoTotalOperacion faltante");
  if (json.resumen.totalPagar == null) problems.push("resumen.totalPagar faltante");
  return problems;
}

function runScenario(
  name: string,
  loaded: FexLoadedData,
  expectBuilderFailure: boolean,
): ScenarioResult {
  const result: GenerateFexJsonResult = buildFexJsonFromLoadedData(loaded);

  if (!result.ok) {
    return { name, builderOk: false, ajvOk: null, builderError: result.error };
  }

  if (expectBuilderFailure) {
    return {
      name,
      builderOk: true,
      ajvOk: null,
      builderError: "(inesperado) el builder debía fallar y no falló",
    };
  }

  const businessProblems = assertBusinessChecks(result.json);
  if (businessProblems.length > 0) {
    return { name, builderOk: true, ajvOk: false, ajvErrors: businessProblems };
  }

  const ajvResult = validateFexAjv(result.json);
  if (!ajvResult.ok) {
    return { name, builderOk: true, ajvOk: false, ajvErrors: ajvResult.errors };
  }

  return { name, builderOk: true, ajvOk: true };
}

function printResult(r: ScenarioResult) {
  console.log(`\n── ${r.name} ──`);
  console.log(`builder ok: ${r.builderOk}`);
  if (r.builderError) console.log(`builder error: ${r.builderError}`);
  if (r.ajvOk !== null) console.log(`ajv ok: ${r.ajvOk}`);
  if (r.ajvErrors && r.ajvErrors.length > 0) {
    console.log("errores:");
    for (const e of r.ajvErrors) console.log(`  - ${e}`);
  }
}

function main() {
  const results: ScenarioResult[] = [];

  // Escenario A — monto < 10000, correo presente pero no obligatorio.
  const dataA = makeBaseLoadedData({ unitPrice: 500, quantity: 10, customerEmail: "cliente@acme.com" });
  results.push(runScenario("Escenario A (monto < 10000)", dataA, false));

  // Escenario B — monto >= 10000, correo obligatorio y presente.
  const dataB = makeBaseLoadedData({ unitPrice: 1200, quantity: 10, customerEmail: "cliente@acme.com" });
  results.push(runScenario("Escenario B (monto >= 10000, con correo)", dataB, false));

  // Escenario C — monto >= 10000, sin correo → debe fallar en el builder.
  const dataC = makeBaseLoadedData({ unitPrice: 1200, quantity: 10, customerEmail: null });
  results.push(runScenario("Escenario C (monto >= 10000, sin correo → debe fallar)", dataC, true));

  for (const r of results) printResult(r);

  const scenarioAOk = results[0].builderOk && results[0].ajvOk === true;
  const scenarioBOk = results[1].builderOk && results[1].ajvOk === true;
  const scenarioCOk = !results[2].builderOk; // debe fallar, con error claro

  console.log("\n── Resumen ──");
  console.log(`Escenario A: ${scenarioAOk ? "PASA" : "FALLA"}`);
  console.log(`Escenario B: ${scenarioBOk ? "PASA" : "FALLA"}`);
  console.log(`Escenario C (negativo esperado): ${scenarioCOk ? "PASA" : "FALLA"}`);

  const allOk = scenarioAOk && scenarioBOk && scenarioCOk;
  if (!allOk) {
    console.error("\nVERIFICACIÓN FALLIDA");
    process.exit(1);
  }
  console.log("\nVERIFICACIÓN OK");
}

main();
