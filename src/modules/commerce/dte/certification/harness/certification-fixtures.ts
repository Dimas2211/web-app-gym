// ─────────────────────────────────────────────────────────────────
// commerce/dte/certification/harness — certification-fixtures.ts
//
// DTE-INTERNAL-CERTIFICATION — SOLO TESTS / CERTIFICACIÓN.
//
// Fixtures 100% sintéticos, generados por corrida:
// - tenant/location/usuario/emisor con UUID nuevos — nunca se resuelve
//   ningún cliente real (TrustMe/GYM/MetaTraining) por nombre ni id;
// - NIT/NRC con forma válida pero reservados para certificación
//   (prefijo 0000…), nombres con marca "CERT";
// - credenciales DTE (MH + firmador) aleatorias por corrida, cifradas
//   con la utilidad productiva AES-256-GCM y una PLATFORM_ENCRYPTION_KEY
//   efímera (nunca la real);
// - catálogos mínimos (municipio, país CAT-020, unidad CAT-014, tributo
//   C3) con los códigos oficiales públicos que ya usa el código
//   productivo — sin inventar equivalencias.
// Todo vive en la InMemoryPrismaDb de la corrida: no hay limpieza que
// hacer en ninguna base real porque ninguna base real se toca.
// ─────────────────────────────────────────────────────────────────

import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { encryptDteCredentialPayload } from "../../lib/dte-credential-encryption";
import type { InMemoryPrismaDb } from "./in-memory-prisma";
import type { FakeSignerIdentity } from "./fake-fiscal-network";

/** Prefijo reservado: todo NIT/NRC sintético empieza así — ningún dato fiscal real. */
export const CERT_NIT_PREFIX = "0000";

export interface SyntheticLocation {
  locationId: string;
  /** null para una location sin emisor DTE configurado (guard "No issuer"). */
  issuerConfigId: string | null;
  identity: FakeSignerIdentity | null;
  issuerNit: string | null;
}

export interface SyntheticTenant {
  key: string;
  tenantId: string;
  userId: string;
  locations: Record<string, SyntheticLocation>;
  productServiceId: string;
  productExportServiceId: string;
  productNoMhUnitId: string;
  customerConsumerDuiId: string;
  customerContributorId: string;
  customerContributorNoNrcId: string;
  customerForeignId: string;
  customerForeignLegacyCountryId: string;
  customerForeignSvId: string;
  supplierExcludedNaturalId: string;
  supplierRegisteredId: string;
}

const secret = (bytes = 18) => randomBytes(bytes).toString("base64url");
const digits = (n: number) => Array.from(randomBytes(n), (b) => String(b % 10)).join("");

/** NIT sintético de 14 dígitos con prefijo reservado de certificación. */
export function syntheticNit(): string {
  return CERT_NIT_PREFIX + digits(10);
}

/** Clave efímera de 32 bytes para PLATFORM_ENCRYPTION_KEY durante la corrida. */
export function ephemeralEncryptionKey(): string {
  return randomBytes(32).toString("base64");
}

// ── Catálogos de referencia (por base runtime) ───────────────────

export async function seedReferenceCatalogs(db: InMemoryPrismaDb) {
  const c = db.client;
  // Santa Tecla — misma jerarquía territorial que el código FEX v3 ya
  // documenta (05 / 0506 / 050611 → CAT-013 "LA LIBERTAD SUR" = 28).
  await c.municipality.create({
    data: {
      dept_code: "05", dept_name: "LA LIBERTAD", code: "11", name: "SANTA TECLA",
      dte_full_code: "0511", district_code: "050611", district_name: "SANTA TECLA",
      new_municipality_code: "0506", new_municipality_name: "LA LIBERTAD SUR", status: "active",
    },
  });
  await c.country.create({ data: { code: "US", name: "Estados Unidos", status: "active" } });
  await c.country.create({ data: { code: "SV", name: "El Salvador", status: "active" } });
}

/** Catálogo global de referencia (DteCatalogItem) — vive fuera de la runtime DB (GLOBAL_REFERENCE). */
export async function seedGlobalReferenceCatalog(db: InMemoryPrismaDb) {
  await db.client.dteCatalogItem.create({
    data: { catalog_code: "CAT-015", item_code: "C3", item_label: "Impuesto al valor agregado (exportaciones) 0%", is_active: true },
  });
}

// ── Tenant sintético ─────────────────────────────────────────────

export async function seedSyntheticTenant(
  db: InMemoryPrismaDb,
  key: string,
  locationKeys: string[],
  options: { withoutIssuer?: string[] } = {},
): Promise<SyntheticTenant> {
  const c = db.client;
  const tenantId = randomUUID();
  const userId = randomUUID();
  const tag = `CERT-${key}`;

  await c.runtimeTenant.create({ data: { id: tenantId, name: `TENANT SINTETICO ${tag}`, slug: `cert-dte-${key.toLowerCase()}-${tenantId.slice(0, 8)}` } });

  const locations: Record<string, SyntheticLocation> = {};
  for (const [index, lk] of locationKeys.entries()) {
    const locationId = randomUUID();
    await c.branch.create({ data: { id: locationId, tenant_id: tenantId, name: `SUCURSAL SINTETICA ${tag}-${lk}` } });
    if (options.withoutIssuer?.includes(lk)) {
      locations[lk] = { locationId, issuerConfigId: null, identity: null, issuerNit: null };
      continue;
    }

    const issuerNit = syntheticNit();
    const identity: FakeSignerIdentity = {
      signerUrl: `https://signer-${key.toLowerCase()}-${lk.toLowerCase()}.dte-cert.invalid/firmardocumento/`,
      signerNit: issuerNit,
      signerPrivateKeyPassword: `cert-pk-${secret()}`,
      mhUser: issuerNit,
      mhPassword: `cert-mh-${secret()}`,
    };
    const issuer = await c.dteIssuerConfig.create({
      data: {
        tenant_id: tenantId,
        location_id: locationId,
        environment: "TEST",
        nit: issuerNit,
        nrc: `9${digits(5)}`,
        name: `EMISOR SINTETICO ${tag}-${lk}`,
        legal_name: `EMISOR SINTETICO ${tag}-${lk} S.A. DE C.V.`,
        activity_code: "62010",
        activity_name: "PROGRAMACION INFORMATICA",
        establishment_code: `M00${index + 1}`,
        establishment_type_code: "02",
        point_of_sale_code: `P00${index + 1}`,
        cod_estable_mh: `M00${index + 1}`,
        cod_punto_venta_mh: `P00${index + 1}`,
        dept_code: "05",
        municipality_code: "11",
        address_complement: "DIRECCION SINTETICA DE CERTIFICACION",
        phone: "22220000",
        email: `emisor-${key.toLowerCase()}-${lk.toLowerCase()}@example.com`,
        is_active: true,
      },
      select: { id: true },
    });
    await c.dteCredential.create({
      data: {
        issuer_config_id: issuer.id,
        credential_type: "MH_CREDENTIALS",
        encrypted_payload: encryptDteCredentialPayload({
          apiUser: identity.mhUser,
          apiPassword: identity.mhPassword,
          signerUrl: identity.signerUrl,
          signerNit: identity.signerNit,
          signerPrivateKeyPassword: identity.signerPrivateKeyPassword,
        }),
        is_active: true,
      },
    });
    locations[lk] = { locationId, issuerConfigId: issuer.id, identity, issuerNit };
  }

  await c.user.create({
    data: {
      id: userId, tenant_id: tenantId, email: `cert-admin-${key.toLowerCase()}@example.com`,
      password_hash: "not-a-real-hash", first_name: "Admin", last_name: tag, role: "super_admin",
    },
  });

  // ── Catálogo comercial ─────────────────────────────────────────
  const unit59 = await c.unitOfMeasure.create({ data: { name: "Unidad", symbol: `${tag}-UND`, mh_unit_code: "59" }, select: { id: true } });
  const unitNoMh = await c.unitOfMeasure.create({ data: { name: "Sin codigo MH", symbol: `${tag}-NOMH`, mh_unit_code: null }, select: { id: true } });
  const iva13 = await c.taxRate.create({ data: { tenant_id: tenantId, name: "IVA 13%", rate: new Prisma.Decimal(13) }, select: { id: true } });
  const category = await c.productCategory.create({ data: { tenant_id: tenantId, code: `${tag}-CAT`, name: "CERT SERVICIOS" }, select: { id: true } });

  const product = (code: string, name: string, unitId: string, taxRateId: string | null) =>
    c.product.create({
      data: {
        tenant_id: tenantId, product_code: code, name, product_type: "SERVICE", is_stockable: false,
        allow_purchase: true, allow_sale: true, category_id: category.id, unit_id: unitId, tax_rate_id: taxRateId,
        sale_price: new Prisma.Decimal(113),
      },
      select: { id: true },
    });
  const productService = await product(`SRV-${tag}`, "SERVICIO SINTETICO DE CERTIFICACION", unit59.id, iva13.id);
  const productExport = await product(`EXP-${tag}`, "SERVICIO DE EXPORTACION SINTETICO", unit59.id, null);
  const productNoMh = await product(`NOMH-${tag}`, "SERVICIO SIN UNIDAD MH", unitNoMh.id, null);

  // ── Clientes ───────────────────────────────────────────────────
  const customer = (code: string, data: Omit<Prisma.CustomerUncheckedCreateInput, "tenant_id" | "customer_code">) =>
    c.customer.create({ data: { tenant_id: tenantId, customer_code: `${tag}-${code}`, status: "active", ...data }, select: { id: true } });

  // Consumidor final identificado (DUI ########-#): requerido para poder
  // invalidar una FE 01 — anulacion-schema-v2 exige documento del receptor.
  const consumerDui = await customer("CF-DUI", {
    taxpayer_type: "FINAL_CONSUMER", id_type_code: "13", dui: `0${digits(7)}-${digits(1)}`,
    name: `CONSUMIDOR IDENTIFICADO ${tag}`, email: `cf-${key.toLowerCase()}@example.com`,
  });
  const contributorBase = {
    taxpayer_type: "REGISTERED_TAXPAYER", id_type_code: "36", activity_code: "62010",
    activity_name: "PROGRAMACION INFORMATICA", dept_code: "05", municipality_code: "11",
    address_complement: "DIRECCION SINTETICA RECEPTOR", phone: "22221111",
  } as const;
  const contributor = await customer("CONTRIB", {
    ...contributorBase, name: `CONTRIBUYENTE SINTETICO ${tag} S.A. DE C.V.`, nit: syntheticNit(), nrc: `8${digits(5)}`,
    email: `receptor-${key.toLowerCase()}@example.com`,
  });
  const contributorNoNrc = await customer("CONTRIB-NONRC", {
    ...contributorBase, name: `CONTRIBUYENTE SIN NRC ${tag}`, nit: syntheticNit(), nrc: null,
    email: `receptor-nonrc-${key.toLowerCase()}@example.com`,
  });
  const foreignBase = {
    is_foreign: true, id_type_code: "03", dui: `CERT${digits(6)}`, activity_name: "SERVICIOS PROFESIONALES",
    address_complement: "100 SYNTHETIC ST, TESTVILLE", phone: "+15550000000", customer_person_type: "2",
  } as const;
  const foreign = await customer("FOREIGN-US", {
    ...foreignBase, name: `FOREIGN CERT CUSTOMER ${tag} LLC`, country_code: "US", country_name: "Estados Unidos",
    email: `foreign-${key.toLowerCase()}@example.com`,
  });
  const foreignLegacy = await customer("FOREIGN-LEGACY", {
    ...foreignBase, name: `FOREIGN LEGACY CODE ${tag}`, country_code: "9450", country_name: "PAIS CODIGO LEGADO",
    email: `foreign-legacy-${key.toLowerCase()}@example.com`,
  });
  const foreignSv = await customer("FOREIGN-SV", {
    ...foreignBase, name: `FOREIGN SV MISCONFIG ${tag}`, country_code: "SV", country_name: "El Salvador",
    email: `foreign-sv-${key.toLowerCase()}@example.com`,
  });

  // ── Proveedores ────────────────────────────────────────────────
  const supplierBase = {
    tenant_id: tenantId, status: "active", activity_code: "74909", activity_name: "SERVICIOS PROFESIONALES",
    dept_code: "05", municipality_code: "11", address_complement: "DIRECCION SINTETICA PROVEEDOR",
    phone: "22223333",
  } as const;
  const excluded = await c.supplier.create({
    data: {
      ...supplierBase, supplier_code: `${tag}-SE`, name: `SUJETO EXCLUIDO SINTETICO ${tag}`,
      taxpayer_type: "EXCLUDED_SUBJECT", person_type: "NATURAL_PERSON", id_type_code: "13",
      dui: `0${digits(8)}`, email: `se-${key.toLowerCase()}@example.com`,
    },
    select: { id: true },
  });
  const registered = await c.supplier.create({
    data: {
      ...supplierBase, supplier_code: `${tag}-RT`, name: `PROVEEDOR CONTRIBUYENTE ${tag}`,
      taxpayer_type: "SMALL_TAXPAYER", person_type: "LEGAL_ENTITY", id_type_code: "00",
      nit: syntheticNit(), nrc: `7${digits(5)}`, email: `prov-${key.toLowerCase()}@example.com`,
    },
    select: { id: true },
  });

  return {
    key, tenantId, userId, locations,
    productServiceId: productService.id,
    productExportServiceId: productExport.id,
    productNoMhUnitId: productNoMh.id,
    customerConsumerDuiId: consumerDui.id,
    customerContributorId: contributor.id,
    customerContributorNoNrcId: contributorNoNrc.id,
    customerForeignId: foreign.id,
    customerForeignLegacyCountryId: foreignLegacy.id,
    customerForeignSvId: foreignSv.id,
    supplierExcludedNaturalId: excluded.id,
    supplierRegisteredId: registered.id,
  };
}

// ── Compra sintética (estado en que purchases deja una compra FSE confirmada) ──

export interface SyntheticPurchaseInput {
  supplierId: string;
  productId: string;
  quantity: number;
  unitCost: number;
  paymentNature: "SERVICES" | "GOODS" | "OTHER";
  withholding: { applies: boolean; rate: number | null; base: number; amount: number };
  documentType?: string;
}

export async function seedConfirmedPurchase(
  db: InMemoryPrismaDb,
  tenant: SyntheticTenant,
  locationKey: string,
  input: SyntheticPurchaseInput,
): Promise<string> {
  const c = db.client;
  const location = tenant.locations[locationKey];
  const subtotal = Math.round(input.quantity * input.unitCost * 100) / 100;
  const now = new Date();
  const seq = (await c.purchase.count({ where: { tenant_id: tenant.tenantId } })) + 1;
  const purchase = await c.purchase.create({
    data: {
      tenant_id: tenant.tenantId,
      location_id: location.locationId,
      supplier_id: input.supplierId,
      purchase_code: `CERT-CMP-${String(seq).padStart(4, "0")}`,
      purchase_year: now.getFullYear(),
      purchase_month: now.getMonth() + 1,
      purchase_date: now,
      status: "CONFIRMED",
      confirmed_at: now,
      confirmed_by: tenant.userId,
      document_type: input.documentType ?? "FSE",
      payment_condition: "CON",
      cancellation_type: "EFE",
      payment_nature: input.paymentNature,
      subtotal: new Prisma.Decimal(subtotal),
      tax_amount: new Prisma.Decimal(0),
      total_amount: new Prisma.Decimal(subtotal),
      income_tax_withholding_applies: input.withholding.applies,
      income_tax_withholding_rate: input.withholding.rate === null ? null : new Prisma.Decimal(input.withholding.rate),
      income_tax_withholding_base: new Prisma.Decimal(input.withholding.base),
      income_tax_withholding_amount: new Prisma.Decimal(input.withholding.amount),
      notes: "Compra sintética de certificación interna DTE",
      created_by: tenant.userId,
      updated_by: tenant.userId,
    },
    select: { id: true },
  });
  await c.purchaseItem.create({
    data: {
      purchase_id: purchase.id,
      product_id: input.productId,
      dte_line_number: 1,
      quantity: new Prisma.Decimal(input.quantity),
      unit_cost: new Prisma.Decimal(input.unitCost),
      line_subtotal: new Prisma.Decimal(subtotal),
      line_total: new Prisma.Decimal(subtotal),
    },
  });
  return purchase.id;
}
