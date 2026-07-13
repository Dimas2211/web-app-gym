// ─────────────────────────────────────────────────────────────────
// platform — data-onboarding-definitions.ts
//
// Catálogo estático de datasets importables/exportables del
// Data Onboarding Center (E0 — foundation read-only).
//
// E0 no ejecuta importaciones ni exportaciones reales.
// Este archivo define la estructura que usarán E1/E2 para
// implementar los runners concretos.
//
// Reglas de seguridad:
// - No importa Prisma.
// - No importa actions.
// - No ejecuta queries.
// - Solo tipos y constantes.
// ─────────────────────────────────────────────────────────────────

import type {
  DataOnboardingDatasetDefinition,
  DataOnboardingDatasetKey,
} from "../../types/platform.types";

// ── Catálogo completo de datasets ────────────────────────────────

export const DATA_ONBOARDING_DATASETS: DataOnboardingDatasetDefinition[] = [
  // ── Catálogos maestros (importar primero — dependencias base) ──

  {
    key:         "categories",
    label:       "Categorías de Productos",
    description: "Clasificación principal del catálogo de productos. Debe importarse antes que líneas, sublíneas y productos.",
    direction:   "BOTH",
    status:      "PLANNED",
    risk:        "LOW",
    requiredFields: ["name"],
    optionalFields: ["description", "status"],
    dependencies:   [],
    notes: "Modelo: ProductCategory. Requiere tenant_id derivado del perfil.",
  },

  {
    key:         "lines",
    label:       "Líneas de Productos",
    description: "Subdivisión dentro de una categoría. Depende de categorías ya creadas.",
    direction:   "BOTH",
    status:      "PLANNED",
    risk:        "LOW",
    requiredFields: ["name", "category_name"],
    optionalFields: ["description", "status"],
    dependencies:   ["categories"],
    notes: "Modelo: ProductLine. Requiere category_id resuelto por nombre.",
  },

  {
    key:         "sublines",
    label:       "Sublíneas de Productos",
    description: "Tercer nivel de clasificación del catálogo. Depende de líneas ya creadas.",
    direction:   "BOTH",
    status:      "PLANNED",
    risk:        "LOW",
    requiredFields: ["name", "line_name"],
    optionalFields: ["description", "status"],
    dependencies:   ["categories", "lines"],
    notes: "Modelo: ProductSubline. Requiere line_id resuelto por nombre.",
  },

  // ── Catálogo de productos ──────────────────────────────────────

  {
    key:         "products",
    label:       "Productos",
    description: "Carga y actualización del catálogo maestro de productos. No incluye stock ni ubicación.",
    direction:   "BOTH",
    status:      "PLANNED",
    risk:        "MEDIUM",
    requiredFields: [
      "product_code",
      "name",
      "product_type",
      "is_stockable",
      "allow_purchase",
      "allow_sale",
      "category_name",
      "unit_name",
    ],
    optionalFields: [
      "description",
      "line_name",
      "subline_name",
      "brand",
      "package_unit",
      "supplier_name",
      "sku",
      "cost_price",
      "sale_price",
      "tax_rate_name",
      "status",
    ],
    dependencies: ["categories", "lines", "sublines", "units_of_measure", "tax_rates"],
    notes: "Modelo: Product. product_code debe ser único por tenant. Precio en decimal.",
  },

  // ── Proveedores ───────────────────────────────────────────────

  {
    key:         "suppliers",
    label:       "Proveedores",
    description: "Maestro de proveedores del dominio commerce. Independiente de productos.",
    direction:   "BOTH",
    status:      "PLANNED",
    risk:        "LOW",
    requiredFields: ["name"],
    optionalFields: [
      "trade_name",
      "nit",
      "nrc",
      "email",
      "phone",
      "address",
      "city",
      "country_code",
      "economic_activity",
      "classification",
      "contact_name",
      "status",
    ],
    dependencies: [],
    notes: "Modelo: Supplier. Identidad fiscal opcional pero recomendada para DTE.",
  },

  // ── Clientes ──────────────────────────────────────────────────

  {
    key:         "customers",
    label:       "Clientes",
    description: "Base de clientes del negocio. Incluye datos de identificación y contacto.",
    direction:   "BOTH",
    status:      "PLANNED",
    risk:        "MEDIUM",
    requiredFields: ["name"],
    optionalFields: [
      "customer_code",
      "email",
      "phone",
      "document_type",
      "document_number",
      "address",
      "city",
      "country_code",
      "status",
      "notes",
    ],
    dependencies: [],
    notes: "Modelo: Customer. customer_code auto-generado si no se provee.",
  },

  // ── Inventario inicial ────────────────────────────────────────

  {
    key:         "inventory_initial",
    label:       "Inventario Inicial",
    description: "Stock de apertura por producto y sucursal (Branch). Solo para productos PRODUCT, is_stockable=true y status=ACTIVE.",
    direction:   "IMPORT",
    status:      "PLANNED",
    risk:        "HIGH",
    requiredFields: ["product_code", "location_name", "quantity"],
    optionalFields: ["unit_cost", "notes"],
    dependencies:   ["products"],
    notes: "Modelos: ProductLocation + InventoryMovement (tipo INITIAL_LOAD), creados juntos en una sola transacción. " +
      "location_name se resuelve contra Branch.name (sucursal), no un modelo Location genérico. La sucursal debe existir — no se crea desde este import. " +
      "quantity debe ser estrictamente mayor que 0. No se permite ejecutar dos veces para el mismo producto + sucursal (bloquea si ya existe ProductLocation o un movimiento INITIAL_LOAD previo).",
  },

  // ── Catálogos de sistema (exportar únicamente) ────────────────

  {
    key:         "units_of_measure",
    label:       "Unidades de Medida",
    description: "Catálogo de unidades compartido entre productos. Solo exportación desde base destino.",
    direction:   "EXPORT",
    status:      "PLANNED",
    risk:        "LOW",
    requiredFields: ["name", "symbol"],
    optionalFields: ["status"],
    dependencies:   [],
    notes: "Modelo: UnitOfMeasure. Catálogo global — revisar antes de importar productos.",
  },

  {
    key:         "tax_rates",
    label:       "Tasas de Impuesto",
    description: "Catálogo de tasas de impuesto (IVA, exento, etc.) por tenant.",
    direction:   "EXPORT",
    status:      "PLANNED",
    risk:        "LOW",
    requiredFields: ["name", "rate"],
    optionalFields: ["status"],
    dependencies:   [],
    notes: "Modelo: TaxRate. Revisar antes de importar productos con precios con impuesto.",
  },

  // ── Datos transaccionales (solo exportar) ─────────────────────

  {
    key:         "sales",
    label:       "Ventas",
    description: "Historial de ventas del negocio. Solo exportación para análisis o migración.",
    direction:   "EXPORT",
    status:      "PLANNED",
    risk:        "LOW",
    requiredFields: [],
    optionalFields: ["date_from", "date_to", "status", "include_items"],
    dependencies:   [],
    notes: "Modelo: Sale + SaleItem. No se importan ventas históricas.",
  },

  {
    key:         "dte_documents",
    label:       "Documentos DTE",
    description: "Documentos tributarios electrónicos emitidos. Solo exportación para auditoría.",
    direction:   "EXPORT",
    status:      "PLANNED",
    risk:        "LOW",
    requiredFields: [],
    optionalFields: ["date_from", "date_to", "dte_type", "status"],
    dependencies:   [],
    notes: "Modelo: DteOutgoingDocument. Solo lectura — no se importan DTEs externos.",
  },

  {
    key:         "dte_catalogs",
    label:       "Catálogos DTE",
    description: "Catálogos de códigos del Ministerio de Hacienda. Ver D1A para seed controlado.",
    direction:   "EXPORT",
    status:      "PLANNED",
    risk:        "LOW",
    requiredFields: [],
    optionalFields: ["catalog_type"],
    dependencies:   [],
    notes: "Modelo: DteCatalogItem. Seed controlado disponible desde D1A.",
  },
];

// ── Índice por key ───────────────────────────────────────────────

export const DATA_ONBOARDING_DATASETS_BY_KEY: Record<
  DataOnboardingDatasetKey,
  DataOnboardingDatasetDefinition
> = Object.fromEntries(
  DATA_ONBOARDING_DATASETS.map((d) => [d.key, d]),
) as Record<DataOnboardingDatasetKey, DataOnboardingDatasetDefinition>;

// ── Agrupaciones para la UI ──────────────────────────────────────

export const IMPORT_DATASETS = DATA_ONBOARDING_DATASETS.filter(
  (d) => d.direction === "IMPORT" || d.direction === "BOTH",
);

export const EXPORT_DATASETS = DATA_ONBOARDING_DATASETS.filter(
  (d) => d.direction === "EXPORT" || d.direction === "BOTH",
);

// Orden recomendado de importación (respeta dependencias)
export const IMPORT_ORDER: DataOnboardingDatasetKey[] = [
  "categories",
  "lines",
  "sublines",
  "units_of_measure",
  "tax_rates",
  "suppliers",
  "customers",
  "products",
  "inventory_initial",
];
