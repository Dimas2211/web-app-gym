// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-sale.service.ts
//
// F3-C21 — Módulo comercial real de Factura de Exportación 11.
//
// Orquesta la creación de una venta de exportación real reutilizando
// los servicios ya probados de commerce/sales (createSaleDraft,
// addSaleItemToDraft, confirmSale) para mantener el mismo ciclo
// DRAFT/CONFIRMED/CANCELLED, mismo inventario, misma caja, mismos
// pagos que FE/CCFE (ver docs/modules/fex11-data-contract.md §2).
//
// La creación del DteOutgoingDocument tipo 11 (reserva de correlativo
// y numeroControl) se mantiene como flujo dedicado y separado de
// dte-outgoing.service.ts (que es MVP-only para "01"/"03"),
// parametrizada con datos reales.
//
// No firma, no transmite a Hacienda, no toca MariaDB — eso lo hacen
// las actions ya existentes (generateFexJsonForSaleAction,
// signDteDocumentAction, transmitDteDocumentAction,
// deliverDteToExternalDbAction), reutilizadas sin cambios.
// ─────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createSaleDraft, addSaleItemToDraft, confirmSale } from "../../services/sale.service";
import { reserveDteControlNumber } from "../../../dte/services/dte-correlative.service";
import { isFex11Environment, type Fex11Environment } from "../../../dte/utils/fex11-environment";
import { listDteCatalogItems } from "../../../dte/queries/list-dte-catalog-items";
import { DTE_CATALOG_CODES } from "../../../dte/types/dte-catalog.types";
import { CAT014_UNITS } from "../../../../../../prisma/seeds/data/cat014-units";
import {
  validateExportSaleBusinessRules,
  validateForeignCustomerCatalogs,
  validateFexCountryCode,
  type ExportProductForValidation,
  type FexCountryItem,
} from "../utils/fex-validation";
import type { CreateForeignCustomerInput, CreateExportSaleInput } from "../schemas/export-sale.schemas";

// ── Resultados públicos ────────────────────────────────────────────

export type CreateForeignCustomerResult =
  | { ok: true; id: string; customer_code: string }
  | { ok: false; error: string; field?: string };

export type UpdateForeignCustomerCountryResult =
  | { ok: true; country_code: string; country_name: string }
  | { ok: false; error: string };

export type CreateExportSaleResult =
  | { ok: true; sale_id: string; sale_code: string; dte_document_id: string }
  | { ok: false; error: string; field?: string; errors?: string[] };

// ── Crear cliente extranjero (alta rápida) ────────────────────────
//
// No reutiliza customers/services/customer.service.ts porque ese
// servicio no modela los campos de exportación (is_foreign,
// country_code, country_name, customer_person_type) en su Zod schema
// público. Se apoya en el mismo maestro Customer (no lo duplica) y
// usa un código propio con prefijo EXP- para no colisionar con el
// generador numérico del maestro de clientes.

function buildForeignCustomerCode(): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `EXP-${stamp}`;
}

export async function createForeignCustomer(
  tenant_id: string,
  user_id:   string,
  input:     CreateForeignCustomerInput,
  db: PrismaClient = prisma,
): Promise<CreateForeignCustomerResult> {
  const [country, personTypes, idTypes] = await Promise.all([
    // FEX-PROD-0B — receptor.codPais de FEX v3 = CAT-020 vigente (Country).
    findActiveCountry(input.country_code, db),
    listDteCatalogItems({ catalog_code: DTE_CATALOG_CODES.CAT_029_TIPO_PERSONA }),
    listDteCatalogItems({ catalog_code: DTE_CATALOG_CODES.CAT_022_TIPO_IDENTIFICACION }),
  ]);

  const catalogErrors = validateForeignCustomerCatalogs(input, {
    countries: country ? [country] : [],
    personTypes,
    idTypes,
  });
  if (catalogErrors.length > 0) {
    return { ok: false, error: catalogErrors[0] };
  }

  const customer_code = buildForeignCustomerCode();

  const id_type_code = input.id_type_code;
  const nit = id_type_code === "36" ? input.document_number : null;
  const dui = id_type_code !== "36" ? input.document_number : null;

  try {
    const created = await db.customer.create({
      data: {
        tenant_id,
        customer_code,
        name:                  input.name,
        legal_name:            input.legal_name ?? null,
        taxpayer_type:         "EXCLUDED_SUBJECT",
        id_type_code,
        nit,
        dui,
        activity_name:         input.activity_name,
        address_complement:    input.address_complement,
        phone:                 input.phone ?? null,
        email:                 input.email ?? null,
        status:                "active",
        is_foreign:            true,
        // Nombre oficial CAT-020, no el texto enviado por el cliente.
        country_code:          country!.code,
        country_name:          country!.name,
        customer_person_type:  input.customer_person_type,
        created_by:            user_id,
        updated_by:            user_id,
      },
      select: { id: true, customer_code: true },
    });

    return { ok: true, id: created.id, customer_code: created.customer_code };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, field: "customer_code", error: "Conflicto generando el código de cliente. Reintenta." };
    }
    throw e;
  }
}

// ── País CAT-020 vigente (modelo Country) ──────────────────────────

async function findActiveCountry(
  code: string | null | undefined,
  db: PrismaClient,
): Promise<FexCountryItem | null> {
  if (!code) return null;
  return db.country.findFirst({
    where:  { code, status: "active" },
    select: { code: true, name: true },
  });
}

// ── Corregir país de un cliente extranjero (FEX-PROD-0B) ──────────
//
// Clientes creados con el catálogo de compatibilidad FEX v1 guardan un
// country_code numérico legado. No se convierten automáticamente: el
// usuario elige explícitamente el país CAT-020 correcto y solo se
// actualizan country_code/country_name de ese cliente.

export async function updateForeignCustomerCountry(
  tenant_id:    string,
  user_id:      string,
  customer_id:  string,
  country_code: string,
  db: PrismaClient = prisma,
): Promise<UpdateForeignCustomerCountryResult> {
  const customer = await db.customer.findFirst({
    where:  { id: customer_id, tenant_id, status: "active" },
    select: { id: true, is_foreign: true },
  });
  if (!customer) {
    return { ok: false, error: "El cliente no existe o está inactivo en este tenant." };
  }
  if (!customer.is_foreign) {
    return { ok: false, error: "Solo se puede corregir el país de clientes extranjeros." };
  }

  const country = await findActiveCountry(country_code, db);
  const countryError = validateFexCountryCode(country_code, country ? [country] : []);
  if (countryError) return { ok: false, error: countryError };

  await db.customer.update({
    where: { id: customer.id },
    data:  { country_code: country!.code, country_name: country!.name, updated_by: user_id },
  });

  return { ok: true, country_code: country!.code, country_name: country!.name };
}

// ── Resolver ambiente fiscal efectivo y emisor activo ─────────────
//
// FEX-PROD-1 — mismo patrón fiscal efectivo que FE/CCFE
// (create-pending-dte-simple.action.ts): el ambiente es el del ÚNICO
// DteIssuerConfig activo de tenant+location. Con TEST y PRODUCTION
// activos a la vez no se infiere nada. Nunca depende de NODE_ENV y no
// hay fallback TEST <-> PRODUCTION: el emisor se carga después con el
// ambiente exacto.

export type ResolveFexEnvironmentResult =
  | { ok: true; environment: Fex11Environment }
  | { ok: false; error: string };

export async function resolveEffectiveFexEnvironment(
  tenant_id:   string,
  location_id: string,
  db: PrismaClient = prisma,
): Promise<ResolveFexEnvironmentResult> {
  const active = await db.dteIssuerConfig.findMany({
    where:  { tenant_id, location_id, is_active: true },
    select: { environment: true },
    take:   3,
  });
  if (active.length === 0) {
    return { ok: false, error: "No existe una configuración DTE activa para esta sucursal. Configure el emisor DTE primero." };
  }
  if (active.length > 1) {
    return { ok: false, error: "Hay más de una configuración DTE activa (TEST y PRODUCTION). Desactive una de las dos antes de emitir." };
  }
  const environment = active[0].environment;
  if (!isFex11Environment(environment)) {
    return { ok: false, error: "Ambiente DTE del emisor no reconocido." };
  }
  return { ok: true, environment };
}

/**
 * UI (páginas): FEX 11 disponible para la sucursal si existe exactamente
 * un DteIssuerConfig activo con ambiente fiscal válido. El gate de módulo
 * fiscal.dte lo aplica resolveSalesExportAvailability. Fail-closed.
 */
export async function resolveFex11AvailabilityForLocation(
  tenant_id:   string,
  location_id: string,
  db: PrismaClient = prisma,
): Promise<{ enabled: boolean; environment: Fex11Environment | null }> {
  const env = await resolveEffectiveFexEnvironment(tenant_id, location_id, db);
  if (!env.ok) return { enabled: false, environment: null };
  return { enabled: true, environment: env.environment };
}

interface ActiveIssuer {
  id:                 string;
  environment:        Fex11Environment;
  cod_estable_mh:     string;
  cod_punto_venta_mh: string;
}

export async function loadActiveIssuerConfigOrError(
  tenant_id:   string,
  location_id: string,
  environment: Fex11Environment,
  db: PrismaClient = prisma,
): Promise<{ ok: true; issuer: ActiveIssuer } | { ok: false; error: string }> {
  const issuer = await db.dteIssuerConfig.findFirst({
    where: { tenant_id, location_id, environment, is_active: true },
    select: {
      id: true, nit: true, nrc: true, name: true, activity_code: true, activity_name: true,
      dept_code: true, municipality_code: true, address_complement: true, phone: true, email: true,
      cod_estable_mh: true, cod_punto_venta_mh: true,
    },
  });

  if (!issuer) {
    return { ok: false, error: `No existe configuración DTE activa (ambiente ${environment}) para esta sucursal. Configure el emisor DTE primero.` };
  }

  const missing: string[] = [];
  if (!issuer.nit) missing.push("NIT");
  if (!issuer.nrc) missing.push("NRC");
  if (!issuer.name) missing.push("nombre");
  if (!issuer.activity_code) missing.push("código de actividad");
  if (!issuer.activity_name) missing.push("descripción de actividad");
  if (!issuer.dept_code) missing.push("departamento");
  if (!issuer.municipality_code) missing.push("municipio");
  if (!issuer.address_complement) missing.push("complemento de dirección");
  if (!issuer.phone) missing.push("teléfono");
  if (!issuer.email) missing.push("correo");
  if (!issuer.cod_estable_mh || issuer.cod_estable_mh.length !== 4) missing.push("cod_estable_mh (4 caracteres)");
  if (!issuer.cod_punto_venta_mh || issuer.cod_punto_venta_mh.length !== 4) missing.push("cod_punto_venta_mh (4 caracteres)");

  if (missing.length > 0) {
    return { ok: false, error: `La configuración del emisor (${environment}) está incompleta para FEX 11. Campos faltantes: ${missing.join(", ")}.` };
  }

  return {
    ok: true,
    issuer: {
      id:                 issuer.id,
      environment,
      cod_estable_mh:     issuer.cod_estable_mh!,
      cod_punto_venta_mh: issuer.cod_punto_venta_mh!,
    },
  };
}

// ── Configurar unidad MH (CAT-014) para un producto/servicio ─────
//
// F3-C23E — Salida operativa para productos/servicios sin
// UnitOfMeasure.mh_unit_code: en vez de bloquear el ítem para
// siempre, el usuario puede asignarle un código CAT-014 válido desde
// el propio flujo de venta de exportación. UnitOfMeasure es un
// catálogo global compartido (sin tenant_id) — no se toca ningún
// otro campo ni se reasignan productos, solo se completa
// mh_unit_code de la unidad ya usada por el producto. No aplica solo
// a servicios: cualquier producto/servicio sin código MH puede
// resolverse por esta vía.

export type ConfigureUnitMhCodeResult =
  | { ok: true; unit_id: string; mh_unit_code: string }
  | { ok: false; error: string };

export async function configureUnitMhCode(
  unit_id: string,
  mh_code:  string,
  db: PrismaClient = prisma,
): Promise<ConfigureUnitMhCodeResult> {
  const normalized = mh_code.trim();
  const numeric = Number(normalized);

  if (!normalized || !Number.isInteger(numeric) || !CAT014_UNITS.some((u) => u.mh_code === numeric)) {
    return {
      ok:    false,
      error: "El código indicado no existe en el catálogo oficial CAT-014 (Unidad de Medida). Seleccione uno de la lista.",
    };
  }

  const unit = await db.unitOfMeasure.findUnique({ where: { id: unit_id }, select: { id: true } });
  if (!unit) {
    return { ok: false, error: "La unidad de medida no existe." };
  }

  const updated = await db.unitOfMeasure.update({
    where:  { id: unit_id },
    data:   { mh_unit_code: String(numeric) },
    select: { mh_unit_code: true },
  });

  return { ok: true, unit_id, mh_unit_code: updated.mh_unit_code! };
}

// ── Crear DteOutgoingDocument tipo 11 (PENDING_GENERATION) ────────
//
// F3-C23E introdujo aquí el hardening contra numeroControl duplicado
// ("YA EXISTE UN REGISTRO CON ESE VALOR" en Hacienda TEST) — tomar el
// máximo entre el correlativo local y la mayor secuencia ya usada en
// DteOutgoingDocument. F3-C24 generaliza esa lógica a TODOS los tipos
// DTE (01/03/05/11/...) y le agrega el baseline externo (empresas que
// migran desde otro sistema y ya tienen numeroControl usados que esta
// base nunca vio). Ver dte-correlative.service.ts — reserveDteControlNumber.
async function createPendingExportDte(
  tenant_id:   string,
  location_id: string,
  sale_id:     string,
  issuer:      ActiveIssuer,
  db: PrismaClient = prisma,
): Promise<string> {
  // Correlativo aislado por tenant/location/issuer/environment — el
  // ambiente sale del emisor ya resuelto, nunca de un literal.
  const created = await db.$transaction(async (tx) => {
    const { control_number } = await reserveDteControlNumber(tx, {
      tenant_id,
      location_id,
      issuer_config_id:   issuer.id,
      environment:        issuer.environment,
      dte_type_code:      "11",
      cod_estable_mh:     issuer.cod_estable_mh,
      cod_punto_venta_mh: issuer.cod_punto_venta_mh,
    });

    const generation_code = randomUUID().toUpperCase();

    return tx.dteOutgoingDocument.create({
      data: {
        tenant_id,
        location_id,
        sale_id,
        issuer_config_id: issuer.id,
        dte_type_code:    "11",
        environment:      issuer.environment,
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

// ── Regenerar DTE tras rechazo por numeroControl duplicado (u otro
//    motivo) ──────────────────────────────────────────────────────
//
// F3-C23E — Acción segura pedida explícitamente: nunca se retransmite
// ni se edita el JSON/firma de un documento ya REJECTED. En vez de
// eso, se crea un DteOutgoingDocument NUEVO para la misma venta, con
// codigoGeneracion y numeroControl frescos (vía el mismo camino
// endurecido de arriba). El documento rechazado original queda
// intacto como registro histórico.

export type RegenerateExportDteResult =
  | { ok: true; dte_document_id: string }
  | { ok: false; error: string };

export async function regenerateRejectedExportDte(
  tenant_id:   string,
  location_id: string,
  dte_document_id: string,
  db: PrismaClient = prisma,
): Promise<RegenerateExportDteResult> {
  const rejected = await db.dteOutgoingDocument.findFirst({
    where:  { id: dte_document_id, tenant_id, location_id, dte_type_code: "11" },
    select: { id: true, sale_id: true, dte_status: true, issuer_config_id: true, environment: true },
  });
  if (!rejected) {
    return { ok: false, error: "El documento DTE de exportación no existe o no pertenece a la location activa." };
  }
  if (rejected.dte_status !== "REJECTED") {
    return {
      ok:    false,
      error: `Solo se puede generar un nuevo DTE a partir de un documento RECHAZADO. Estado actual: ${rejected.dte_status}.`,
    };
  }
  if (!rejected.issuer_config_id) {
    return { ok: false, error: "El documento rechazado no tiene configuración de emisor vinculada. No se puede regenerar." };
  }
  if (!rejected.sale_id) {
    return { ok: false, error: "El documento rechazado no está asociado a ninguna venta." };
  }

  const issuerConfig = await db.dteIssuerConfig.findFirst({
    where:  { id: rejected.issuer_config_id, tenant_id, location_id },
    select: { id: true, environment: true, cod_estable_mh: true, cod_punto_venta_mh: true },
  });
  if (!issuerConfig?.cod_estable_mh || !issuerConfig?.cod_punto_venta_mh) {
    return { ok: false, error: "No se pudo resolver la configuración del emisor original para generar el nuevo DTE." };
  }
  // FEX-PROD-1: el nuevo DTE hereda el ambiente del original, que debe
  // coincidir con su emisor y ser válido — sin mezcla TEST/PROD.
  if (issuerConfig.environment !== rejected.environment) {
    return { ok: false, error: "El ambiente del emisor no coincide con el ambiente del documento DTE." };
  }
  if (!isFex11Environment(rejected.environment)) {
    return { ok: false, error: "Ambiente DTE del documento no reconocido." };
  }

  const newDteId = await createPendingExportDte(tenant_id, location_id, rejected.sale_id, {
    id:                 issuerConfig.id,
    environment:        rejected.environment as Fex11Environment,
    cod_estable_mh:     issuerConfig.cod_estable_mh,
    cod_punto_venta_mh: issuerConfig.cod_punto_venta_mh,
  }, db);

  return { ok: true, dte_document_id: newDteId };
}

// ── Crear venta de exportación completa ───────────────────────────

export async function createExportSale(
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input:       CreateExportSaleInput,
  db: PrismaClient = prisma,
): Promise<CreateExportSaleResult> {
  // 1. Cliente debe ser extranjero
  const customer = await db.customer.findFirst({
    where:  { id: input.customer_id, tenant_id, status: "active" },
    select: {
      id: true, is_foreign: true,
      country_code: true, country_name: true, customer_person_type: true,
    },
  });
  if (!customer) {
    return { ok: false, field: "customer_id", error: "El cliente no existe o está inactivo en este tenant." };
  }
  if (!customer.is_foreign) {
    return { ok: false, field: "customer_id", error: "Para Factura de Exportación (FEX 11) el cliente debe estar marcado como extranjero." };
  }
  // País CAT-020 vigente — un código legado FEX v1 bloquea antes de crear la venta.
  const customerCountry = await findActiveCountry(customer.country_code, db);
  const countryError = validateFexCountryCode(customer.country_code, customerCountry ? [customerCountry] : []);
  if (countryError) {
    return { ok: false, field: "customer_id", error: countryError };
  }

  // 2. Validar productos (unidad con código MH) y reglas de negocio de exportación
  const productIds = [...new Set(input.items.map((i) => i.product_id))];
  const products = await db.product.findMany({
    where: { id: { in: productIds }, tenant_id, allow_sale: true, status: { notIn: ["BLOCKED_SALE", "INACTIVE", "DISCONTINUED"] } },
    select: {
      id: true, name: true, product_code: true, product_type: true,
      unit: { select: { mh_unit_code: true } },
    },
  });
  const productsForValidation: ExportProductForValidation[] = products.map((p) => ({
    id: p.id, name: p.name, product_code: p.product_code, product_type: p.product_type,
    mh_unit_code: p.unit?.mh_unit_code ?? null,
  }));

  const [fiscalPrecincts, regimes, incoterms, tributes] = await Promise.all([
    listDteCatalogItems({ catalog_code: DTE_CATALOG_CODES.CAT_027_RECINTO_FISCAL }),
    listDteCatalogItems({ catalog_code: DTE_CATALOG_CODES.CAT_028_REGIMEN }),
    listDteCatalogItems({ catalog_code: DTE_CATALOG_CODES.CAT_031_INCOTERMS }),
    listDteCatalogItems({ catalog_code: DTE_CATALOG_CODES.CAT_015_TRIBUTOS }),
  ]);

  if (!tributes.some((t) => t.item_code === "C3")) {
    return {
      ok: false,
      error: "El catálogo DTE CAT-015 no tiene cargado el tributo C3 (IVA exportaciones 0%), requerido por FEX 11. Ejecute el seed de catálogos DTE.",
    };
  }

  const businessErrors = validateExportSaleBusinessRules(input, productsForValidation, {
    fiscalPrecincts, regimes, incoterms,
  });
  if (businessErrors.length > 0) {
    return { ok: false, error: "Datos de exportación no válidos.", errors: businessErrors };
  }

  // 3. Resolver ambiente fiscal efectivo (DteIssuerConfig activo único)
  //    + emisor activo de ESE ambiente antes de crear nada (fail fast).
  const envResult = await resolveEffectiveFexEnvironment(tenant_id, location_id, db);
  if (!envResult.ok) {
    return { ok: false, error: envResult.error };
  }
  const issuerResult = await loadActiveIssuerConfigOrError(tenant_id, location_id, envResult.environment, db);
  if (!issuerResult.ok) {
    return { ok: false, error: issuerResult.error };
  }

  // 4. Crear venta DRAFT (tipo 11) reutilizando el servicio ya probado.
  //    createSaleDraft acepta primary_dte_type_code como string en runtime —
  //    solo el schema Zod público (createSaleDraftSchema) restringe a "01"/"03".
  //    Aquí se invoca el service directamente con "11", sin pasar por ese schema.
  const draft = await createSaleDraft(tenant_id, location_id, user_id, {
    sale_date:                input.sale_date,
    customer_id:              input.customer_id,
    primary_dte_type_code:    "11" as "01" | "03",
    payment_method_code:      input.payment_method_code ?? null,
    condition_operation_code: input.condition_operation_code,
    payment_term_code:        input.payment_term_code ?? null,
    payment_term_value:       input.payment_term_value ?? null,
    notes:                    input.notes ?? null,
  }, db);
  if (!draft.ok) {
    return draft.field ? { ok: false, field: draft.field, error: draft.error } : { ok: false, error: draft.error };
  }

  const sale_id = draft.id;

  // 5. Agregar líneas — tax_rate_override forzado a 0: FEX exporta gravado
  //    al 0% (tributo fijo C3), ver generate-fex-json.service.ts.
  for (const item of input.items) {
    const added = await addSaleItemToDraft(sale_id, tenant_id, location_id, user_id, {
      product_id:        item.product_id,
      quantity:          item.quantity,
      unit_price:        item.unit_price,
      discount_amount:   item.discount_amount,
      tax_rate_override: 0,
    }, db);
    if (!added.ok) {
      return { ok: false, error: `Error agregando línea: ${added.error}` };
    }
  }

  // 6. Crear SaleExportDetails
  await db.saleExportDetails.create({
    data: {
      tenant_id,
      sale_id,
      country_code:          customerCountry!.code,
      country_name:          customerCountry!.name,
      customer_person_type:  customer.customer_person_type,
      item_type_export:      input.item_type_export,
      fiscal_precinct_code:  input.item_type_export === 2 ? null : (input.fiscal_precinct_code ?? null),
      regime_code:           input.item_type_export === 2 ? null : (input.regime_code ?? null),
      incoterm_code:         input.incoterm_code ?? null,
      incoterm_desc:         input.incoterm_desc ?? null,
      insurance_amount:      new Prisma.Decimal(input.insurance_amount),
      freight_amount:        new Prisma.Decimal(input.freight_amount),
    },
  });

  // 7. Confirmar venta (CONFIRMED + inventario si aplica + caja si hay sesión abierta)
  const confirmed = await confirmSale(sale_id, tenant_id, location_id, user_id, db);
  if (!confirmed.ok) {
    return { ok: false, error: `No se pudo confirmar la venta de exportación: ${confirmed.error}` };
  }

  // 8. Crear DteOutgoingDocument tipo 11 (PENDING_GENERATION) en el ambiente del emisor
  const sale = await db.sale.findFirst({ where: { id: sale_id }, select: { sale_code: true } });
  const dte_document_id = await createPendingExportDte(tenant_id, location_id, sale_id, issuerResult.issuer, db);

  return { ok: true, sale_id, sale_code: sale?.sale_code ?? "", dte_document_id };
}
