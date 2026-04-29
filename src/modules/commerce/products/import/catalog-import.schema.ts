// ─────────────────────────────────────────────────────────────────
// commerce/products/import — catalog-import.schema.ts
//
// Schemas Zod para validar las filas de cada hoja del Excel.
// Cada schema se aplica fila a fila durante la importación;
// los errores de fila individual son coleccionados en ImportSheetResult
// sin abortar el proceso completo.
//
// Convenciones:
//   - coerce.string().trim() → tolerante a celdas numéricas en Excel
//   - coerce.number()        → tolerante a texto "19" vs número 19
//   - min(1) en todos los strings obligatorios
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Unidades ──────────────────────────────────────────────────────

export const unidadRowSchema = z.object({
  nombre:  z.coerce.string().trim().min(1, "nombre requerido"),
  simbolo: z.coerce.string().trim().min(1, "simbolo requerido"),
});

// ── Categorías ────────────────────────────────────────────────────

export const categoriaRowSchema = z.object({
  codigo:      z.coerce.string().trim().min(1, "codigo requerido"),
  nombre:      z.coerce.string().trim().min(1, "nombre requerido"),
  descripcion: z.coerce.string().trim().optional(),
});

// ── Líneas ────────────────────────────────────────────────────────

export const lineaRowSchema = z.object({
  codigo_categoria: z.coerce.string().trim().min(1, "codigo_categoria requerido"),
  codigo:           z.coerce.string().trim().min(1, "codigo requerido"),
  nombre:           z.coerce.string().trim().min(1, "nombre requerido"),
});

// ── Sublíneas ─────────────────────────────────────────────────────

export const sublineaRowSchema = z.object({
  codigo_categoria: z.coerce.string().trim().min(1, "codigo_categoria requerido"),
  codigo_linea:     z.coerce.string().trim().min(1, "codigo_linea requerido"),
  codigo:           z.coerce.string().trim().min(1, "codigo requerido"),
  nombre:           z.coerce.string().trim().min(1, "nombre requerido"),
});

// ── Impuestos ─────────────────────────────────────────────────────

export const impuestoRowSchema = z.object({
  nombre: z.coerce.string().trim().min(1, "nombre requerido"),
  tasa:   z.coerce
    .number({ invalid_type_error: "tasa debe ser un número" })
    .min(0, "tasa no puede ser negativa")
    .max(100, "tasa no puede superar 100"),
});

// ── Proveedores ───────────────────────────────────────────────────

export const proveedorRowSchema = z.object({
  nombre: z.coerce.string().trim().min(1, "nombre requerido"),
});

// ── Mapa de hojas ─────────────────────────────────────────────────
// Permite iterar el libro Excel por nombre de hoja de forma tipada.

export const SHEET_SCHEMAS = {
  Unidades:   unidadRowSchema,
  Categorias: categoriaRowSchema,
  Lineas:     lineaRowSchema,
  Sublineas:  sublineaRowSchema,
  Impuestos:  impuestoRowSchema,
  Proveedores: proveedorRowSchema,
} as const;

export type SheetName = keyof typeof SHEET_SCHEMAS;

export const REQUIRED_SHEETS: SheetName[] = [
  "Unidades",
  "Categorias",
  "Lineas",
  "Sublineas",
  "Impuestos",
  "Proveedores",
];
