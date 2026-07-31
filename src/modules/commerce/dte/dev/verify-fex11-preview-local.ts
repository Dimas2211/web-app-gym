// ─────────────────────────────────────────────────────────────────
// commerce/dte — verify-fex11-preview-local.ts
//
// Microfase F3-C8 — verificador dev-only (tsx) con PrismaClient REAL
// contra la base local, para el flujo:
//
//   DteOutgoingDocument (11, real) → Sale (real) → Customer extranjero
//   (real) → SaleExportDetails (real) → UnitOfMeasure.mh_unit_code (real)
//   → generateFexJsonForSale → AJV (fex-11.schema.json)
//
// Este script NO firma, NO transmite a Hacienda, NO toca MariaDB y NO
// habilita el tipo 11 en el pipeline real (create-pending-dte-for-sale,
// transmit-dte-document, UI). Es una prueba aislada, con datos marcados
// como FEX11_TEST_*, ejecutable solo contra una base local.
//
// Ejecutar (PowerShell):
//   $env:FEX11_LOCAL_TEST="YES"
//   npx tsx src/modules/commerce/dte/dev/verify-fex11-preview-local.ts
// ─────────────────────────────────────────────────────────────────

import "dotenv/config";
import { randomUUID } from "crypto";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import fexSchema from "../schemas/mh/fex-11.schema.json";
import { buildControlNumber } from "../utils/dte-control-number";
import { generateFexJsonForSale } from "../services/generate-fex-json.service";
import { previewFexJsonAction } from "../actions/preview-fex-json.action";

const MARKER = {
  customerCode: "FEX11-TEST-CUST",
  productCode:  "FEX11-TEST-001",
  unitSymbol:   "FEX11-U",
  unitName:     "FEX11_TEST_UNIT",
  categoryCode: "FEX11-TEST",
  categoryName: "FEX11_TEST_CATEGORY",
  saleMarker:   "FEX11_TEST_SALE",
};

class AbortError extends Error {}

function abort(message: string): never {
  throw new AbortError(message);
}

// ── 1. Guardas de ambiente local ───────────────────────────────────

const REMOTE_MARKERS = [
  "supabase", "pooler", "neon.tech", "railway", "render.com",
  "amazonaws", "aws", "azure", "digitalocean", "vercel",
];

function assertLocalEnvironment(): { dbHostSafe: string } {
  if (process.env.NODE_ENV === "production") {
    abort("NODE_ENV=production. Este script no puede ejecutarse en producción.");
  }
  if (process.env.FEX11_LOCAL_TEST !== "YES") {
    abort('Falta confirmación explícita. Define FEX11_LOCAL_TEST="YES" antes de ejecutar.');
  }

  const rawUrl = process.env.DATABASE_URL ?? "";
  if (!rawUrl) abort("DATABASE_URL no está definida.");

  let host = "";
  let dbName = "";
  try {
    const parsed = new URL(rawUrl);
    host = parsed.hostname.toLowerCase();
    dbName = parsed.pathname.replace(/^\//, "");
  } catch {
    abort("DATABASE_URL no es una URL válida. No se puede verificar que sea local.");
  }

  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  if (!isLocalHost) {
    abort(`DATABASE_URL apunta a host "${host}", no a localhost/127.0.0.1. Abortado por seguridad.`);
  }

  const lowerUrl = rawUrl.toLowerCase();
  for (const marker of REMOTE_MARKERS) {
    if (lowerUrl.includes(marker)) {
      abort(`DATABASE_URL contiene el indicador remoto "${marker}". Abortado por seguridad.`);
    }
  }

  return { dbHostSafe: `${host}/${dbName}` };
}

// ── 2. Determinar tenant/location activos ──────────────────────────

async function resolveTenantLocation(): Promise<{ tenant_id: string; location_id: string }> {
  const envTenant = process.env.FEX11_TEST_TENANT_ID;
  const envLocation = process.env.FEX11_TEST_LOCATION_ID;

  if (envTenant && envLocation) {
    const config = await prisma.dteIssuerConfig.findFirst({
      where: { tenant_id: envTenant, location_id: envLocation, environment: "TEST", is_active: true },
      select: { id: true },
    });
    if (!config) {
      abort(
        `No existe DteIssuerConfig activo (environment=TEST) para tenant_id="${envTenant}" ` +
        `location_id="${envLocation}". Configure el emisor DTE de prueba antes de continuar.`,
      );
    }
    return { tenant_id: envTenant, location_id: envLocation };
  }

  const configs = await prisma.dteIssuerConfig.findMany({
    where: { environment: "TEST", is_active: true },
    select: { tenant_id: true, location_id: true },
  });

  const distinct = new Map<string, { tenant_id: string; location_id: string }>();
  for (const c of configs) distinct.set(`${c.tenant_id}::${c.location_id}`, c);

  if (distinct.size === 0) {
    abort(
      "No se encontró ningún DteIssuerConfig activo con environment=TEST en la base local. " +
      "Configure uno o defina FEX11_TEST_TENANT_ID / FEX11_TEST_LOCATION_ID explícitamente.",
    );
  }
  if (distinct.size > 1) {
    const list = Array.from(distinct.values())
      .map((c) => `  - tenant_id=${c.tenant_id} location_id=${c.location_id}`)
      .join("\n");
    abort(
      "Se encontró más de un tenant/location con DteIssuerConfig TEST activo. " +
      "No se puede determinar cuál usar de forma segura. Candidatos:\n" + list +
      "\nDefina FEX11_TEST_TENANT_ID / FEX11_TEST_LOCATION_ID explícitamente.",
    );
  }

  return Array.from(distinct.values())[0];
}

// ── 3. Cargar y validar DteIssuerConfig TEST completo ───────────────

async function loadIssuerConfig(tenant_id: string, location_id: string) {
  const issuer = await prisma.dteIssuerConfig.findFirst({
    where: { tenant_id, location_id, environment: "TEST", is_active: true },
  });
  if (!issuer) abort("No se encontró DteIssuerConfig TEST activo para el tenant/location resuelto.");

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
    abort(
      `El DteIssuerConfig TEST de este tenant/location está incompleto para emitir FEX 11. ` +
      `Campos faltantes: ${missing.join(", ")}.`,
    );
  }

  return issuer;
}

// ── 4. Garantizar UnitOfMeasure con mh_unit_code válido ─────────────

async function ensureUnit(): Promise<{ id: string; created: boolean }> {
  const existingUsable = await prisma.unitOfMeasure.findFirst({
    where: { status: "active", mh_unit_code: { not: null } },
    select: { id: true },
  });
  if (existingUsable) return { id: existingUsable.id, created: false };

  const marker = await prisma.unitOfMeasure.findFirst({
    where: { symbol: MARKER.unitSymbol },
    select: { id: true },
  });
  if (marker) return { id: marker.id, created: false };

  const created = await prisma.unitOfMeasure.create({
    data: {
      name: MARKER.unitName,
      symbol: MARKER.unitSymbol,
      status: "active",
      mh_unit_code: "36", // CAT-014: Unidad
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

// ── 5. Garantizar ProductCategory + Product de prueba ───────────────

async function ensureCategory(tenant_id: string): Promise<{ id: string; created: boolean }> {
  const marker = await prisma.productCategory.findFirst({
    where: { tenant_id, code: MARKER.categoryCode },
    select: { id: true },
  });
  if (marker) return { id: marker.id, created: false };

  const anyExisting = await prisma.productCategory.findFirst({
    where: { tenant_id, status: "active" },
    select: { id: true },
  });
  if (anyExisting) return { id: anyExisting.id, created: false };

  const created = await prisma.productCategory.create({
    data: { tenant_id, code: MARKER.categoryCode, name: MARKER.categoryName, status: "active" },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

async function ensureProduct(
  tenant_id: string,
  unit_id: string,
  category_id: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.product.findFirst({
    where: { tenant_id, product_code: MARKER.productCode },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const created = await prisma.product.create({
    data: {
      tenant_id,
      product_code: MARKER.productCode,
      name: "FEX11_TEST_PRODUCT",
      product_type: "PRODUCT",
      status: "ACTIVE",
      is_stockable: false,
      allow_purchase: false,
      allow_sale: true,
      category_id,
      unit_id,
      sale_price: new Prisma.Decimal(500),
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

// ── 6. Garantizar Customer extranjero de prueba ─────────────────────

async function ensureCustomer(tenant_id: string): Promise<{ id: string; name: string; created: boolean }> {
  const existing = await prisma.customer.findFirst({
    where: { tenant_id, customer_code: MARKER.customerCode },
    select: { id: true, name: true },
  });

  const data = {
    name: "FEX11_TEST_CUSTOMER",
    legal_name: "FEX11 TEST CUSTOMER LLC",
    taxpayer_type: "EXCLUDED_SUBJECT" as const,
    id_type_code: "03", // pasaporte
    nit: null,
    nrc: null,
    dui: "AB1234567",
    activity_code: null,
    activity_name: "COMERCIO AL POR MAYOR",
    dept_code: null,
    municipality_code: null,
    address_complement: "1234 MAIN ST, MIAMI FL",
    phone: "+13051234567",
    email: "fex11-test-customer@example.com",
    status: "active" as const,
    is_foreign: true,
    country_code: "9540", // CAT-020: Estados Unidos
    country_name: "ESTADOS UNIDOS",
    customer_person_type: "2", // natural
  };

  if (existing) {
    const updated = await prisma.customer.update({
      where: { id: existing.id },
      data,
      select: { id: true, name: true },
    });
    return { id: updated.id, name: updated.name, created: false };
  }

  const created = await prisma.customer.create({
    data: { tenant_id, customer_code: MARKER.customerCode, ...data },
    select: { id: true, name: true },
  });
  return { id: created.id, name: created.name, created: true };
}

// ── 7. Garantizar Sale + SaleExportDetails de prueba ────────────────

async function ensureSale(
  tenant_id: string,
  location_id: string,
  customer_id: string,
  product_id: string,
): Promise<{ sale_id: string; created: boolean; export_details_created: boolean }> {
  const existingSale = await prisma.sale.findFirst({
    where: { tenant_id, location_id, customer_id, primary_dte_type_code: "11", notes: MARKER.saleMarker },
    select: { id: true },
  });

  if (existingSale) {
    const existingDetails = await prisma.saleExportDetails.findUnique({
      where: { sale_id: existingSale.id },
      select: { id: true },
    });
    if (existingDetails) {
      return { sale_id: existingSale.id, created: false, export_details_created: false };
    }
    await prisma.saleExportDetails.create({
      data: {
        tenant_id,
        sale_id: existingSale.id,
        country_code: "9540",
        country_name: "ESTADOS UNIDOS",
        customer_person_type: "2",
        item_type_export: 1,
        fiscal_precinct_code: "10",
        regime_code: "EX01",
        incoterm_code: "FOB",
        incoterm_desc: "FREE ON BOARD",
        insurance_amount: new Prisma.Decimal(0),
        freight_amount: new Prisma.Decimal(0),
      },
    });
    return { sale_id: existingSale.id, created: false, export_details_created: true };
  }

  const unitPrice = 500;
  const quantity = 10;
  const lineTotal = unitPrice * quantity;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const result = await prisma.$transaction(async (tx) => {
    const maxSeqRow = await tx.$queryRaw<[{ max_seq: number | null }]>`
      SELECT MAX("sale_sequence") AS max_seq
      FROM   "sales"
      WHERE  "tenant_id"   = ${tenant_id}
        AND  "location_id" = ${location_id}
        AND  "sale_year"   = ${year}
        AND  "sale_month"  = ${month}
    `;
    const sequence = (Number(maxSeqRow[0]?.max_seq) || 0) + 1;
    const sale_code = `VTA-${year}-${String(month).padStart(2, "0")}-${String(sequence).padStart(4, "0")}`;

    const sale = await tx.sale.create({
      data: {
        tenant_id,
        location_id,
        customer_id,
        sale_code,
        sale_year: year,
        sale_month: month,
        sale_sequence: sequence,
        sale_date: new Date(`${now.toISOString().slice(0, 10)}T00:00:00`),
        status: "CONFIRMED",
        payment_status: "PAID",
        primary_dte_type_code: "11",
        payment_method_code: "01",
        condition_operation_code: "1",
        subtotal: new Prisma.Decimal(lineTotal),
        discount_amount: new Prisma.Decimal(0),
        tax_amount: new Prisma.Decimal(0),
        total_amount: new Prisma.Decimal(lineTotal),
        inventory_moved: true,
        notes: MARKER.saleMarker,
        confirmed_at: now,
      },
      select: { id: true },
    });

    await tx.saleItem.create({
      data: {
        sale_id: sale.id,
        product_id,
        line_number: 1,
        product_code_snapshot: MARKER.productCode,
        product_name_snapshot: "FEX11_TEST_PRODUCT",
        product_type_snapshot: "PRODUCT",
        is_stockable_snapshot: false,
        quantity: new Prisma.Decimal(quantity),
        unit_price: new Prisma.Decimal(unitPrice),
        discount_amount: new Prisma.Decimal(0),
        tax_rate_snapshot: new Prisma.Decimal(0),
        tax_amount: new Prisma.Decimal(0),
        line_subtotal: new Prisma.Decimal(lineTotal),
        line_total: new Prisma.Decimal(lineTotal),
      },
    });

    await tx.salePayment.create({
      data: {
        sale_id: sale.id,
        payment_method_code: "01",
        mh_payment_form_code: "01",
        amount: new Prisma.Decimal(lineTotal),
        paid_at: now,
      },
    });

    await tx.saleExportDetails.create({
      data: {
        tenant_id,
        sale_id: sale.id,
        country_code: "9540",
        country_name: "ESTADOS UNIDOS",
        customer_person_type: "2",
        item_type_export: 1,
        fiscal_precinct_code: "10",
        regime_code: "EX01",
        incoterm_code: "FOB",
        incoterm_desc: "FREE ON BOARD",
        insurance_amount: new Prisma.Decimal(0),
        freight_amount: new Prisma.Decimal(0),
      },
    });

    return sale;
  });

  return { sale_id: result.id, created: true, export_details_created: true };
}

// ── 8. Garantizar DteOutgoingDocument tipo 11 de prueba ─────────────

async function ensureDteDocument(
  tenant_id: string,
  location_id: string,
  sale_id: string,
  issuer_config_id: string,
  cod_estable_mh: string,
  cod_punto_venta_mh: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.dteOutgoingDocument.findFirst({
    where: { tenant_id, location_id, sale_id, dte_type_code: "11" },
    select: { id: true, signed_jws: true, dte_status: true },
  });

  if (existing) {
    if (existing.signed_jws) {
      abort(`El DteOutgoingDocument de prueba (${existing.id}) ya está firmado. No se puede reutilizar.`);
    }
    return { id: existing.id, created: false };
  }

  const year = new Date().getFullYear();

  const created = await prisma.$transaction(async (tx) => {
    await tx.dteCorrelative.upsert({
      where: {
        tenant_id_location_id_environment_dte_type_code_year: {
          tenant_id, location_id, environment: "TEST", dte_type_code: "11", year,
        },
      },
      create: { tenant_id, location_id, environment: "TEST", dte_type_code: "11", year, last_sequence: 0 },
      update: {},
    });

    const correlative = await tx.dteCorrelative.update({
      where: {
        tenant_id_location_id_environment_dte_type_code_year: {
          tenant_id, location_id, environment: "TEST", dte_type_code: "11", year,
        },
      },
      data: { last_sequence: { increment: 1 } },
      select: { last_sequence: true },
    });

    const generation_code = randomUUID().toUpperCase();
    const control_number = buildControlNumber({
      dte_type_code: "11",
      cod_estable_mh,
      cod_punto_venta_mh,
      sequence: correlative.last_sequence,
    });

    return tx.dteOutgoingDocument.create({
      data: {
        tenant_id,
        location_id,
        sale_id,
        issuer_config_id,
        dte_type_code: "11",
        environment: "TEST",
        generation_code,
        control_number,
        dte_status: "PENDING_GENERATION",
        retry_count: 0,
      },
      select: { id: true },
    });
  });

  return { id: created.id, created: true };
}

// ── 9. AJV local (misma config que validate-dte-json-schema.service) ─

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

// ── main ─────────────────────────────────────────────────────────

async function main() {
  const { dbHostSafe } = assertLocalEnvironment();
  console.log(`Ambiente local verificado. DB: ${dbHostSafe}`);

  const { tenant_id, location_id } = await resolveTenantLocation();
  console.log(`Tenant/location resueltos: tenant_id=${tenant_id} location_id=${location_id}`);

  const issuer = await loadIssuerConfig(tenant_id, location_id);

  const unit = await ensureUnit();
  const category = await ensureCategory(tenant_id);
  const product = await ensureProduct(tenant_id, unit.id, category.id);
  const customer = await ensureCustomer(tenant_id);
  const sale = await ensureSale(tenant_id, location_id, customer.id, product.id);
  const dteDoc = await ensureDteDocument(
    tenant_id, location_id, sale.sale_id, issuer.id,
    issuer.cod_estable_mh!, issuer.cod_punto_venta_mh!,
  );

  console.log("\n── Origen de datos ──");
  console.log(`Unidad de medida:    ${unit.created ? "creada" : "reutilizada"}`);
  console.log(`Categoría producto:  ${category.created ? "creada" : "reutilizada"}`);
  console.log(`Producto:            ${product.created ? "creado" : "reutilizado"}`);
  console.log(`Cliente extranjero:  ${customer.created ? "creado" : "reutilizado/actualizado"}`);
  console.log(`Venta:               ${sale.created ? "creada" : "reutilizada"}`);
  console.log(`Detalle exportación: ${sale.export_details_created ? "creado" : "reutilizado"}`);
  console.log(`Documento DTE 11:    ${dteDoc.created ? "creado" : "reutilizado"}`);

  console.log("\n── generateFexJsonForSale ──");
  const genResult = await generateFexJsonForSale({ tenant_id, location_id, dte_document_id: dteDoc.id });

  if (!genResult.ok) {
    abort(`generateFexJsonForSale falló: ${genResult.error}`);
  }
  console.log("generateFexJsonForSale: OK");

  console.log("\n── previewFexJsonAction (requiere sesión server) ──");
  try {
    const previewResult = await previewFexJsonAction(dteDoc.id);
    if (previewResult.ok) {
      console.log("previewFexJsonAction: OK (ejecutado con sesión disponible)");
    } else {
      console.log(`previewFexJsonAction: respondió ok=false — ${previewResult.error}`);
    }
  } catch (err) {
    console.log(
      "previewFexJsonAction no es ejecutable desde este script (depende de sesión/contexto de " +
      "server action, inexistente en tsx). Se valida el mismo flujo vía generateFexJsonForSale + AJV local.",
    );
    console.log(`Detalle técnico: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log("\n── AJV (fex-11.schema.json) sobre datos reales ──");
  const ajvResult = validateFexAjv(genResult.json);
  if (!ajvResult.ok) {
    console.log("AJV: FALLA");
    for (const e of ajvResult.errors) console.log(`  - ${e}`);
    abort("El JSON generado con datos reales no cumple el schema oficial MH para FEX 11.");
  }
  console.log("AJV: OK");

  const { identificacion, receptor, resumen, cuerpoDocumento } = genResult.json;
  console.log("\n── Resumen seguro ──");
  console.log(`dte_document_id:     ${dteDoc.id}`);
  console.log(`sale_id:             ${sale.sale_id}`);
  console.log(`customer name:       ${receptor.nombre}`);
  console.log(`tipoDte:             ${identificacion.tipoDte}`);
  console.log(`numeroControl:       ${identificacion.numeroControl}`);
  console.log(`montoTotalOperacion: ${resumen.montoTotalOperacion}`);
  console.log(`totalPagar:          ${resumen.totalPagar}`);
  console.log(`cantidad de líneas:  ${cuerpoDocumento.length}`);
  console.log(`resultado AJV:       OK`);

  console.log("\nVERIFICACIÓN LOCAL FEX 11 OK");
}

main()
  .catch((err) => {
    if (err instanceof AbortError) {
      console.error(`\nABORTADO: ${err.message}`);
    } else {
      console.error("\nERROR INESPERADO:");
      console.error(err instanceof Error ? err.message : err);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
