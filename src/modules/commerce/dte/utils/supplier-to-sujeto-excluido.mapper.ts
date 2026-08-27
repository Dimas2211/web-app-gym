// ─────────────────────────────────────────────────────────────────
// commerce/dte — supplier-to-sujeto-excluido.mapper.ts
//
// Mapper explícito Supplier → sujetoExcluido (bloque FSE 14 del JSON
// oficial MH, CAT-022 tipoDocumento).
//
// Supplier.id_type_code usa el catálogo interno de identificación del
// módulo suppliers ("00" NIT | "02" Carné residente | "03" Pasaporte |
// "13" DUI | "37" Otro — ver create-supplier.schema.ts idTypeCodeEnum),
// que NO coincide 1:1 con CAT-022: internamente "00" identifica NIT,
// mientras CAT-022 usa "36" para NIT. El resto de códigos ya coinciden
// (02/03/13/37). Este mapper hace esa traducción explícita — nunca
// asume que los códigos internos y CAT-022 son intercambiables.
// ─────────────────────────────────────────────────────────────────

import { normalizeNitForDte } from "./fiscal-id.utils";
import type { FseSujetoExcluido } from "../types/fse-json.types";

export interface SupplierForSujetoExcluido {
  name:               string;
  legal_name:         string | null;
  id_type_code:       string | null;
  nit:                string | null;
  dui:                string | null;
  other_document:     string | null;
  activity_code:      string | null;
  activity_name:      string | null;
  dept_code:          string | null;
  municipality_code:  string | null;
  address_complement: string | null;
  phone:              string | null;
  email:              string | null;
}

export type MapSupplierToSujetoExcluidoResult =
  | { ok: true; sujetoExcluido: FseSujetoExcluido }
  | { ok: false; missingFields: string[] };

// Traduce id_type_code interno de Supplier → CAT-022 tipoDocumento de FSE.
function toCat022TipoDocumento(idTypeCode: string | null): FseSujetoExcluido["tipoDocumento"] | null {
  switch (idTypeCode) {
    case "00": return "36"; // NIT (interno "00" → CAT-022 "36")
    case "13": return "13"; // DUI
    case "02": return "02"; // Carné de residente
    case "03": return "03"; // Pasaporte
    case "37": return "37"; // Otro
    default:   return null;
  }
}

export function mapSupplierToSujetoExcluido(
  supplier: SupplierForSujetoExcluido,
): MapSupplierToSujetoExcluidoResult {
  const missing: string[] = [];

  const tipoDocumento = toCat022TipoDocumento(supplier.id_type_code);
  if (!tipoDocumento) {
    missing.push("tipo de documento de identificación válido (NIT, DUI, carné de residente, pasaporte u otro)");
  }

  let numDocumento: string | null = null;
  if (tipoDocumento === "36") {
    numDocumento = normalizeNitForDte(supplier.nit);
    if (!numDocumento) missing.push("NIT (requerido para tipo de documento NIT)");
  } else if (tipoDocumento === "13") {
    numDocumento = supplier.dui ? supplier.dui.replace(/\D/g, "") : null;
    if (!numDocumento) missing.push("DUI (requerido para tipo de documento DUI)");
  } else if (tipoDocumento) {
    numDocumento = supplier.other_document ?? supplier.nit ?? supplier.dui ?? null;
    if (!numDocumento) missing.push("documento de identificación (otro/pasaporte/carné de residente)");
  }

  if (!supplier.name)               missing.push("nombre");
  if (!supplier.dept_code)          missing.push("departamento");
  if (!supplier.municipality_code)  missing.push("municipio");
  if (!supplier.address_complement) missing.push("complemento de dirección");

  if (missing.length > 0) {
    return { ok: false, missingFields: missing };
  }

  return {
    ok: true,
    sujetoExcluido: {
      tipoDocumento: tipoDocumento!,
      numDocumento:  numDocumento!,
      nombre:        supplier.legal_name ?? supplier.name,
      codActividad:  supplier.activity_code ?? null,
      descActividad: supplier.activity_name ?? null,
      direccion: {
        departamento: supplier.dept_code!,
        municipio:    supplier.municipality_code!,
        complemento:  supplier.address_complement!,
      },
      telefono: supplier.phone ?? null,
      correo:   supplier.email ?? null,
    },
  };
}
