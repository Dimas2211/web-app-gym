// ─────────────────────────────────────────────────────────────────
// platform — products-import-runner.ts
//
// E1C-D: Runner SERVER-ONLY para importar productos desde un preview
// ya validado contra la base de datos cliente destino.
//
// Garantías:
// - Solo escribe en products.
// - No crea inventario inicial, ni movimientos de inventario, ni stock.
// - No actualiza, no elimina, no hace upsert.
// - No toca categorías, líneas, sublíneas, unidades, impuestos,
//   proveedores, clientes, ventas, compras, DTE ni caja.
// - Política fija: CREATE_ONLY.
// - Llave natural: product_code (único por tenant). No se autogenera.
// - category_id, unit_id son requeridos; line_id, subline_id,
//   tax_rate_id, supplier_id son opcionales — todos ya fueron
//   resueltos y validados (incluida la jerarquía categoría/línea/
//   sublínea) por el analizador DB-aware (dependencyChecks). Este
//   runner no vuelve a resolver ambigüedad, solo usa foundId.
// - Revalida product_type, status y booleanos por seguridad (el
//   parser ya bloquea filas inválidas, pero el análisis DB-aware no
//   bloquea 'status' inválido — solo advierte). 'status' fuera del
//   catálogo permitido (incluye cualquier equivalente a "deleted")
//   bloquea la fila.
// - Si cualquier fila falla la validación previa → bloquea todo.
// - Dry-run: sin escrituras — solo análisis y retorno de conteos.
// - Real run: dentro de $transaction — atómico.
// - Siempre $disconnect() gestionado desde la action vía withTemporaryPrismaClient.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[products-import-runner] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { PrismaClient } from "@prisma/client";
import type {
  DataOnboardingPreviewResult,
  DataOnboardingDbAwarePreviewResult,
  ProductsImportRowResult,
  ProductsImportDryRunResult,
  ProductsImportResult,
} from "../../../types/platform.types";

// ── Valores válidos para importación (deliberadamente sin BLOCKED_PURCHASE / BLOCKED_SALE / deleted) ─

const VALID_IMPORT_STATUSES = new Set(["ACTIVE", "INACTIVE", "DISCONTINUED"]);
const VALID_PRODUCT_TYPES   = new Set(["PRODUCT", "SERVICE"]);
const TRUE_VALUES  = new Set(["true", "1", "si", "sí", "yes"]);

// ── Helpers ───────────────────────────────────────────────────────

function strVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function isEmpty(v: unknown): boolean {
  return strVal(v) === "";
}

function toBoolean(v: unknown): boolean {
  return TRUE_VALUES.has(strVal(v).toLowerCase());
}

function toDecimalOrNull(v: unknown): number | null {
  if (isEmpty(v)) return null;
  const n = Number(strVal(v).replace(",", "."));
  return isNaN(n) ? null : n;
}

// ── Input del runner ──────────────────────────────────────────────

export interface ProductsImportRunnerInput {
  parsedPreview: DataOnboardingPreviewResult;
  dbAwareResult: DataOnboardingDbAwarePreviewResult;
  prismaClient:  PrismaClient;
  tenantId:      string;
  isDryRun:      boolean;
}

// ── Runner principal ──────────────────────────────────────────────

export async function runProductsImport(
  input: ProductsImportRunnerInput,
): Promise<ProductsImportResult | ProductsImportDryRunResult> {
  const { parsedPreview, dbAwareResult, prismaClient, tenantId, isDryRun } = input;

  // ── 1. Reunir solo las filas que el DB-aware marcó como CREATE ─
  const createRows = dbAwareResult.rows.filter((r) => r.resolution === "CREATE");

  interface RowToCreate {
    rowNumber:     number;
    code:          string;
    name:          string;
    description:   string | null;
    productType:   "PRODUCT" | "SERVICE";
    status:        "ACTIVE" | "INACTIVE" | "DISCONTINUED";
    isStockable:   boolean;
    allowPurchase: boolean;
    allowSale:     boolean;
    categoryId:    string;
    lineId:        string | null;
    sublineId:     string | null;
    brand:         string | null;
    unitId:        string;
    packageUnit:   string | null;
    supplierId:    string | null;
    sku:           string | null;
    costPrice:     number | null;
    salePrice:     number | null;
    taxRateId:     string | null;
    valid:         true;
  }

  interface RowBlocked {
    rowNumber: number;
    code:      string;
    name:      string;
    reason:    string;
    valid:     false;
  }

  type PreparedRow = RowToCreate | RowBlocked;

  const prepared: PreparedRow[] = createRows.map((dbRow) => {
    const parsedRow = parsedPreview.rows.find((r) => r.rowNumber === dbRow.rowNumber);
    const code = strVal(parsedRow?.data.product_code ?? "").toUpperCase();
    const name = strVal(parsedRow?.data.name ?? "");

    if (!code) {
      return { rowNumber: dbRow.rowNumber, code: "", name, reason: "product_code vacío.", valid: false };
    }
    if (!name) {
      return { rowNumber: dbRow.rowNumber, code, name, reason: "Nombre vacío.", valid: false };
    }

    const findDep = (type: string) => dbRow.dependencyChecks.find((d) => d.dependencyType === type);

    const categoryId = findDep("category")?.foundId;
    if (!categoryId) {
      return { rowNumber: dbRow.rowNumber, code, name, reason: "Categoría no resuelta. La fila debió bloquearse en el análisis DB-aware.", valid: false };
    }

    const unitId = findDep("unit_of_measure")?.foundId;
    if (!unitId) {
      return { rowNumber: dbRow.rowNumber, code, name, reason: "Unidad de medida no resuelta. La fila debió bloquearse en el análisis DB-aware.", valid: false };
    }

    const lineId     = findDep("line")?.foundId ?? null;
    const sublineId  = findDep("subline")?.foundId ?? null;
    const taxRateId  = findDep("tax_rate")?.foundId ?? null;
    const supplierId = findDep("supplier")?.foundId ?? null;

    const productType = strVal(parsedRow?.data.product_type ?? "").toUpperCase();
    if (!VALID_PRODUCT_TYPES.has(productType)) {
      return { rowNumber: dbRow.rowNumber, code, name, reason: `product_type '${productType}' inválido. Permitidos: PRODUCT, SERVICE.`, valid: false };
    }

    const rawStatus = strVal(parsedRow?.data.status ?? "");
    const status     = rawStatus === "" ? "ACTIVE" : rawStatus.toUpperCase();
    if (!VALID_IMPORT_STATUSES.has(status)) {
      return {
        rowNumber: dbRow.rowNumber, code, name,
        reason: `Status '${rawStatus}' no es válido para importación. Valores aceptados: ACTIVE, INACTIVE, DISCONTINUED.`,
        valid: false,
      };
    }

    const costPrice = toDecimalOrNull(parsedRow?.data.cost_price);
    if (costPrice !== null && costPrice < 0) {
      return { rowNumber: dbRow.rowNumber, code, name, reason: "cost_price no puede ser negativo.", valid: false };
    }
    const salePrice = toDecimalOrNull(parsedRow?.data.sale_price);
    if (salePrice !== null && salePrice < 0) {
      return { rowNumber: dbRow.rowNumber, code, name, reason: "sale_price no puede ser negativo.", valid: false };
    }

    return {
      rowNumber:     dbRow.rowNumber,
      code,
      name,
      description:   strVal(parsedRow?.data.description ?? "") || null,
      productType:   productType as "PRODUCT" | "SERVICE",
      status:        status as "ACTIVE" | "INACTIVE" | "DISCONTINUED",
      isStockable:   toBoolean(parsedRow?.data.is_stockable),
      allowPurchase: toBoolean(parsedRow?.data.allow_purchase),
      allowSale:     toBoolean(parsedRow?.data.allow_sale),
      categoryId,
      lineId,
      sublineId,
      brand:         strVal(parsedRow?.data.brand ?? "") || null,
      unitId,
      packageUnit:   strVal(parsedRow?.data.package_unit ?? "") || null,
      supplierId,
      sku:           strVal(parsedRow?.data.sku ?? "") || null,
      costPrice,
      salePrice,
      taxRateId,
      valid: true,
    };
  });

  const blocked  = prepared.filter((r) => !r.valid) as RowBlocked[];
  const toCreate = prepared.filter((r): r is RowToCreate => r.valid);

  // ── 2. Verificar duplicados de product_code dentro del archivo ─
  const codesSeen = new Map<string, number>();
  const duplicatesInFile: RowBlocked[] = [];

  for (const row of toCreate) {
    if (codesSeen.has(row.code)) {
      duplicatesInFile.push({
        rowNumber: row.rowNumber,
        code:      row.code,
        name:      row.name,
        reason:    `product_code '${row.code}' ya aparece en otra fila del archivo (fila ${codesSeen.get(row.code)}).`,
        valid:     false,
      });
    } else {
      codesSeen.set(row.code, row.rowNumber);
    }
  }

  const blockedRowNumbers = new Set([
    ...blocked.map((b) => b.rowNumber),
    ...duplicatesInFile.map((b) => b.rowNumber),
  ]);
  const allBlocked = [...blocked, ...duplicatesInFile];

  // ── 3. Si hay cualquier fila bloqueada → abortar todo (sin import parcial) ─

  if (allBlocked.length > 0) {
    const allRowResults: ProductsImportRowResult[] = [
      ...toCreate
        .filter((r) => !blockedRowNumbers.has(r.rowNumber))
        .map((r) => ({ rowNumber: r.rowNumber, name: r.name, code: r.code, resolution: "SKIPPED" as const, reason: "Bloqueado por otras filas con error." })),
      ...allBlocked.map((r) => ({ rowNumber: r.rowNumber, name: r.name, code: r.code, resolution: "ERROR" as const, reason: r.reason })),
    ].sort((a, b) => a.rowNumber - b.rowNumber);

    if (isDryRun) {
      return {
        wouldCreate: 0,
        blocked:     allBlocked.length,
        totalRows:   dbAwareResult.rows.length,
        rows:        allRowResults,
      } satisfies ProductsImportDryRunResult;
    }

    throw new Error(
      `Importación bloqueada: ${allBlocked.length} fila(s) con error. ` +
      "E1C-D no permite importación parcial. Corrija el archivo e intente de nuevo.",
    );
  }

  // ── 4. Verificar colisión de product_code contra la base destino ─
  const codes = Array.from(new Set(toCreate.map((r) => r.code)));
  const existingProducts = codes.length > 0
    ? await prismaClient.product.findMany({
        where:  { tenant_id: tenantId, product_code: { in: codes } },
        select: { product_code: true },
      })
    : [];
  const existingCodeSet = new Set(existingProducts.map((p) => p.product_code.toUpperCase()));
  const codeClashes = toCreate.filter((r) => existingCodeSet.has(r.code));

  if (codeClashes.length > 0) {
    const clashList = codeClashes.map((r) => `'${r.code}' (fila ${r.rowNumber})`).join(", ");
    if (isDryRun) {
      const rowResults: ProductsImportRowResult[] = toCreate.map((r) =>
        existingCodeSet.has(r.code)
          ? { rowNumber: r.rowNumber, name: r.name, code: r.code, resolution: "ERROR", reason: `product_code '${r.code}' ya existe en la base destino.` }
          : { rowNumber: r.rowNumber, name: r.name, code: r.code, resolution: "SKIPPED", reason: "Bloqueado por choque de código en otra fila." }
      );
      return {
        wouldCreate: 0,
        blocked:     codeClashes.length,
        totalRows:   dbAwareResult.rows.length,
        rows:        rowResults,
      } satisfies ProductsImportDryRunResult;
    }
    throw new Error(
      `Colisión de product_code en la base destino: ${clashList}. ` +
      "Política CREATE_ONLY no permite sobrescribir productos existentes.",
    );
  }

  // ── 5. Dry-run limpio → retornar conteo sin escribir ──────────

  if (isDryRun) {
    const rowResults: ProductsImportRowResult[] = toCreate.map((r) => ({
      rowNumber:  r.rowNumber,
      name:       r.name,
      code:       r.code,
      resolution: "CREATED" as const,
    }));

    return {
      wouldCreate: toCreate.length,
      blocked:     0,
      totalRows:   dbAwareResult.rows.length,
      rows:        rowResults,
    } satisfies ProductsImportDryRunResult;
  }

  // ── 6. EXECUTE: transacción — solo escribe en products ────────

  const now = new Date();

  await prismaClient.$transaction(async (tx) => {
    for (const row of toCreate) {
      await tx.product.create({
        data: {
          tenant_id:      tenantId,
          product_code:   row.code,
          name:           row.name,
          description:    row.description,
          product_type:   row.productType,
          status:         row.status,
          is_stockable:   row.isStockable,
          allow_purchase: row.allowPurchase,
          allow_sale:     row.allowSale,
          category_id:    row.categoryId,
          line_id:        row.lineId,
          subline_id:     row.sublineId,
          brand:          row.brand,
          unit_id:        row.unitId,
          package_unit:   row.packageUnit,
          supplier_id:    row.supplierId,
          sku:            row.sku,
          cost_price:     row.costPrice,
          sale_price:     row.salePrice,
          tax_rate_id:    row.taxRateId,
          created_at:     now,
          updated_at:     now,
        },
      });
    }
  });

  const rowResults: ProductsImportRowResult[] = toCreate.map((r) => ({
    rowNumber:  r.rowNumber,
    name:       r.name,
    code:       r.code,
    resolution: "CREATED" as const,
  }));

  return {
    created:      toCreate.length,
    skipped:      0,
    errors:       0,
    totalRows:    dbAwareResult.rows.length,
    importPolicy: "CREATE_ONLY",
    datasetKey:   "products",
    rows:         rowResults,
  } satisfies ProductsImportResult;
}
