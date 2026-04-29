// ─────────────────────────────────────────────────────────────────
// commerce/products/import — catalog-import.types.ts
//
// Tipos que describen la forma esperada de cada hoja del Excel
// del importador de catálogo base.
//
// Hoja "Unidades"       → UnidadRow
// Hoja "Categorias"     → CategoriaRow
// Hoja "Lineas"         → LineaRow
// Hoja "Sublineas"      → SublineaRow
// Hoja "Impuestos"      → ImpuestoRow
// Hoja "Proveedores"    → ProveedorRow
//
// Convención: los nombres de campo reflejan los encabezados de
// columna del Excel (español, sin tildes, snake_case).
// ─────────────────────────────────────────────────────────────────

// ── Hoja: Unidades ────────────────────────────────────────────────
// UnitOfMeasure — sin tenant_id (global)
// @@unique([symbol]) — la clave natural es el símbolo

export interface UnidadRow {
  /** Nombre descriptivo, ej: "Kilogramo" */
  nombre: string;
  /** Símbolo único, ej: "kg" */
  simbolo: string;
}

// ── Hoja: Categorias ─────────────────────────────────────────────
// ProductCategory — @@unique([tenant_id, code])

export interface CategoriaRow {
  /** Código corto único dentro del tenant, ej: "SUPL" */
  codigo: string;
  /** Nombre descriptivo, ej: "Suplementos" */
  nombre: string;
  /** Descripción opcional */
  descripcion?: string;
}

// ── Hoja: Lineas ──────────────────────────────────────────────────
// ProductLine — @@unique([category_id, code])

export interface LineaRow {
  /** Código de categoría padre (referencia a CategoriaRow.codigo) */
  codigo_categoria: string;
  /** Código corto único dentro de la categoría, ej: "PROT" */
  codigo: string;
  /** Nombre descriptivo, ej: "Proteínas" */
  nombre: string;
}

// ── Hoja: Sublineas ──────────────────────────────────────────────
// ProductSubline — @@unique([line_id, code])

export interface SublineaRow {
  /** Código de categoría de la línea padre */
  codigo_categoria: string;
  /** Código de línea padre (referencia a LineaRow.codigo) */
  codigo_linea: string;
  /** Código corto único dentro de la línea, ej: "WHEY" */
  codigo: string;
  /** Nombre descriptivo, ej: "Whey Protein" */
  nombre: string;
}

// ── Hoja: Impuestos ───────────────────────────────────────────────
// TaxRate — no tiene @@unique; se identifica por (tenant_id, name)
// En el importer se busca primero por nombre; si no existe, se crea.

export interface ImpuestoRow {
  /** Nombre del impuesto, ej: "IVA 19%" */
  nombre: string;
  /** Tasa porcentual, ej: 19 (no 0.19) */
  tasa: number;
}

// ── Hoja: Proveedores ─────────────────────────────────────────────
// Supplier — no tiene @@unique; se identifica por (tenant_id, name)
// En el importer se busca primero por nombre; si no existe, se crea.

export interface ProveedorRow {
  /** Nombre del proveedor, ej: "NutriCorp S.A." */
  nombre: string;
}

// ── Resultado del import ─────────────────────────────────────────

export interface ImportSheetResult {
  sheet: string;
  created: number;
  skipped: number;
  errors: string[];
}

export interface CatalogImportResult {
  tenantId: string;
  filePath: string;
  sheets: ImportSheetResult[];
  totalCreated: number;
  totalSkipped: number;
  totalErrors: number;
}
