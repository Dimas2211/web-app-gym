// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — fex-catalogs.ts
//
// F3-C23 — Los catálogos MH de FEX 11 (INCOTERMS CAT-031, Régimen
// CAT-028, Recinto fiscal CAT-027, País CAT-020, Tipo de persona
// CAT-029, Tipo de documento receptor CAT-022) ya NO viven aquí como
// arreglos hardcodeados: se leen del sistema central de catálogos DTE
// (DteCatalogItem, ver commerce/dte/queries/list-dte-catalog-items.ts)
// y se pasan como props (DteCatalogItem[]) a los componentes cliente,
// igual que ya se hacía con CAT-016/CAT-017.
//
// Este archivo solo conserva lo que NO es un catálogo MH cargable:
//   - tipoItemExpor: enum cerrado del schema oficial fe-fex-v1.json
//     (1=Bienes, 2=Servicios, 3=Bienes y servicios), no un catálogo CAT-XXX.
//   - El código de tributo fijo usado por toda línea FEX 11 (C3), cuya
//     existencia real se valida server-side contra CAT-015.
// ─────────────────────────────────────────────────────────────────

export const FEX_ITEM_TYPE_EXPORT: { code: 1 | 2 | 3; label: string }[] = [
  { code: 1, label: "Bienes" },
  { code: 2, label: "Servicios" },
  { code: 3, label: "Bienes y servicios" },
];

// CAT-015 Tributos — FEX usa únicamente C3 (IVA exportaciones 0%).
// Validado server-side contra DteCatalogItem (catalog_code="CAT-015").
export const FEX_TRIBUTE_CODE = "C3";

export function isValidItemTypeExport(value: number | null | undefined): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}
