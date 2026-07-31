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

import {
  isValidIncoterm,
  isValidRegime,
  isValidFiscalPrecinct,
  isValidItemTypeExport,
} from "./fex-catalogs";
import type { CreateExportSaleInput } from "../schemas/export-sale.schemas";

export interface ExportProductForValidation {
  id:           string;
  name:         string;
  mh_unit_code: string | null;
}

export function validateExportSaleBusinessRules(
  input:    CreateExportSaleInput,
  products: ExportProductForValidation[],
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
    if (!input.fiscal_precinct_code || !isValidFiscalPrecinct(input.fiscal_precinct_code)) {
      errors.push("El recinto fiscal es requerido y debe existir en el catálogo mínimo soportado.");
    }
    if (!input.regime_code || !isValidRegime(input.regime_code)) {
      errors.push("El régimen es requerido y debe existir en el catálogo mínimo soportado.");
    }
  }

  if (input.incoterm_code && !isValidIncoterm(input.incoterm_code)) {
    errors.push("El INCOTERM indicado no existe en el catálogo mínimo soportado.");
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

export function isNodeEnvProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
