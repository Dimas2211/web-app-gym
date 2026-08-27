// commerce/dte — dte-catalog.types.ts

export interface DteCatalogItem {
  id:           string;
  catalog_code: string;
  item_code:    string;
  item_label:   string;
  description:  string | null;
  applies_to:   string | null;
  version:      string;
  sort_order:   number | null;
  metadata:     Record<string, unknown> | null;
  is_active:    boolean;
  created_at:   Date;
  updated_at:   Date;
}

export interface DteCatalogItemRow {
  catalog_code: string;
  item_code:    string;
  item_label:   string;
  description?: string;
  applies_to?:  string;
  version?:     string;
  sort_order?:  number;
  metadata?:    Record<string, unknown>;
}

// Códigos de catálogo canónicos usados en DTE
export const DTE_CATALOG_CODES = {
  CAT_001_AMBIENTE:            "CAT-001",
  CAT_002_TIPO_DOCUMENTO:      "CAT-002",
  CAT_003_MODELO_FACTURACION:  "CAT-003",
  CAT_004_TIPO_TRANSMISION:    "CAT-004",
  CAT_005_CONTINGENCIA:        "CAT-005",
  CAT_011_TIPO_ITEM:           "CAT-011",
  CAT_015_TRIBUTOS:            "CAT-015",
  CAT_016_CONDICION_OPERACION: "CAT-016",
  CAT_017_FORMA_PAGO:          "CAT-017",
  CAT_018_PLAZO:               "CAT-018",
  // CAT-020 (País) NO vive en DteCatalogItem — es el modelo `Country`
  // (ISO alpha-2), ver src/modules/commerce/suppliers/queries/get-countries.ts.
  // No agregar CAT_020_PAIS aquí (F3-C23B). Sigue siendo el catálogo país
  // oficial CAT-020 v1.2 para el resto del sistema — no se usa para
  // receptor.codPais de FEX 11 v1 (ver FEX_V1_CODPAIS abajo, F3-C23D).
  CAT_022_TIPO_IDENTIFICACION: "CAT-022",
  CAT_024_TIPO_INVALIDACION:   "CAT-024",
  // FEX 11 — Factura de Exportación (Microfase F3-C23)
  CAT_027_RECINTO_FISCAL:      "CAT-027",
  CAT_028_REGIMEN:             "CAT-028",
  CAT_029_TIPO_PERSONA:        "CAT-029",
  CAT_031_INCOTERMS:           "CAT-031",
  // FEX_V1_CODPAIS — Microfase F3-C23D. Catálogo de COMPATIBILIDAD para
  // receptor.codPais mientras FEX 11 siga sobre el schema v1 local
  // (fex-11.schema.json): códigos numéricos legados de 4 dígitos, NO
  // CAT-020 oficial (ISO alpha-2). Generado a partir del enum real del
  // schema — ver prisma/seeds/data/fex11-catalog-rows.ts. NO renombrar a
  // "CAT-020" ni documentarlo como catálogo oficial v1.2.
  FEX_V1_CODPAIS:              "FEX-11-V1-CODPAIS",
} as const;

export type DteCatalogCode = typeof DTE_CATALOG_CODES[keyof typeof DTE_CATALOG_CODES];
