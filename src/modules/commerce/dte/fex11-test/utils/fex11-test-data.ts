// ─────────────────────────────────────────────────────────────────
// commerce/dte/fex11-test — fex11-test-data.ts
//
// Microfase F3-C18 — helper de datos para la Consola de prueba FEX 11.
//
// Crea un caso de prueba NUEVO cada vez que se invoca: cliente
// extranjero y producto se reutilizan si ya existen (maestros
// idempotentes), pero Sale, SaleExportDetails y DteOutgoingDocument
// tipo 11 siempre se crean nuevos, marcados con
// FEX11_UI_TEST_YYYYMMDD_HHMMSS, para no reutilizar el DTE
// ACCEPTED/REJECTED de las microfases anteriores.
//
// Adaptado de dev/verify-fex11-preview-local.ts, operando con
// tenant_id/location_id resueltos desde sesión (no desde env).
//
// Datos de catálogo oficiales — Catálogo Sistema de Transmisión,
// confirmados en F3-C15B: CAT-027 (02 = Marítima de Acajutla),
// CAT-028 (EX-1.1000.000 = exportación definitiva común),
// CAT-031 (09 = FOB-Libre a bordo).
//
// No firma, no transmite a Hacienda, no toca MariaDB.
// ─────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { reserveDteControlNumber } from "../../services/dte-correlative.service";

const CUSTOMER_CODE = "FEX11-UI-TEST-CUST";
const PRODUCT_CODE  = "FEX11-UI-TEST-001";
const UNIT_SYMBOL   = "FEX11-UI-U";
const UNIT_NAME     = "FEX11_UI_TEST_UNIT";
const CATEGORY_CODE = "FEX11-UI-TEST";
const CATEGORY_NAME = "FEX11_UI_TEST_CATEGORY";

const EXPORT_DETAILS_VALUES = {
  fiscal_precinct_code: "02",            // CAT-027: Marítima de Acajutla
  regime_code:          "EX-1.1000.000", // CAT-028: exportación definitiva común
  incoterm_code:        "09",            // CAT-031: FOB
  incoterm_desc:        "FOB-Libre a bordo",
};

export interface CreateFex11TestCaseParams {
  tenant_id:   string;
  location_id: string;
}

export interface CreateFex11TestCaseResult {
  dte_document_id: string;
  sale_id:         string;
  case_marker:     string;
}

function buildCaseMarker(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `FEX11_UI_TEST_${stamp}`;
}

async function loadActiveIssuerConfig(tenant_id: string, location_id: string) {
  const issuer = await prisma.dteIssuerConfig.findFirst({
    where: { tenant_id, location_id, environment: "TEST", is_active: true },
  });
  if (!issuer) {
    throw new Error("No existe DteIssuerConfig activo (environment=TEST) para esta location.");
  }

  const missing: string[] = [];
  if (!issuer.nit) missing.push("nit");
  if (!issuer.nrc) missing.push("nrc");
  if (!issuer.name) missing.push("name");
  if (!issuer.activity_code) missing.push("activity_code");
  if (!issuer.activity_name) missing.push("activity_name");
  if (!issuer.dept_code) missing.push("dept_code");
  if (!issuer.municipality_code) missing.push("municipality_code");
  if (!issuer.address_complement) missing.push("address_complement");
  if (!issuer.phone) missing.push("phone");
  if (!issuer.email) missing.push("email");
  if (!issuer.cod_estable_mh || issuer.cod_estable_mh.length !== 4) missing.push("cod_estable_mh (4 chars)");
  if (!issuer.cod_punto_venta_mh || issuer.cod_punto_venta_mh.length !== 4) missing.push("cod_punto_venta_mh (4 chars)");

  if (missing.length > 0) {
    throw new Error(`DteIssuerConfig TEST incompleto para FEX 11. Campos faltantes: ${missing.join(", ")}.`);
  }

  return issuer;
}

async function ensureUnit(): Promise<string> {
  const existingUsable = await prisma.unitOfMeasure.findFirst({
    where: { status: "active", mh_unit_code: { not: null } },
    select: { id: true },
  });
  if (existingUsable) return existingUsable.id;

  const marker = await prisma.unitOfMeasure.findFirst({
    where: { symbol: UNIT_SYMBOL },
    select: { id: true },
  });
  if (marker) return marker.id;

  const created = await prisma.unitOfMeasure.create({
    data: { name: UNIT_NAME, symbol: UNIT_SYMBOL, status: "active", mh_unit_code: "36" },
    select: { id: true },
  });
  return created.id;
}

async function ensureCategory(tenant_id: string): Promise<string> {
  const marker = await prisma.productCategory.findFirst({
    where: { tenant_id, code: CATEGORY_CODE },
    select: { id: true },
  });
  if (marker) return marker.id;

  const anyExisting = await prisma.productCategory.findFirst({
    where: { tenant_id, status: "active" },
    select: { id: true },
  });
  if (anyExisting) return anyExisting.id;

  const created = await prisma.productCategory.create({
    data: { tenant_id, code: CATEGORY_CODE, name: CATEGORY_NAME, status: "active" },
    select: { id: true },
  });
  return created.id;
}

async function ensureProduct(tenant_id: string, unit_id: string, category_id: string): Promise<string> {
  const existing = await prisma.product.findFirst({
    where: { tenant_id, product_code: PRODUCT_CODE },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.product.create({
    data: {
      tenant_id,
      product_code:   PRODUCT_CODE,
      name:           "FEX11_UI_TEST_PRODUCT",
      product_type:   "PRODUCT",
      status:         "ACTIVE",
      is_stockable:   false,
      allow_purchase: false,
      allow_sale:     true,
      category_id,
      unit_id,
      sale_price:     new Prisma.Decimal(500),
    },
    select: { id: true },
  });
  return created.id;
}

async function ensureCustomer(tenant_id: string): Promise<string> {
  const existing = await prisma.customer.findFirst({
    where: { tenant_id, customer_code: CUSTOMER_CODE },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.customer.create({
    data: {
      tenant_id,
      customer_code:         CUSTOMER_CODE,
      name:                  "FEX11_UI_TEST_CUSTOMER",
      legal_name:            "FEX11 UI TEST CUSTOMER LLC",
      taxpayer_type:         "EXCLUDED_SUBJECT",
      id_type_code:          "03", // pasaporte
      dui:                   "AB1234567",
      activity_name:         "COMERCIO AL POR MAYOR",
      address_complement:    "1234 MAIN ST, MIAMI FL",
      phone:                 "+13051234567",
      email:                 "fex11-ui-test-customer@example.com",
      status:                "active",
      is_foreign:            true,
      country_code:          "9540", // CAT-020: Estados Unidos
      country_name:          "ESTADOS UNIDOS",
      customer_person_type:  "2", // natural
    },
    select: { id: true },
  });
  return created.id;
}

async function createSaleAndExportDetails(
  tenant_id: string,
  location_id: string,
  customer_id: string,
  product_id: string,
  case_marker: string,
): Promise<string> {
  const unitPrice  = 500;
  const quantity   = 10;
  const lineTotal  = unitPrice * quantity;
  const now        = new Date();
  const year       = now.getFullYear();
  const month      = now.getMonth() + 1;

  const sale = await prisma.$transaction(async (tx) => {
    const maxSeqRow = await tx.$queryRaw<[{ max_seq: number | null }]>`
      SELECT MAX("sale_sequence") AS max_seq
      FROM   "sales"
      WHERE  "tenant_id"   = ${tenant_id}
        AND  "location_id" = ${location_id}
        AND  "sale_year"   = ${year}
        AND  "sale_month"  = ${month}
    `;
    const sequence  = (Number(maxSeqRow[0]?.max_seq) || 0) + 1;
    const sale_code = `VTA-${year}-${String(month).padStart(2, "0")}-${String(sequence).padStart(4, "0")}`;

    const createdSale = await tx.sale.create({
      data: {
        tenant_id,
        location_id,
        customer_id,
        sale_code,
        sale_year:                year,
        sale_month:               month,
        sale_sequence:            sequence,
        sale_date:                new Date(`${now.toISOString().slice(0, 10)}T00:00:00`),
        status:                   "CONFIRMED",
        payment_status:           "PAID",
        primary_dte_type_code:    "11",
        payment_method_code:      "01",
        condition_operation_code: "1",
        subtotal:                 new Prisma.Decimal(lineTotal),
        discount_amount:          new Prisma.Decimal(0),
        tax_amount:               new Prisma.Decimal(0),
        total_amount:             new Prisma.Decimal(lineTotal),
        inventory_moved:          true,
        notes:                    case_marker,
        confirmed_at:             now,
      },
      select: { id: true },
    });

    await tx.saleItem.create({
      data: {
        sale_id:                createdSale.id,
        product_id,
        line_number:            1,
        product_code_snapshot:  PRODUCT_CODE,
        product_name_snapshot:  "FEX11_UI_TEST_PRODUCT",
        product_type_snapshot:  "PRODUCT",
        is_stockable_snapshot:  false,
        quantity:               new Prisma.Decimal(quantity),
        unit_price:             new Prisma.Decimal(unitPrice),
        discount_amount:        new Prisma.Decimal(0),
        tax_rate_snapshot:      new Prisma.Decimal(0),
        tax_amount:             new Prisma.Decimal(0),
        line_subtotal:          new Prisma.Decimal(lineTotal),
        line_total:             new Prisma.Decimal(lineTotal),
      },
    });

    await tx.salePayment.create({
      data: {
        sale_id:              createdSale.id,
        payment_method_code:  "01",
        mh_payment_form_code: "01",
        amount:               new Prisma.Decimal(lineTotal),
        paid_at:              now,
      },
    });

    await tx.saleExportDetails.create({
      data: {
        tenant_id,
        sale_id:               createdSale.id,
        country_code:          "9540",
        country_name:          "ESTADOS UNIDOS",
        customer_person_type:  "2",
        item_type_export:      1,
        ...EXPORT_DETAILS_VALUES,
        insurance_amount:      new Prisma.Decimal(0),
        freight_amount:        new Prisma.Decimal(0),
      },
    });

    return createdSale;
  });

  return sale.id;
}

async function createDteDocument(
  tenant_id: string,
  location_id: string,
  sale_id: string,
  issuer_config_id: string,
  cod_estable_mh: string,
  cod_punto_venta_mh: string,
): Promise<string> {
  const created = await prisma.$transaction(async (tx) => {
    const { control_number } = await reserveDteControlNumber(tx, {
      tenant_id, location_id, issuer_config_id, environment: "TEST", dte_type_code: "11",
      cod_estable_mh, cod_punto_venta_mh,
    });

    const generation_code = randomUUID().toUpperCase();

    return tx.dteOutgoingDocument.create({
      data: {
        tenant_id,
        location_id,
        sale_id,
        issuer_config_id,
        dte_type_code: "11",
        environment:   "TEST",
        generation_code,
        control_number,
        dte_status:  "PENDING_GENERATION",
        retry_count: 0,
      },
      select: { id: true },
    });
  });

  return created.id;
}

/** Crea un caso de prueba FEX 11 nuevo (venta + documento DTE siempre nuevos). */
export async function createFex11TestCase(
  params: CreateFex11TestCaseParams,
): Promise<CreateFex11TestCaseResult> {
  const { tenant_id, location_id } = params;

  const issuer     = await loadActiveIssuerConfig(tenant_id, location_id);
  const unit_id     = await ensureUnit();
  const category_id = await ensureCategory(tenant_id);
  const product_id  = await ensureProduct(tenant_id, unit_id, category_id);
  const customer_id = await ensureCustomer(tenant_id);

  const case_marker = buildCaseMarker();
  const sale_id = await createSaleAndExportDetails(tenant_id, location_id, customer_id, product_id, case_marker);
  const dte_document_id = await createDteDocument(
    tenant_id, location_id, sale_id, issuer.id,
    issuer.cod_estable_mh!, issuer.cod_punto_venta_mh!,
  );

  return { dte_document_id, sale_id, case_marker };
}
