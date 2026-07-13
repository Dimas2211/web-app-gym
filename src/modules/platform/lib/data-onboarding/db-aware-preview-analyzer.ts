// ─────────────────────────────────────────────────────────────────
// platform — db-aware-preview-analyzer.ts
//
// E1B.1: Analizador de preview contra la base de datos destino.
// Lee registros existentes de la base cliente (solo lecturas) y
// enriquece el preview file-only con resoluciones, dependencias
// y detección de duplicados contra la base real.
//
// Reglas de seguridad E1B.1:
// - SOLO lecturas contra la base cliente (findMany, findUnique, count).
// - Sin create, update, delete, upsert ni raw SQL destructivo.
// - Sin seeds ni migraciones.
// - Sin persistencia de archivos ni credenciales.
// - El PrismaClient es temporal y se gestiona desde la action.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type {
  DataOnboardingDatasetKey,
  DataOnboardingImportPolicy,
  DataOnboardingPreviewResult,
  DataOnboardingDbAwarePreviewResult,
  DataOnboardingDbAwareRow,
  DataOnboardingDependencyCheck,
  DataOnboardingRowError,
  DataOnboardingRowWarning,
} from "../../types/platform.types";
import { applyImportPolicy } from "./import-policy";

// ── Input del analyzer ────────────────────────────────────────────

export interface AnalyzeDbAwareInput {
  datasetKey:    DataOnboardingDatasetKey;
  parsedPreview: DataOnboardingPreviewResult;
  importPolicy:  DataOnboardingImportPolicy;
  prismaClient:  PrismaClient;
  tenantId:      string;
}

// ── Helpers internos ──────────────────────────────────────────────

function normalizeKey(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

function strVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  return String(v).trim() === "";
}

// ── Función pública ───────────────────────────────────────────────

export async function analyzeDataOnboardingPreviewAgainstDatabase(
  input: AnalyzeDbAwareInput,
): Promise<DataOnboardingDbAwarePreviewResult> {
  const { datasetKey, parsedPreview, importPolicy, prismaClient, tenantId } = input;

  switch (datasetKey) {
    case "categories":
      return analyzeCategories(parsedPreview, importPolicy, prismaClient, tenantId);
    case "lines":
      return analyzeLines(parsedPreview, importPolicy, prismaClient, tenantId);
    case "sublines":
      return analyzeSublines(parsedPreview, importPolicy, prismaClient, tenantId);
    case "products":
      return analyzeProducts(parsedPreview, importPolicy, prismaClient, tenantId);
    case "customers":
      return analyzeCustomers(parsedPreview, importPolicy, prismaClient, tenantId);
    case "suppliers":
      return analyzeSuppliers(parsedPreview, importPolicy, prismaClient, tenantId);
    case "inventory_initial":
      return analyzeInventoryInitial(parsedPreview, importPolicy, prismaClient, tenantId);
    default:
      return buildUnsupportedResult(datasetKey, importPolicy);
  }
}

// ── Helpers de resumen ────────────────────────────────────────────

function buildSummaryFromRows(rows: DataOnboardingDbAwareRow[]) {
  const createRows          = rows.filter((r) => r.resolution === "CREATE").length;
  const updateRows          = rows.filter((r) => r.resolution === "UPDATE").length;
  const skipRows            = rows.filter((r) => r.resolution === "SKIP").length;
  const errorRows           = rows.filter((r) => r.resolution === "ERROR").length;
  const missingDependencies = rows.filter((r) =>
    r.dependencyChecks.some((d) => !d.found),
  ).length;
  const duplicatesInDatabase = rows.filter((r) =>
    r.errors.some((e) => e.code === "DUPLICATE_IN_DATABASE"),
  ).length;

  return { createRows, updateRows, skipRows, errorRows, missingDependencies, duplicatesInDatabase };
}

function buildStatus(
  summary: ReturnType<typeof buildSummaryFromRows>,
): DataOnboardingDbAwarePreviewResult["status"] {
  if (summary.errorRows > 0 || summary.missingDependencies > 0) return "BLOCKED";
  if (summary.skipRows > 0 || summary.duplicatesInDatabase > 0) return "READY_WITH_WARNINGS";
  return "READY";
}

function buildUnsupportedResult(
  datasetKey:   DataOnboardingDatasetKey,
  importPolicy: DataOnboardingImportPolicy,
): DataOnboardingDbAwarePreviewResult {
  return {
    datasetKey,
    importPolicy,
    status:  "BLOCKED",
    summary: { createRows: 0, updateRows: 0, skipRows: 0, errorRows: 0, missingDependencies: 0, duplicatesInDatabase: 0 },
    rows:    [],
  };
}

// ─────────────────────────────────────────────────────────────────
// CATEGORIES
// Natural key: normalized(name) por tenant
// Depende de: nada
// ─────────────────────────────────────────────────────────────────

async function analyzeCategories(
  preview:      DataOnboardingPreviewResult,
  importPolicy: DataOnboardingImportPolicy,
  db:           PrismaClient,
  tenantId:     string,
): Promise<DataOnboardingDbAwarePreviewResult> {
  // Batch: carga todas las categorías del tenant
  const existing = await db.productCategory.findMany({
    where:  { tenant_id: tenantId },
    select: { id: true, name: true },
  });

  // Mapa: normalized(name) → id
  const existingMap = new Map<string, string>();
  for (const cat of existing) {
    existingMap.set(normalizeKey(cat.name), cat.id);
  }

  const dbRows: DataOnboardingDbAwareRow[] = [];

  for (const row of preview.rows) {
    const name       = strVal(row.data.name);
    const naturalKey = normalizeKey(name);
    const existsInDb = naturalKey !== "" && existingMap.has(naturalKey);

    const errors:   DataOnboardingRowError[]   = [...row.errors];
    const warnings: DataOnboardingRowWarning[] = [...row.warnings];

    // Si la fila ya tenía error de parser (campo requerido vacío), marcar ERROR directo
    if (row.status === "ERROR") {
      dbRows.push({
        rowNumber:        row.rowNumber,
        resolution:       "ERROR",
        naturalKey:       naturalKey || "(vacío)",
        existsInDb:       false,
        errors,
        warnings,
        dependencyChecks: [],
      });
      continue;
    }

    const policy = applyImportPolicy(importPolicy, existsInDb, name);
    errors.push(...policy.errors);
    warnings.push(...policy.warnings);

    dbRows.push({
      rowNumber:        row.rowNumber,
      resolution:       policy.resolution,
      naturalKey:       name,
      existsInDb,
      errors,
      warnings,
      dependencyChecks: [],
    });
  }

  const summary = buildSummaryFromRows(dbRows);
  return {
    datasetKey:   "categories",
    importPolicy,
    status:       buildStatus(summary),
    summary,
    rows:         dbRows,
  };
}

// ─────────────────────────────────────────────────────────────────
// LINES
// Natural key: normalized(category_name)::normalized(name)
// Depende de: categoría existente por nombre
// ─────────────────────────────────────────────────────────────────

async function analyzeLines(
  preview:      DataOnboardingPreviewResult,
  importPolicy: DataOnboardingImportPolicy,
  db:           PrismaClient,
  tenantId:     string,
): Promise<DataOnboardingDbAwarePreviewResult> {
  const categories = await db.productCategory.findMany({
    where:  { tenant_id: tenantId },
    select: { id: true, name: true },
  });
  const catMap = new Map<string, { id: string; name: string }>();
  for (const cat of categories) {
    catMap.set(normalizeKey(cat.name), cat);
  }

  const lines = await db.productLine.findMany({
    where:  { tenant_id: tenantId },
    select: { id: true, name: true, category_id: true },
  });
  // Mapa: category_id::normalized(line_name) → id
  const lineMap = new Map<string, string>();
  for (const line of lines) {
    lineMap.set(`${line.category_id}::${normalizeKey(line.name)}`, line.id);
  }

  const dbRows: DataOnboardingDbAwareRow[] = [];

  for (const row of preview.rows) {
    const name         = strVal(row.data.name);
    const categoryName = strVal(row.data.category_name);
    const naturalKey   = `${normalizeKey(categoryName)}::${normalizeKey(name)}`;

    const errors:   DataOnboardingRowError[]   = [...row.errors];
    const warnings: DataOnboardingRowWarning[] = [...row.warnings];
    const deps:     DataOnboardingDependencyCheck[] = [];

    if (row.status === "ERROR") {
      dbRows.push({ rowNumber: row.rowNumber, resolution: "ERROR", naturalKey, existsInDb: false, errors, warnings, dependencyChecks: [] });
      continue;
    }

    // Dep: categoría
    const catFound = catMap.get(normalizeKey(categoryName));
    deps.push({
      dependencyType: "category",
      lookupField:    "category_name",
      lookupValue:    categoryName,
      found:          !!catFound,
      foundId:        catFound?.id,
      message:        catFound ? undefined : `Categoría "${categoryName}" no existe en la base destino.`,
    });

    if (!catFound) {
      errors.push({ code: "MISSING_DEPENDENCY", field: "category_name", message: `Categoría "${categoryName}" no encontrada en la base destino.` });
      dbRows.push({ rowNumber: row.rowNumber, resolution: "ERROR", naturalKey, existsInDb: false, errors, warnings, dependencyChecks: deps });
      continue;
    }

    const existsInDb = lineMap.has(`${catFound.id}::${normalizeKey(name)}`);
    const policy = applyImportPolicy(importPolicy, existsInDb, naturalKey);
    errors.push(...policy.errors);
    warnings.push(...policy.warnings);

    dbRows.push({ rowNumber: row.rowNumber, resolution: policy.resolution, naturalKey, existsInDb, errors, warnings, dependencyChecks: deps });
  }

  const summary = buildSummaryFromRows(dbRows);
  return { datasetKey: "lines", importPolicy, status: buildStatus(summary), summary, rows: dbRows };
}

// ─────────────────────────────────────────────────────────────────
// SUBLINES
// Natural key: normalized(line_name)::normalized(name)
// Depende de: línea existente por nombre (dentro del tenant)
// Si category_name presente, validar consistencia
// ─────────────────────────────────────────────────────────────────

async function analyzeSublines(
  preview:      DataOnboardingPreviewResult,
  importPolicy: DataOnboardingImportPolicy,
  db:           PrismaClient,
  tenantId:     string,
): Promise<DataOnboardingDbAwarePreviewResult> {
  const categories = await db.productCategory.findMany({
    where:  { tenant_id: tenantId },
    select: { id: true, name: true },
  });
  const catMap = new Map<string, string>(); // normalized(name) → id
  for (const cat of categories) catMap.set(normalizeKey(cat.name), cat.id);

  const lines = await db.productLine.findMany({
    where:  { tenant_id: tenantId },
    select: { id: true, name: true, category_id: true },
  });
  // normalized(name) → list (puede haber mismo nombre en diferentes categorías)
  const lineByName = new Map<string, typeof lines>();
  for (const line of lines) {
    const key = normalizeKey(line.name);
    if (!lineByName.has(key)) lineByName.set(key, []);
    lineByName.get(key)!.push(line);
  }

  const sublines = await db.productSubline.findMany({
    where:  { tenant_id: tenantId },
    select: { id: true, name: true, line_id: true },
  });
  const sublineMap = new Map<string, string>(); // line_id::normalized(name) → id
  for (const sl of sublines) {
    sublineMap.set(`${sl.line_id}::${normalizeKey(sl.name)}`, sl.id);
  }

  const dbRows: DataOnboardingDbAwareRow[] = [];

  for (const row of preview.rows) {
    const name         = strVal(row.data.name);
    const lineName     = strVal(row.data.line_name);
    const categoryName = strVal(row.data.category_name);
    const naturalKey   = `${normalizeKey(lineName)}::${normalizeKey(name)}`;

    const errors:   DataOnboardingRowError[]   = [...row.errors];
    const warnings: DataOnboardingRowWarning[] = [...row.warnings];
    const deps:     DataOnboardingDependencyCheck[] = [];

    if (row.status === "ERROR") {
      dbRows.push({ rowNumber: row.rowNumber, resolution: "ERROR", naturalKey, existsInDb: false, errors, warnings, dependencyChecks: [] });
      continue;
    }

    // Dep: línea
    const matchingLines = lineByName.get(normalizeKey(lineName)) ?? [];

    // Si se proporcionó category_name, filtrar líneas por categoría
    let resolvedLine: (typeof lines)[number] | undefined;
    if (!isEmpty(categoryName)) {
      const catId = catMap.get(normalizeKey(categoryName));
      if (catId) {
        resolvedLine = matchingLines.find((l) => l.category_id === catId);
      } else {
        warnings.push({ code: "CATEGORY_NOT_FOUND", field: "category_name", message: `Categoría "${categoryName}" no existe. Se ignora en la resolución de línea.` });
        resolvedLine = matchingLines.length === 1 ? matchingLines[0] : undefined;
      }
    } else {
      if (matchingLines.length === 1) resolvedLine = matchingLines[0];
      else if (matchingLines.length > 1) {
        warnings.push({ code: "AMBIGUOUS_LINE", field: "line_name", message: `Línea "${lineName}" es ambigua — existe en múltiples categorías. Proporcione 'category_name' para resolver.` });
      }
    }

    const lineFound = resolvedLine !== undefined;
    deps.push({
      dependencyType: "line",
      lookupField:    "line_name",
      lookupValue:    lineName,
      found:          lineFound,
      foundId:        resolvedLine?.id,
      message:        lineFound ? undefined : `Línea "${lineName}" no encontrada en la base destino.`,
    });

    if (!lineFound) {
      errors.push({ code: "MISSING_DEPENDENCY", field: "line_name", message: `Línea "${lineName}" no encontrada en la base destino.` });
      dbRows.push({ rowNumber: row.rowNumber, resolution: "ERROR", naturalKey, existsInDb: false, errors, warnings, dependencyChecks: deps });
      continue;
    }

    const existsInDb = sublineMap.has(`${resolvedLine!.id}::${normalizeKey(name)}`);
    const policy = applyImportPolicy(importPolicy, existsInDb, naturalKey);
    errors.push(...policy.errors);
    warnings.push(...policy.warnings);

    dbRows.push({ rowNumber: row.rowNumber, resolution: policy.resolution, naturalKey, existsInDb, errors, warnings, dependencyChecks: deps });
  }

  const summary = buildSummaryFromRows(dbRows);
  return { datasetKey: "sublines", importPolicy, status: buildStatus(summary), summary, rows: dbRows };
}

// ─────────────────────────────────────────────────────────────────
// PRODUCTS
// Natural key: product_code (único por tenant)
// Depende de: category_name, unit_name, line_name?, subline_name?,
//             tax_rate_name?
// ─────────────────────────────────────────────────────────────────

// ── E1C-D.1: resolución de dependencia por nombre sin ambigüedad silenciosa ──
// Nunca resuelve al primer/último candidato: 0 → MISSING_DEPENDENCY,
// 1 → resuelve, 2+ → AMBIGUOUS_DEPENDENCY. Solo lectura, no crea nada.

interface UniqueDependencyResolution {
  foundId?: string;
  check:    DataOnboardingDependencyCheck;
  error?:   DataOnboardingRowError;
}

function resolveUniqueDependency(params: {
  dependencyType:   string;
  lookupField:      string;
  lookupValue:      string;
  matches:          { id: string }[];
  notFoundMessage:  string;
  ambiguousMessage: string;
}): UniqueDependencyResolution {
  const { dependencyType, lookupField, lookupValue, matches, notFoundMessage, ambiguousMessage } = params;

  if (matches.length === 0) {
    return {
      check: { dependencyType, lookupField, lookupValue, found: false, message: notFoundMessage },
      error: { code: "MISSING_DEPENDENCY", field: lookupField, message: notFoundMessage },
    };
  }
  if (matches.length > 1) {
    return {
      check: { dependencyType, lookupField, lookupValue, found: false, message: ambiguousMessage },
      error: { code: "AMBIGUOUS_DEPENDENCY", field: lookupField, message: ambiguousMessage },
    };
  }
  return {
    foundId: matches[0].id,
    check:   { dependencyType, lookupField, lookupValue, found: true, foundId: matches[0].id },
  };
}

async function analyzeProducts(
  preview:      DataOnboardingPreviewResult,
  importPolicy: DataOnboardingImportPolicy,
  db:           PrismaClient,
  tenantId:     string,
): Promise<DataOnboardingDbAwarePreviewResult> {
  // Recoger product_codes del Excel para batch query
  const codesInFile = preview.rows
    .map((r) => strVal(r.data.product_code).toUpperCase())
    .filter(Boolean);

  // Cargar todo lo necesario en paralelo — listas planas, sin Map que
  // sobrescriba silenciosamente ante nombres normalizados duplicados.
  const [existingProducts, categories, lines, sublines, units, taxRates, suppliers] = await Promise.all([
    db.product.findMany({
      where:  { tenant_id: tenantId, product_code: { in: codesInFile } },
      select: { id: true, product_code: true, sku: true },
    }),
    db.productCategory.findMany({
      where:  { tenant_id: tenantId },
      select: { id: true, name: true },
    }),
    db.productLine.findMany({
      where:  { tenant_id: tenantId },
      select: { id: true, name: true, category_id: true },
    }),
    db.productSubline.findMany({
      where:  { tenant_id: tenantId },
      select: { id: true, name: true, line_id: true },
    }),
    db.unitOfMeasure.findMany({
      where:  { status: "active" },
      select: { id: true, name: true, symbol: true },
    }),
    db.taxRate.findMany({
      where:  { tenant_id: tenantId },
      select: { id: true, name: true },
    }),
    db.supplier.findMany({
      where:  { tenant_id: tenantId },
      select: { id: true, name: true },
    }),
  ]);

  const productMap = new Map(existingProducts.map((p) => [p.product_code.toUpperCase(), p]));

  // SKUs existentes en la base para detectar duplicados por SKU
  const existingSkus = new Set(
    existingProducts.map((p) => normalizeKey(p.sku ?? "")).filter(Boolean),
  );

  const dbRows: DataOnboardingDbAwareRow[] = [];

  for (const row of preview.rows) {
    const code        = strVal(row.data.product_code).toUpperCase();
    const naturalKey  = code || "(vacío)";

    const errors:   DataOnboardingRowError[]   = [...row.errors];
    const warnings: DataOnboardingRowWarning[] = [...row.warnings];
    const deps:     DataOnboardingDependencyCheck[] = [];

    if (row.status === "ERROR") {
      dbRows.push({ rowNumber: row.rowNumber, resolution: "ERROR", naturalKey, existsInDb: false, errors, warnings, dependencyChecks: [] });
      continue;
    }

    const existsInDb = code !== "" && productMap.has(code);

    // Dep: categoría (requerida) — 0/1/2+ candidatos por nombre normalizado
    const catName    = strVal(row.data.category_name);
    const catMatches = categories.filter((c) => normalizeKey(c.name) === normalizeKey(catName));
    const catResult  = resolveUniqueDependency({
      dependencyType:   "category",
      lookupField:      "category_name",
      lookupValue:      catName,
      matches:          catMatches,
      notFoundMessage:  `Categoría "${catName}" no existe en la base destino.`,
      ambiguousMessage: `Dependencia ambigua: hay más de una categoría con el nombre "${catName}". Usa nombres únicos o corrige el catálogo antes de importar productos.`,
    });
    const catId = catResult.foundId;
    deps.push(catResult.check);
    if (catResult.error) errors.push(catResult.error);

    // Dep: unidad de medida (requerida) — candidatos por nombre O símbolo, 0/1/2+
    const unitName    = strVal(row.data.unit_name);
    const unitKey      = normalizeKey(unitName);
    const unitMatches = units.filter((u) => normalizeKey(u.name) === unitKey || normalizeKey(u.symbol) === unitKey);
    const unitResult  = resolveUniqueDependency({
      dependencyType:   "unit_of_measure",
      lookupField:      "unit_name",
      lookupValue:      unitName,
      matches:          unitMatches,
      notFoundMessage:  `Unidad "${unitName}" no existe en el catálogo global.`,
      ambiguousMessage: `Dependencia ambigua: hay más de una unidad de medida que coincide con "${unitName}" (por nombre o símbolo). Usa nombres/símbolos únicos o corrige el catálogo antes de importar productos.`,
    });
    deps.push(unitResult.check);
    if (unitResult.error) errors.push(unitResult.error);

    // Dep: línea (opcional) — debe pertenecer a la categoría resuelta, sin ambigüedad
    let resolvedLineId: string | undefined;
    if (!isEmpty(row.data.line_name)) {
      const lineName = strVal(row.data.line_name);
      const lineKey  = normalizeKey(lineName);
      const byName   = lines.filter((l) => normalizeKey(l.name) === lineKey);

      if (!catId) {
        const msg = `No se puede validar la línea "${lineName}" sin una categoría resuelta.`;
        deps.push({ dependencyType: "line", lookupField: "line_name", lookupValue: lineName, found: false, message: msg });
        errors.push({ code: "MISSING_DEPENDENCY", field: "line_name", message: msg });
      } else if (byName.length === 0) {
        const msg = `Línea "${lineName}" no existe en la base destino.`;
        deps.push({ dependencyType: "line", lookupField: "line_name", lookupValue: lineName, found: false, message: msg });
        errors.push({ code: "MISSING_DEPENDENCY", field: "line_name", message: msg });
      } else {
        const inCategory = byName.filter((l) => l.category_id === catId);
        if (inCategory.length === 0) {
          const msg = `Línea "${lineName}" no pertenece a la categoría "${catName}".`;
          deps.push({ dependencyType: "line", lookupField: "line_name", lookupValue: lineName, found: false, message: msg });
          errors.push({ code: "LINE_CATEGORY_MISMATCH", field: "line_name", message: msg });
        } else if (inCategory.length > 1) {
          const msg = `Dependencia ambigua: hay más de una línea con el nombre "${lineName}" dentro de la categoría "${catName}". Usa nombres únicos o corrige el catálogo antes de importar productos.`;
          deps.push({ dependencyType: "line", lookupField: "line_name", lookupValue: lineName, found: false, message: msg });
          errors.push({ code: "AMBIGUOUS_DEPENDENCY", field: "line_name", message: msg });
        } else {
          resolvedLineId = inCategory[0].id;
          deps.push({ dependencyType: "line", lookupField: "line_name", lookupValue: lineName, found: true, foundId: resolvedLineId });
        }
      }
    }

    // Dep: sublínea (opcional) — debe pertenecer a la línea resuelta, sin ambigüedad
    if (!isEmpty(row.data.subline_name)) {
      const sublineName = strVal(row.data.subline_name);
      const sublineKey  = normalizeKey(sublineName);
      const byName      = sublines.filter((s) => normalizeKey(s.name) === sublineKey);

      if (!resolvedLineId) {
        const msg = `No se puede validar la sublínea "${sublineName}" sin una línea resuelta.`;
        deps.push({ dependencyType: "subline", lookupField: "subline_name", lookupValue: sublineName, found: false, message: msg });
        errors.push({ code: "MISSING_DEPENDENCY", field: "subline_name", message: msg });
      } else if (byName.length === 0) {
        const msg = `Sublínea "${sublineName}" no existe en la base destino.`;
        deps.push({ dependencyType: "subline", lookupField: "subline_name", lookupValue: sublineName, found: false, message: msg });
        errors.push({ code: "MISSING_DEPENDENCY", field: "subline_name", message: msg });
      } else {
        const inLine = byName.filter((s) => s.line_id === resolvedLineId);
        if (inLine.length === 0) {
          const msg = `Sublínea "${sublineName}" no pertenece a la línea "${strVal(row.data.line_name)}".`;
          deps.push({ dependencyType: "subline", lookupField: "subline_name", lookupValue: sublineName, found: false, message: msg });
          errors.push({ code: "SUBLINE_LINE_MISMATCH", field: "subline_name", message: msg });
        } else if (inLine.length > 1) {
          const msg = `Dependencia ambigua: hay más de una sublínea con el nombre "${sublineName}" dentro de la línea "${strVal(row.data.line_name)}". Usa nombres únicos o corrige el catálogo antes de importar productos.`;
          deps.push({ dependencyType: "subline", lookupField: "subline_name", lookupValue: sublineName, found: false, message: msg });
          errors.push({ code: "AMBIGUOUS_DEPENDENCY", field: "subline_name", message: msg });
        } else {
          deps.push({ dependencyType: "subline", lookupField: "subline_name", lookupValue: sublineName, found: true, foundId: inLine[0].id });
        }
      }
    }

    // Dep: tasa de impuesto (opcional) — 0/1/2+ candidatos por nombre normalizado
    if (!isEmpty(row.data.tax_rate_name)) {
      const taxName    = strVal(row.data.tax_rate_name);
      const taxMatches = taxRates.filter((t) => normalizeKey(t.name) === normalizeKey(taxName));
      const taxResult  = resolveUniqueDependency({
        dependencyType:   "tax_rate",
        lookupField:      "tax_rate_name",
        lookupValue:      taxName,
        matches:          taxMatches,
        notFoundMessage:  `Tasa de impuesto "${taxName}" no existe en la base destino.`,
        ambiguousMessage: `Dependencia ambigua: hay más de una tasa de impuesto con el nombre "${taxName}". Usa nombres únicos o corrige el catálogo antes de importar productos.`,
      });
      deps.push(taxResult.check);
      if (taxResult.error) errors.push(taxResult.error);
    }

    // Dep: proveedor (opcional) — 0/1/2+ candidatos por nombre normalizado
    if (!isEmpty(row.data.supplier_name)) {
      const supplierName    = strVal(row.data.supplier_name);
      const supplierMatches = suppliers.filter((s) => normalizeKey(s.name) === normalizeKey(supplierName));
      const supplierResult  = resolveUniqueDependency({
        dependencyType:   "supplier",
        lookupField:      "supplier_name",
        lookupValue:      supplierName,
        matches:          supplierMatches,
        notFoundMessage:  `Proveedor "${supplierName}" no existe en la base destino.`,
        ambiguousMessage: `Dependencia ambigua: hay más de un proveedor con el nombre "${supplierName}". Usa nombres únicos o corrige el catálogo antes de importar productos.`,
      });
      deps.push(supplierResult.check);
      if (supplierResult.error) errors.push(supplierResult.error);
    }

    // Warning: SKU duplicado contra base
    if (!isEmpty(row.data.sku)) {
      const sku = normalizeKey(row.data.sku);
      if (sku && existingSkus.has(sku)) {
        warnings.push({ code: "SKU_IN_DATABASE", field: "sku", message: `SKU "${strVal(row.data.sku)}" ya está en uso en la base destino.` });
      }
    }

    const hasMissingDep = deps.some((d) => !d.found);
    if (hasMissingDep) {
      dbRows.push({ rowNumber: row.rowNumber, resolution: "ERROR", naturalKey, existsInDb, errors, warnings, dependencyChecks: deps });
      continue;
    }

    const policy = applyImportPolicy(importPolicy, existsInDb, naturalKey);
    errors.push(...policy.errors);
    warnings.push(...policy.warnings);

    dbRows.push({ rowNumber: row.rowNumber, resolution: policy.resolution, naturalKey, existsInDb, errors, warnings, dependencyChecks: deps });
  }

  const summary = buildSummaryFromRows(dbRows);
  return { datasetKey: "products", importPolicy, status: buildStatus(summary), summary, rows: dbRows };
}

// ─────────────────────────────────────────────────────────────────
// CUSTOMERS
// Natural key fuerte: nit (si document_type=NIT) o dui (si =DUI)
// Fallback: normalized(name) como warning-only (no bloquea por nombre)
// ─────────────────────────────────────────────────────────────────

async function analyzeCustomers(
  preview:      DataOnboardingPreviewResult,
  importPolicy: DataOnboardingImportPolicy,
  db:           PrismaClient,
  tenantId:     string,
): Promise<DataOnboardingDbAwarePreviewResult> {
  const customers = await db.customer.findMany({
    where:  { tenant_id: tenantId },
    select: { id: true, name: true, nit: true, dui: true, customer_code: true },
  });

  const nitMap  = new Map<string, string>(); // normalized(nit) → id
  const duiMap  = new Map<string, string>(); // normalized(dui) → id
  const nameMap = new Map<string, string>(); // normalized(name) → id
  for (const c of customers) {
    if (c.nit)  nitMap.set(normalizeKey(c.nit),  c.id);
    if (c.dui)  duiMap.set(normalizeKey(c.dui),  c.id);
    nameMap.set(normalizeKey(c.name), c.id);
  }

  const dbRows: DataOnboardingDbAwareRow[] = [];

  for (const row of preview.rows) {
    const name         = strVal(row.data.name);
    const docType      = strVal(row.data.document_type).toUpperCase();
    const docNumber    = strVal(row.data.document_number);

    const errors:   DataOnboardingRowError[]   = [...row.errors];
    const warnings: DataOnboardingRowWarning[] = [...row.warnings];

    if (row.status === "ERROR") {
      dbRows.push({ rowNumber: row.rowNumber, resolution: "ERROR", naturalKey: name || "(vacío)", existsInDb: false, errors, warnings, dependencyChecks: [] });
      continue;
    }

    // Determinar llave fuerte
    let naturalKey = name;
    let existsInDb = false;

    if (docType === "NIT" && docNumber) {
      naturalKey = `NIT:${docNumber}`;
      existsInDb = nitMap.has(normalizeKey(docNumber));
    } else if (docType === "DUI" && docNumber) {
      naturalKey = `DUI:${docNumber}`;
      existsInDb = duiMap.has(normalizeKey(docNumber));
    } else if (docNumber) {
      // Documento presente pero tipo no es NIT/DUI — llave débil por nombre
      warnings.push({ code: "WEAK_NATURAL_KEY", field: "document_type", message: `Tipo de documento '${docType}' no es NIT ni DUI. La llave de identificación será el nombre — posible duplicado no detectable con certeza.` });
      if (nameMap.has(normalizeKey(name))) {
        warnings.push({ code: "POSSIBLE_DUPLICATE_NAME", field: "name", message: `Posible duplicado por nombre "${name}" (sin llave fuerte de documento).` });
        existsInDb = true;
      }
    } else {
      // Sin documento — llave débil por nombre
      warnings.push({ code: "WEAK_NATURAL_KEY", field: "document_number", message: `Sin número de documento. La llave de identificación será el nombre — no es posible detectar duplicados con certeza.` });
      if (nameMap.has(normalizeKey(name))) {
        warnings.push({ code: "POSSIBLE_DUPLICATE_NAME", field: "name", message: `Posible duplicado por nombre "${name}" (no hay número de documento para verificar).` });
        existsInDb = true;
      }
    }

    const policy = applyImportPolicy(importPolicy, existsInDb, naturalKey);
    errors.push(...policy.errors);
    warnings.push(...policy.warnings);

    dbRows.push({ rowNumber: row.rowNumber, resolution: policy.resolution, naturalKey, existsInDb, errors, warnings, dependencyChecks: [] });
  }

  const summary = buildSummaryFromRows(dbRows);
  return { datasetKey: "customers", importPolicy, status: buildStatus(summary), summary, rows: dbRows };
}

// ─────────────────────────────────────────────────────────────────
// SUPPLIERS
// Natural key: nit (si presente), de lo contrario normalized(name)
// ─────────────────────────────────────────────────────────────────

async function analyzeSuppliers(
  preview:      DataOnboardingPreviewResult,
  importPolicy: DataOnboardingImportPolicy,
  db:           PrismaClient,
  tenantId:     string,
): Promise<DataOnboardingDbAwarePreviewResult> {
  const suppliers = await db.supplier.findMany({
    where:  { tenant_id: tenantId },
    select: { id: true, name: true, nit: true },
  });

  const nitMap  = new Map<string, string>(); // normalized(nit) → id
  const nameMap = new Map<string, string>(); // normalized(name) → id
  for (const s of suppliers) {
    if (s.nit) nitMap.set(normalizeKey(s.nit.replace(/[-\s]/g, "")), s.id);
    nameMap.set(normalizeKey(s.name), s.id);
  }

  const dbRows: DataOnboardingDbAwareRow[] = [];

  for (const row of preview.rows) {
    const name    = strVal(row.data.name);
    const nit     = strVal(row.data.nit).replace(/[-\s]/g, "");

    const errors:   DataOnboardingRowError[]   = [...row.errors];
    const warnings: DataOnboardingRowWarning[] = [...row.warnings];

    if (row.status === "ERROR") {
      dbRows.push({ rowNumber: row.rowNumber, resolution: "ERROR", naturalKey: name || "(vacío)", existsInDb: false, errors, warnings, dependencyChecks: [] });
      continue;
    }

    let naturalKey = name;
    let existsInDb = false;

    if (nit) {
      naturalKey = `NIT:${nit}`;
      existsInDb = nitMap.has(normalizeKey(nit));
      if (!existsInDb) {
        // Verificar posible duplicado por nombre
        if (nameMap.has(normalizeKey(name))) {
          warnings.push({ code: "POSSIBLE_DUPLICATE_NAME", field: "name", message: `Nombre "${name}" ya existe con NIT diferente.` });
        }
      }
    } else {
      // Sin NIT — llave débil por nombre
      warnings.push({ code: "WEAK_NATURAL_KEY", field: "nit", message: `Sin NIT. La llave de identificación es el nombre — posible duplicado no detectable con certeza.` });
      existsInDb = nameMap.has(normalizeKey(name));
    }

    const policy = applyImportPolicy(importPolicy, existsInDb, naturalKey);
    errors.push(...policy.errors);
    warnings.push(...policy.warnings);

    dbRows.push({ rowNumber: row.rowNumber, resolution: policy.resolution, naturalKey, existsInDb, errors, warnings, dependencyChecks: [] });
  }

  const summary = buildSummaryFromRows(dbRows);
  return { datasetKey: "suppliers", importPolicy, status: buildStatus(summary), summary, rows: dbRows };
}

// ─────────────────────────────────────────────────────────────────
// INVENTORY INITIAL
// Natural key: product_code + location_name
// Depende de: producto existente, ubicación (Branch) existente
// Si ya hay ProductLocation o movimiento INITIAL_LOAD → ERROR
// ─────────────────────────────────────────────────────────────────

async function analyzeInventoryInitial(
  preview:      DataOnboardingPreviewResult,
  importPolicy: DataOnboardingImportPolicy,
  db:           PrismaClient,
  tenantId:     string,
): Promise<DataOnboardingDbAwarePreviewResult> {
  const codesInFile = preview.rows
    .map((r) => strVal(r.data.product_code).toUpperCase())
    .filter(Boolean);

  const [products, branches] = await Promise.all([
    db.product.findMany({
      where:  { tenant_id: tenantId, product_code: { in: codesInFile } },
      select: { id: true, product_code: true, is_stockable: true, product_type: true, status: true },
    }),
    db.branch.findMany({
      where:  { tenant_id: tenantId },
      select: { id: true, name: true },
    }),
  ]);

  const productMap = new Map(products.map((p) => [p.product_code.toUpperCase(), p]));

  // Agrupar sucursales por nombre normalizado para detectar ambigüedad
  const branchesByName = new Map<string, typeof branches>();
  for (const b of branches) {
    const key = normalizeKey(b.name);
    const list = branchesByName.get(key) ?? [];
    list.push(b);
    branchesByName.set(key, list);
  }

  // Cargar product locations existentes para combinar product_id + location_id
  const productIds = products.map((p) => p.id);
  const existingLocations = productIds.length > 0
    ? await db.productLocation.findMany({
        where:  { tenant_id: tenantId, product_id: { in: productIds } },
        select: { product_id: true, location_id: true },
      })
    : [];

  // Mapa: product_id::location_id → true
  const plMap = new Set(existingLocations.map((pl) => `${pl.product_id}::${pl.location_id}`));

  // Verificar si ya hay movimientos INITIAL_LOAD para esos product_locations
  const initialMoves = productIds.length > 0
    ? await db.inventoryMovement.findMany({
        where:  { tenant_id: tenantId, product_id: { in: productIds }, movement_type: "INITIAL_LOAD" },
        select: { product_id: true, location_id: true },
      })
    : [];
  const initMoveMap = new Set(initialMoves.map((m) => `${m.product_id}::${m.location_id}`));

  const dbRows: DataOnboardingDbAwareRow[] = [];

  for (const row of preview.rows) {
    const code         = strVal(row.data.product_code).toUpperCase();
    const locationName = strVal(row.data.location_name);
    const naturalKey   = `${code}::${locationName}`;

    const errors:   DataOnboardingRowError[]   = [...row.errors];
    const warnings: DataOnboardingRowWarning[] = [...row.warnings];
    const deps:     DataOnboardingDependencyCheck[] = [];

    if (row.status === "ERROR") {
      dbRows.push({ rowNumber: row.rowNumber, resolution: "ERROR", naturalKey, existsInDb: false, errors, warnings, dependencyChecks: [] });
      continue;
    }

    // Dep: producto
    const product = productMap.get(code);
    deps.push({
      dependencyType: "product",
      lookupField:    "product_code",
      lookupValue:    code,
      found:          !!product,
      foundId:        product?.id,
      message:        product ? undefined : `Producto con código "${code}" no existe en la base destino.`,
    });
    if (!product) errors.push({ code: "MISSING_DEPENDENCY", field: "product_code", message: `Producto "${code}" no encontrado.` });

    // Dep: ubicación (Branch) — resuelta contra Branch.name, con detección de ambigüedad
    const branchMatches = branchesByName.get(normalizeKey(locationName)) ?? [];
    const branch = branchMatches.length === 1 ? branchMatches[0] : undefined;

    if (branchMatches.length === 0) {
      deps.push({
        dependencyType: "location", lookupField: "location_name", lookupValue: locationName,
        found: false, message: `Sucursal "${locationName}" no existe en la base destino.`,
      });
      errors.push({ code: "MISSING_DEPENDENCY", field: "location_name", message: `Sucursal "${locationName}" no encontrada.` });
    } else if (branchMatches.length > 1) {
      deps.push({
        dependencyType: "location", lookupField: "location_name", lookupValue: locationName,
        found: false, message: `Sucursal "${locationName}" es ambigua: existen ${branchMatches.length} sucursales con ese nombre.`,
      });
      errors.push({ code: "AMBIGUOUS_DEPENDENCY", field: "location_name", message: `Sucursal "${locationName}" ambigua (${branchMatches.length} coincidencias).` });
    } else {
      deps.push({
        dependencyType: "location", lookupField: "location_name", lookupValue: locationName,
        found: true, foundId: branch!.id,
      });
    }

    if (!product || !branch) {
      dbRows.push({ rowNumber: row.rowNumber, resolution: "ERROR", naturalKey, existsInDb: false, errors, warnings, dependencyChecks: deps });
      continue;
    }

    // Bloqueo: producto debe ser PRODUCT, is_stockable=true y status=ACTIVE
    if (product.product_type !== "PRODUCT") {
      errors.push({ code: "INVALID_PRODUCT_TYPE", field: "product_code", message: `Producto "${code}" es de tipo ${product.product_type}. Solo se permite inventario inicial para PRODUCT.` });
    }
    if (!product.is_stockable) {
      errors.push({ code: "NOT_STOCKABLE", field: "product_code", message: `Producto "${code}" tiene is_stockable=false. El inventario inicial no aplica.` });
    }
    if (product.status !== "ACTIVE") {
      errors.push({ code: "PRODUCT_NOT_ACTIVE", field: "product_code", message: `Producto "${code}" tiene status=${product.status}. Solo se permite inventario inicial para productos ACTIVE.` });
    }

    if (product.product_type !== "PRODUCT" || !product.is_stockable || product.status !== "ACTIVE") {
      dbRows.push({ rowNumber: row.rowNumber, resolution: "ERROR", naturalKey, existsInDb: false, errors, warnings, dependencyChecks: deps });
      continue;
    }

    const plKey = `${product.id}::${branch.id}`;

    // ERROR: ya existe ProductLocation (stock ya inicializado)
    if (plMap.has(plKey)) {
      errors.push({ code: "PRODUCT_LOCATION_EXISTS", message: `Ya existe un registro de stock para "${code}" en "${locationName}". Usar ajuste de inventario en su lugar.` });
      dbRows.push({ rowNumber: row.rowNumber, resolution: "ERROR", naturalKey, existsInDb: true, errors, warnings, dependencyChecks: deps });
      continue;
    }

    // ERROR: ya hay movimiento INITIAL_LOAD previo
    if (initMoveMap.has(plKey)) {
      errors.push({ code: "INITIAL_LOAD_EXISTS", message: `Ya existe un movimiento INITIAL_LOAD para "${code}" en "${locationName}". No se puede duplicar inventario inicial.` });
      dbRows.push({ rowNumber: row.rowNumber, resolution: "ERROR", naturalKey, existsInDb: false, errors, warnings, dependencyChecks: deps });
      continue;
    }

    const policy = applyImportPolicy(importPolicy, false, naturalKey);
    errors.push(...policy.errors);
    warnings.push(...policy.warnings);

    dbRows.push({ rowNumber: row.rowNumber, resolution: policy.resolution, naturalKey, existsInDb: false, errors, warnings, dependencyChecks: deps });
  }

  const summary = buildSummaryFromRows(dbRows);
  return { datasetKey: "inventory_initial", importPolicy, status: buildStatus(summary), summary, rows: dbRows };
}
