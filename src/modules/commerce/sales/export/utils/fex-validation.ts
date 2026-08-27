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

// Forma best-effort de un código ISO alpha-2 (CAT-020), solo para dar un
// mensaje de error más claro cuando el valor rechazado viene evidentemente
// de CAT-020 en vez del catálogo de compatibilidad FEX v1 (F3-C23D).
const ISO_ALPHA2_LIKE = /^[A-Z]{2}$/;

export interface ExportProductForValidation {
  id:           string;
  name:         string;
  mh_unit_code: string | null;
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
    if (!input.fiscal_precinct_code || !existsInCatalog(catalogs.fiscalPrecincts, input.fiscal_precinct_code)) {
      errors.push("El recinto fiscal es requerido y debe existir en el catálogo DTE (CAT-027).");
    }
    if (!input.regime_code || !existsInCatalog(catalogs.regimes, input.regime_code)) {
      errors.push("El régimen es requerido y debe existir en el catálogo DTE (CAT-028).");
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
  // País (F3-C23D): catálogo de COMPATIBILIDAD FEX v1 para
  // receptor.codPais (catalog_code "FEX-11-V1-CODPAIS", códigos numéricos
  // legados) — NO CAT-020 (ISO alpha-2, modelo `Country`). CAT-020 sigue
  // vigente en el sistema central, pero FEX 11 v1 no lo usa para este
  // campo. Ver docs/dte-official/extracts/fex11-catalogs-operational.md.
  fexCountries: DteCatalogItem[];
  personTypes:  DteCatalogItem[]; // CAT-029
  idTypes:      DteCatalogItem[]; // CAT-022
}

export function validateForeignCustomerCatalogs(
  input:    CreateForeignCustomerInput,
  catalogs: FexCustomerCatalogItems,
): string[] {
  const errors: string[] = [];

  if (!input.country_code) {
    errors.push("El país es requerido.");
  } else if (!existsInCatalog(catalogs.fexCountries, input.country_code)) {
    errors.push(
      ISO_ALPHA2_LIKE.test(input.country_code)
        ? `El país "${input.country_code}" pertenece al catálogo CAT-020 ISO actualizado, pero la ` +
          `versión actual de FEX 11 usa códigos numéricos compatibles con el schema v1. Seleccione ` +
          `el país desde el catálogo FEX v1 (FEX-11-V1-CODPAIS).`
        : `El país indicado no existe en el catálogo de compatibilidad FEX v1 (FEX-11-V1-CODPAIS).`,
    );
  }
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
