// ─────────────────────────────────────────────────────────────────
// commerce/products — product.types.ts
//
// Tipos del catálogo maestro de productos (tenant-level).
// NO incluye datos operativos por sucursal (stock, bodega, estante).
// Esos campos pertenecen a branch_products — Etapa 12: Inventario.
// ─────────────────────────────────────────────────────────────────

// ── Enums ────────────────────────────────────────────────────────

export type ProductType = "PRODUCT" | "SERVICE";

export type ProductStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "DISCONTINUED"
  | "BLOCKED_PURCHASE"
  | "BLOCKED_SALE";

// ── Entidades relacionadas (proyecciones mínimas) ────────────────

export interface ProductCategory {
  id: string;
  code: string;
  name: string;
}

export interface ProductLine {
  id: string;
  code: string;
  name: string;
  category_id: string;
}

export interface ProductSubline {
  id: string;
  code: string;
  name: string;
  line_id: string;
}

export interface UnitOfMeasure {
  id: string;
  name: string;
  symbol: string;
}

export interface Supplier {
  id: string;
  name: string;
}

export interface TaxRate {
  id: string;
  name: string;
  rate: number; // porcentaje, ej. 19 para 19%
}

// ── Entidad completa ─────────────────────────────────────────────

/**
 * Representación completa de un producto del catálogo maestro.
 * Usada en la ficha de detalle y en el panel resumen.
 *
 * Los campos de precio (cost_price, sale_price) se reciben como
 * number porque las queries convierten Decimal de Prisma antes de
 * serializar al cliente.
 */
export interface Product {
  // Identidad
  id: string;
  tenant_id: string;
  product_code: string;
  name: string;
  description: string | null;

  // Tipo y estado
  product_type: ProductType;
  status: ProductStatus;
  is_stockable: boolean;
  allow_purchase: boolean;
  allow_sale: boolean;

  // Clasificación
  category_id: string;
  category: ProductCategory;
  line_id: string | null;
  line: Pick<ProductLine, "id" | "name"> | null;
  subline_id: string | null;
  subline: Pick<ProductSubline, "id" | "name"> | null;
  brand: string | null;

  // Logística del catálogo (sin datos por ubicación)
  unit_id: string;
  unit: UnitOfMeasure;
  package_unit: string | null;
  supplier_id: string | null;
  supplier: Supplier | null;
  sku: string | null;

  // Precios
  cost_price: number | null;
  sale_price: number | null;
  tax_rate_id: string | null;
  tax_rate: TaxRate | null;

  // Auditoría
  // created_by / updated_by son String? en el schema (permite seeds sin usuario).
  // En runtime las actions siempre los inyectan desde sesión; nunca llegan null
  // por flujo normal, pero el tipo refleja la realidad de la DB.
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

// ── Proyección para tabla / lista ────────────────────────────────

/**
 * Versión reducida del producto para renderizar en la tabla de la
 * lista. Incluye todos los campos visibles en columnas del grid maestro,
 * incluyendo joins de línea, sublínea, proveedor y tasa de impuesto.
 */
export interface ProductListItem {
  id: string;
  product_code: string;
  name: string;
  product_type: ProductType;
  status: ProductStatus;
  category: Pick<ProductCategory, "id" | "name">;
  line: Pick<ProductLine, "id" | "name"> | null;
  subline: Pick<ProductSubline, "id" | "name"> | null;
  brand: string | null;
  unit: Pick<UnitOfMeasure, "id" | "name" | "symbol">;
  supplier: Pick<Supplier, "id" | "name"> | null;
  sku: string | null;
  sale_price: number | null;
  tax_rate: Pick<TaxRate, "id" | "rate"> | null;
  is_stockable: boolean;
  allow_purchase: boolean;
  allow_sale: boolean;
  created_at: Date;
}
