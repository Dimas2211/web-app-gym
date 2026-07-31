// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — fex-catalogs.ts
//
// F3-C21 — Catálogos mínimos versionados en código para el módulo
// comercial FEX 11. Contiene únicamente los valores ya validados por
// Hacienda TEST (ver docs/modules/fex11-e2e-ui-mh-mariadb-close.md §5).
//
// No son catálogos oficiales completos del MH — son un subconjunto
// mínimo, ampliable, para evitar placeholders inventados en la UI
// comercial. Ampliar esta lista requiere confirmar el valor contra el
// catálogo oficial (Catálogo Sistema de Transmisión MH), no agregar
// códigos sin verificar.
// ─────────────────────────────────────────────────────────────────

export interface FexCatalogEntry {
  code:  string;
  label: string;
}

// CAT-031 INCOTERMS — solo el valor probado en MH TEST.
export const FEX_INCOTERMS: FexCatalogEntry[] = [
  { code: "09", label: "FOB - Libre a bordo" },
];

// CAT-028 Régimen — solo el valor probado en MH TEST.
export const FEX_REGIMES: FexCatalogEntry[] = [
  { code: "EX-1.1000.000", label: "Exportación Definitiva, Exportación Definitiva, Régimen Común" },
];

// CAT-027 Recinto fiscal — valores probados/confirmados en MH TEST.
export const FEX_FISCAL_PRECINCTS: FexCatalogEntry[] = [
  { code: "02", label: "Marítima de Acajutla" },
  { code: "10", label: "Marítima La Unión" },
];

// CAT-015 Tributos — FEX usa únicamente C3 (IVA exportaciones 0%).
export const FEX_TRIBUTE_CODE = "C3";

// CAT-020 País — solo el país usado en la prueba end-to-end.
// Ampliar requiere confirmar cada código contra el catálogo oficial CAT-020.
export const FEX_COUNTRIES: FexCatalogEntry[] = [
  { code: "9540", label: "ESTADOS UNIDOS" },
];

// CAT-029 Tipo de persona — valores del schema oficial (1=jurídica, 2=natural).
export const FEX_PERSON_TYPES: FexCatalogEntry[] = [
  { code: "1", label: "Persona jurídica" },
  { code: "2", label: "Persona natural" },
];

// tipoItemExpor — enum cerrado del schema oficial fe-fex-v1.json.
export const FEX_ITEM_TYPE_EXPORT: { code: 1 | 2 | 3; label: string }[] = [
  { code: 1, label: "Bienes" },
  { code: 2, label: "Servicios" },
  { code: 3, label: "Bienes y servicios" },
];

// CAT-022 tipo de documento del receptor — mismo catálogo ya usado en FE/CCFE.
export const FEX_RECEIVER_ID_TYPES: FexCatalogEntry[] = [
  { code: "36", label: "NIT" },
  { code: "13", label: "DUI" },
  { code: "02", label: "Carnet de Residente" },
  { code: "03", label: "Pasaporte" },
  { code: "37", label: "Otro" },
];

function findCode<T extends { code: string | number }>(list: T[], code: string | number): T | undefined {
  return list.find((e) => String(e.code) === String(code));
}

export function isValidIncoterm(code: string | null | undefined): boolean {
  return !!code && !!findCode(FEX_INCOTERMS, code);
}

export function isValidRegime(code: string | null | undefined): boolean {
  return !!code && !!findCode(FEX_REGIMES, code);
}

export function isValidFiscalPrecinct(code: string | null | undefined): boolean {
  return !!code && !!findCode(FEX_FISCAL_PRECINCTS, code);
}

export function isValidCountry(code: string | null | undefined): boolean {
  return !!code && !!findCode(FEX_COUNTRIES, code);
}

export function isValidPersonType(code: string | null | undefined): boolean {
  return !!code && !!findCode(FEX_PERSON_TYPES, code);
}

export function isValidReceiverIdType(code: string | null | undefined): boolean {
  return !!code && !!findCode(FEX_RECEIVER_ID_TYPES, code);
}

export function isValidItemTypeExport(value: number | null | undefined): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

export function countryNameForCode(code: string): string | null {
  return findCode(FEX_COUNTRIES, code)?.label ?? null;
}
