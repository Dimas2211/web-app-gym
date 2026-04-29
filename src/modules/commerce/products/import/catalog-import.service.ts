// ─────────────────────────────────────────────────────────────────
// commerce/products/import — catalog-import.service.ts
//
// Servicio de importación del catálogo base desde Excel.
// Lee el archivo, valida hoja por hoja y persiste con upsert
// cuando hay @@unique, o con findFirst-then-create cuando no.
//
// Estrategia por entidad:
//
//   UnitOfMeasure   → upsert({ where: { symbol } })
//   ProductCategory → upsert({ where: { tenant_id_code } })
//   ProductLine     → upsert({ where: { category_id_code } })
//   ProductSubline  → upsert({ where: { line_id_code } })
//   TaxRate         → findFirst({ tenant_id, name }) o create
//   Supplier        → findFirst({ tenant_id, name }) o create
//
// El servicio es idempotente: ejecutarlo dos veces con el mismo
// archivo no duplica registros ni altera los existentes.
//
// Errores de fila individual son coleccionados en ImportSheetResult
// sin abortar la importación completa (fail-soft por hoja).
// ─────────────────────────────────────────────────────────────────

import * as fs from "fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import {
  unidadRowSchema,
  categoriaRowSchema,
  lineaRowSchema,
  sublineaRowSchema,
  impuestoRowSchema,
  proveedorRowSchema,
  REQUIRED_SHEETS,
  type SheetName,
} from "./catalog-import.schema";
import type {
  CatalogImportResult,
  ImportSheetResult,
} from "./catalog-import.types";

// ── Helpers ───────────────────────────────────────────────────────

function readSheet(workbook: XLSX.WorkBook, name: SheetName): Record<string, unknown>[] {
  const sheet = workbook.Sheets[name];
  if (!sheet) return [];
  // header: 1 → primera fila como array; con defVal "" los nulls se omiten
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false, // todas las celdas como string; el schema usa coerce
  });
}

function emptyResult(sheet: string): ImportSheetResult {
  return { sheet, created: 0, skipped: 0, errors: [] };
}

// ── Importadores por hoja ─────────────────────────────────────────

async function importUnidades(
  rows: Record<string, unknown>[],
  prisma: PrismaClient,
): Promise<ImportSheetResult> {
  const result = emptyResult("Unidades");

  for (const [i, raw] of rows.entries()) {
    const parsed = unidadRowSchema.safeParse(raw);
    if (!parsed.success) {
      result.errors.push(
        `Fila ${i + 2}: ${parsed.error.issues.map((e) => e.message).join(", ")}`,
      );
      continue;
    }
    const { nombre, simbolo } = parsed.data;

    const existing = await prisma.unitOfMeasure.findUnique({
      where: { symbol: simbolo },
      select: { id: true },
    });
    if (existing) {
      result.skipped++;
      continue;
    }

    await prisma.unitOfMeasure.create({
      data: { name: nombre, symbol: simbolo },
    });
    result.created++;
  }

  return result;
}

async function importCategorias(
  rows: Record<string, unknown>[],
  tenantId: string,
  prisma: PrismaClient,
): Promise<ImportSheetResult> {
  const result = emptyResult("Categorias");

  for (const [i, raw] of rows.entries()) {
    const parsed = categoriaRowSchema.safeParse(raw);
    if (!parsed.success) {
      result.errors.push(
        `Fila ${i + 2}: ${parsed.error.issues.map((e) => e.message).join(", ")}`,
      );
      continue;
    }
    const { codigo, nombre, descripcion } = parsed.data;

    const existing = await prisma.productCategory.findUnique({
      where: { tenant_id_code: { tenant_id: tenantId, code: codigo } },
      select: { id: true },
    });
    if (existing) {
      result.skipped++;
      continue;
    }

    await prisma.productCategory.create({
      data: {
        tenant_id:   tenantId,
        code:        codigo,
        name:        nombre,
        description: descripcion ?? null,
      },
    });
    result.created++;
  }

  return result;
}

async function importLineas(
  rows: Record<string, unknown>[],
  tenantId: string,
  prisma: PrismaClient,
): Promise<ImportSheetResult> {
  const result = emptyResult("Lineas");

  for (const [i, raw] of rows.entries()) {
    const parsed = lineaRowSchema.safeParse(raw);
    if (!parsed.success) {
      result.errors.push(
        `Fila ${i + 2}: ${parsed.error.issues.map((e) => e.message).join(", ")}`,
      );
      continue;
    }
    const { codigo_categoria, codigo, nombre } = parsed.data;

    // Resolver categoría padre
    const category = await prisma.productCategory.findUnique({
      where: { tenant_id_code: { tenant_id: tenantId, code: codigo_categoria } },
      select: { id: true },
    });
    if (!category) {
      result.errors.push(
        `Fila ${i + 2}: categoría "${codigo_categoria}" no encontrada para el tenant`,
      );
      continue;
    }

    const existing = await prisma.productLine.findUnique({
      where: { category_id_code: { category_id: category.id, code: codigo } },
      select: { id: true },
    });
    if (existing) {
      result.skipped++;
      continue;
    }

    await prisma.productLine.create({
      data: {
        tenant_id:   tenantId,
        category_id: category.id,
        code:        codigo,
        name:        nombre,
      },
    });
    result.created++;
  }

  return result;
}

async function importSublineas(
  rows: Record<string, unknown>[],
  tenantId: string,
  prisma: PrismaClient,
): Promise<ImportSheetResult> {
  const result = emptyResult("Sublineas");

  for (const [i, raw] of rows.entries()) {
    const parsed = sublineaRowSchema.safeParse(raw);
    if (!parsed.success) {
      result.errors.push(
        `Fila ${i + 2}: ${parsed.error.issues.map((e) => e.message).join(", ")}`,
      );
      continue;
    }
    const { codigo_categoria, codigo_linea, codigo, nombre } = parsed.data;

    // Resolver categoría para obtener la línea
    const category = await prisma.productCategory.findUnique({
      where: { tenant_id_code: { tenant_id: tenantId, code: codigo_categoria } },
      select: { id: true },
    });
    if (!category) {
      result.errors.push(
        `Fila ${i + 2}: categoría "${codigo_categoria}" no encontrada`,
      );
      continue;
    }

    const line = await prisma.productLine.findUnique({
      where: { category_id_code: { category_id: category.id, code: codigo_linea } },
      select: { id: true },
    });
    if (!line) {
      result.errors.push(
        `Fila ${i + 2}: línea "${codigo_linea}" no encontrada en categoría "${codigo_categoria}"`,
      );
      continue;
    }

    const existing = await prisma.productSubline.findUnique({
      where: { line_id_code: { line_id: line.id, code: codigo } },
      select: { id: true },
    });
    if (existing) {
      result.skipped++;
      continue;
    }

    await prisma.productSubline.create({
      data: {
        tenant_id: tenantId,
        line_id:   line.id,
        code:      codigo,
        name:      nombre,
      },
    });
    result.created++;
  }

  return result;
}

async function importImpuestos(
  rows: Record<string, unknown>[],
  tenantId: string,
  prisma: PrismaClient,
): Promise<ImportSheetResult> {
  const result = emptyResult("Impuestos");

  for (const [i, raw] of rows.entries()) {
    const parsed = impuestoRowSchema.safeParse(raw);
    if (!parsed.success) {
      result.errors.push(
        `Fila ${i + 2}: ${parsed.error.issues.map((e) => e.message).join(", ")}`,
      );
      continue;
    }
    const { nombre, tasa } = parsed.data;

    // TaxRate no tiene @@unique por (tenant_id, name): usar findFirst
    const existing = await prisma.taxRate.findFirst({
      where: { tenant_id: tenantId, name: nombre },
      select: { id: true },
    });
    if (existing) {
      result.skipped++;
      continue;
    }

    await prisma.taxRate.create({
      data: {
        tenant_id: tenantId,
        name:      nombre,
        rate:      tasa,
      },
    });
    result.created++;
  }

  return result;
}

async function importProveedores(
  rows: Record<string, unknown>[],
  tenantId: string,
  prisma: PrismaClient,
): Promise<ImportSheetResult> {
  const result = emptyResult("Proveedores");

  for (const [i, raw] of rows.entries()) {
    const parsed = proveedorRowSchema.safeParse(raw);
    if (!parsed.success) {
      result.errors.push(
        `Fila ${i + 2}: ${parsed.error.issues.map((e) => e.message).join(", ")}`,
      );
      continue;
    }
    const { nombre } = parsed.data;

    // Supplier no tiene @@unique por (tenant_id, name): usar findFirst
    const existing = await prisma.supplier.findFirst({
      where: { tenant_id: tenantId, name: nombre },
      select: { id: true },
    });
    if (existing) {
      result.skipped++;
      continue;
    }

    // supplier_code es obligatorio desde Etapa 12 (commerce/suppliers).
    // El importador de catálogo genera un código provisional derivado del nombre.
    // El usuario debe revisarlo y asignar el código definitivo desde el maestro.
    const provisionalCode = `IMP-${nombre.slice(0, 20).trim().toUpperCase().replace(/\s+/g, "-")}`;
    await prisma.supplier.create({
      data: {
        tenant_id:     tenantId,
        name:          nombre,
        supplier_code: provisionalCode,
        taxpayer_type: "SMALL_TAXPAYER",
      },
    });
    result.created++;
  }

  return result;
}

// ── Función principal ─────────────────────────────────────────────

export async function importCatalog(
  tenantId: string,
  filePath: string,
  prisma: PrismaClient,
): Promise<CatalogImportResult> {
  // Validar que el archivo exista
  if (!fs.existsSync(filePath)) {
    throw new Error(`Archivo no encontrado: ${filePath}`);
  }

  // Leer libro Excel
  const workbook = XLSX.readFile(filePath);

  // Advertir si alguna hoja requerida está ausente (no aborta)
  const missingSheets = REQUIRED_SHEETS.filter(
    (name) => !workbook.SheetNames.includes(name),
  );
  if (missingSheets.length > 0) {
    console.warn(
      `⚠️  Hojas ausentes en el archivo: ${missingSheets.join(", ")}. Se omitirán.`,
    );
  }

  // Importar en orden de dependencia:
  // Unidades y Categorias/Impuestos/Proveedores son independientes.
  // Lineas dependen de Categorias; Sublineas dependen de Lineas.
  const sheetResults: ImportSheetResult[] = [];

  sheetResults.push(
    await importUnidades(readSheet(workbook, "Unidades"), prisma),
  );
  sheetResults.push(
    await importCategorias(readSheet(workbook, "Categorias"), tenantId, prisma),
  );
  sheetResults.push(
    await importLineas(readSheet(workbook, "Lineas"), tenantId, prisma),
  );
  sheetResults.push(
    await importSublineas(readSheet(workbook, "Sublineas"), tenantId, prisma),
  );
  sheetResults.push(
    await importImpuestos(readSheet(workbook, "Impuestos"), tenantId, prisma),
  );
  sheetResults.push(
    await importProveedores(readSheet(workbook, "Proveedores"), tenantId, prisma),
  );

  const totalCreated = sheetResults.reduce((s, r) => s + r.created, 0);
  const totalSkipped = sheetResults.reduce((s, r) => s + r.skipped, 0);
  const totalErrors  = sheetResults.reduce((s, r) => s + r.errors.length, 0);

  return {
    tenantId,
    filePath,
    sheets: sheetResults,
    totalCreated,
    totalSkipped,
    totalErrors,
  };
}
