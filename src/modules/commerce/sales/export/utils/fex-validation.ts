// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — fex-validation.ts
//
// F3-C21 — Validaciones server-side de negocio para el módulo
// comercial FEX 11, previas a crear la venta / generar el DTE.
//
// No reemplaza la validación AJV contra el schema oficial (eso ya lo
// hace validate-dte-json-schema.service.ts en el pipeline existente).
// Esta capa evita llegar tarde a esa validación con datos
// evidentemente incompletos o con catálogos inventados.
// ─────────────────────────────────────────────────────────────────

import { isValidItemTypeExport } from "./fex-catalogs";
import type { CreateExportSaleInput, CreateForeignCustomerInput } from "../schemas/export-sale.schemas";
import type { DteCatalogItem } from "@/modules/commerce/dte/types/dte-catalog.types";
import {
  FEX_GOODS_TIPO_REGIMEN_BLOCKED_ERROR,
  FEX_V3_LIMITS,
} from "@/modules/commerce/dte/utils/fex11-v3-rules";

export interface ExportProductForValidation {
  id:           string;
  name:         string;
  product_code: string;
  product_type: string | null;
  mh_unit_code: string | null;
}

// País CAT-020 vigente (modelo Country, ISO alpha-2).
export interface FexCountryItem {
  code: string;
  name: string;
}

/**
 * Valida el país de un receptor FEX contra CAT-020 vigente. Un código
 * legado (numérico, catálogo de compatibilidad FEX v1) no se convierte:
 * se informa para que el usuario corrija el país del cliente.
 */
export function validateFexCountryCode(
  country_code: string | null | undefined,
  countries:    FexCountryItem[],
): string | null {
  if (!country_code) return "El país es requerido.";
  if (countries.some((c) => c.code === country_code)) {
    return country_code === "SV"
      ? "El país destino de una Factura de Exportación no puede ser El Salvador."
      : null;
  }
  return /^[0-9]+$/.test(country_code)
    ? `El país "${country_code}" usa un código de la versión anterior de la Factura de Exportación. ` +
      `Seleccione el país desde el catálogo de países vigente (CAT-020).`
    : `El país "${country_code}" no existe en el catálogo de países vigente (CAT-020).`;
}

export interface FexSaleCatalogItems {
  fiscalPrecincts: DteCatalogItem[]; // CAT-027
  regimes:         DteCatalogItem[]; // CAT-028
  incoterms:       DteCatalogItem[]; // CAT-031
}

function existsInCatalog(catalog: DteCatalogItem[], code: string | null | undefined): boolean {
  return !!code && catalog.some((item) => item.item_code === code);
}

export function validateExportSaleBusinessRules(
  input:    CreateExportSaleInput,
  products: ExportProductForValidation[],
  catalogs: FexSaleCatalogItems,
): string[] {
  const errors: string[] = [];

  if (!isValidItemTypeExport(input.item_type_export)) {
    errors.push("Tipo de ítem de exportación no válido (debe ser 1, 2 o 3).");
  }

  if (input.item_type_export === 2) {
    if (input.fiscal_precinct_code || input.regime_code) {
      errors.push("Para exportación de servicios, recinto fiscal y régimen deben quedar vacíos.");
    }
  } else {
    // FEX-PROD-0B: bienes bloqueados hasta que exista catálogo oficial de
    // emisor.tipoRegimen (schema v3). Se bloquea antes de confirmar la
    // venta para no mover inventario de una venta que no puede facturarse.
    errors.push(FEX_GOODS_TIPO_REGIMEN_BLOCKED_ERROR);
    if (input.fiscal_precinct_code && !existsInCatalog(catalogs.fiscalPrecincts, input.fiscal_precinct_code)) {
      errors.push("El recinto fiscal debe existir en el catálogo DTE (CAT-027).");
    }
    if (input.regime_code && !existsInCatalog(catalogs.regimes, input.regime_code)) {
      errors.push("El régimen debe existir en el catálogo DTE (CAT-028).");
    }
  }

  if (input.incoterm_code && !existsInCatalog(catalogs.incoterms, input.incoterm_code)) {
    errors.push("El INCOTERM indicado no existe en el catálogo DTE (CAT-031).");
  }

  if (input.insurance_amount < 0) errors.push("El seguro no puede ser negativo.");
  if (input.freight_amount < 0)   errors.push("El flete no puede ser negativo.");

  const byId = new Map(products.map((p) => [p.id, p]));

  for (const item of input.items) {
    if (item.quantity <= 0) {
      errors.push(`La línea del producto ${item.product_id} tiene cantidad inválida.`);
    }
    if (item.unit_price < 0) {
      errors.push(`La línea del producto ${item.product_id} tiene precio inválido.`);
    }

    const product = byId.get(item.product_id);
    if (!product) {
      errors.push(`El producto ${item.product_id} no existe o no está disponible para venta.`);
      continue;
    }
    if (product.product_code.length > FEX_V3_LIMITS.itemCodeMax) {
      errors.push(
        `El producto "${product.name}" tiene código "${product.product_code}" de ${product.product_code.length} ` +
        `caracteres; la Factura de Exportación admite máximo ${FEX_V3_LIMITS.itemCodeMax}. Ajuste el código en el maestro de productos.`,
      );
    }
    if (input.item_type_export === 2 && product.product_type !== "SERVICE") {
      errors.push(`El producto "${product.name}" es un bien; la exportación está declarada como servicios.`);
    }
    if (!product.mh_unit_code) {
      errors.push(
        `El producto "${product.name}" usa una unidad de medida sin código MH (CAT-014) configurado. ` +
        `No se puede generar el DTE de exportación hasta asignar mh_unit_code a su unidad.`,
      );
    }
  }

  return errors;
}

export interface FexCustomerCatalogItems {
  countries:   FexCountryItem[];  // CAT-020 vigente (modelo Country)
  personTypes: DteCatalogItem[];  // CAT-029
  idTypes:     DteCatalogItem[];  // CAT-022
}

export function validateForeignCustomerCatalogs(
  input:    CreateForeignCustomerInput,
  catalogs: FexCustomerCatalogItems,
): string[] {
  const errors: string[] = [];

  const countryError = validateFexCountryCode(input.country_code, catalogs.countries);
  if (countryError) errors.push(countryError);
  if (!existsInCatalog(catalogs.personTypes, input.customer_person_type)) {
    errors.push("El tipo de persona indicado no existe en el catálogo DTE (CAT-029).");
  }
  if (!existsInCatalog(catalogs.idTypes, input.id_type_code)) {
    errors.push("El tipo de documento indicado no existe en el catálogo DTE (CAT-022).");
  }

  return errors;
}

export function isNodeEnvProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
