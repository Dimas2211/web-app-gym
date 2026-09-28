// ─────────────────────────────────────────────────────────────────
// commerce/dte — fex11-v3.test-fixture.ts
//
// FEX-PROD-0B — fixture in-memory compartido por los tests FEX 11 v3.
// Exportación estándar de servicios (tipoItemExpor=2), receptor en
// Estados Unidos (CAT-020 "US"), emisor en Santa Tecla (dept 05,
// municipio 11, distrito 050611 del CSV oficial CAT-013).
// Sin Prisma, sin red: solo datos.
// ─────────────────────────────────────────────────────────────────

import Ajv from "ajv";
import addFormats from "ajv-formats";
import fexV3Schema from "../schemas/mh/fex-11-v3.schema.json";
import type { FexLoadedData } from "./generate-fex-json.service";

// Misma configuración AJV que validate-dte-json-schema.service.ts.
export function validateAgainstFexV3(doc: unknown): { ok: boolean; errors: string[] } {
  const ajv = new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 2 });
  addFormats(ajv);
  const validate = ajv.compile(fexV3Schema as object);
  const ok = validate(doc) as boolean;
  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath || "(raíz)"} ${e.message ?? ""} ${JSON.stringify(e.params)}`,
  );
  return { ok, errors };
}

export function makeFexV3LoadedData(): FexLoadedData {
  return {
    tenant_id: "tenant-1",
    dteDoc: {
      control_number:  "DTE-11-M001P001-000000000000001",
      generation_code: "A1B2C3D4-E5F6-4234-8678-9ABCDEF01234",
    },
    sale: {
      status:                   "CONFIRMED",
      inventory_moved:          true,
      customer_id:              "cust-1",
      primary_dte_type_code:    "11",
      condition_operation_code: "1",
      payment_method_code:      "01",
      payment_term_code:        null,
      payment_term_value:       null,
      total_amount:             450,
      notes:                    null,
      customer: {
        id:                   "cust-1",
        name:                 "ACME TRAINING LLC",
        legal_name:           null,
        id_type_code:         "03",
        nit:                  null,
        dui:                  "AB1234567",
        activity_name:        "SERVICIOS DE ENTRENAMIENTO",
        address_complement:   "1234 MAIN ST, MIAMI FL",
        phone:                "+13051234567",
        email:                "cliente@acme.com",
        is_foreign:           true,
        country_code:         "US",
        country_name:         "Estados Unidos",
        customer_person_type: "1",
      },
      export_details: {
        tenant_id:            "tenant-1",
        item_type_export:     2,
        fiscal_precinct_code: null,
        regime_code:          null,
        incoterm_code:        null,
        incoterm_desc:        null,
        insurance_amount:     0,
        freight_amount:       0,
      },
      items: [
        {
          line_number:           1,
          product_code_snapshot: "SRV-PT-01",
          product_name_snapshot: "PLAN DE ENTRENAMIENTO ONLINE",
          product_type_snapshot: "SERVICE",
          quantity:              3,
          unit_price:            100,
          discount_amount:       0,
          tax_rate_snapshot:     0,
          line_subtotal:         300,
          line_total:            300,
          product: { unit: { mh_unit_code: "59" } },
        },
        {
          line_number:           2,
          product_code_snapshot: "SRV-NUT-01",
          product_name_snapshot: "ASESORIA NUTRICIONAL",
          product_type_snapshot: "SERVICE",
          quantity:              1,
          unit_price:            200,
          discount_amount:       50,
          tax_rate_snapshot:     0,
          line_subtotal:         150,
          line_total:            150,
          product: { unit: { mh_unit_code: "59" } },
        },
      ],
      payments: [
        { mh_payment_form_code: "01", amount: 450, reference: null },
      ],
    },
    issuerConfig: {
      nit:                "06141234567890",
      nrc:                "1234567",
      name:               "METRO GYM SA DE CV",
      legal_name:         null,
      activity_code:      "93110",
      activity_name:      "Gestión de instalaciones deportivas",
      establishment_code: "M001",
      point_of_sale_code: "P001",
      dept_code:          "05",
      municipality_code:  "11",
      address_complement: "Calle Principal 123, Santa Tecla",
      phone:              "22223333",
      email:              "facturacion@gym.test",
      environment:        "TEST",
    },
    emisorFexTerritory: { departamento: "05", municipio: "06", distrito: "11" },
    receptorCountry:    { code: "US", name: "Estados Unidos" },
  };
}
