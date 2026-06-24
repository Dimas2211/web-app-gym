// ─────────────────────────────────────────────────────────────────
// platform — categories-import-runner.ts
//
// E1C-A: Runner SERVER-ONLY para importar categorías desde un preview
// ya validado contra la base de datos cliente destino.
//
// Garantías:
// - Solo escribe en product_categories.
// - No actualiza, no elimina, no hace upsert.
// - No toca productos, líneas, sublíneas, clientes, proveedores,
//   ventas, DTE, inventario ni ninguna otra tabla.
// - Política fija: CREATE_ONLY.
// - Genera código determinístico desde name.
// - Verifica colisión de código antes de crear.
// - Si cualquier fila falla la validación previa → bloquea todo.
// - Dry-run: sin escrituras — solo análisis y retorno de conteos.
// - Real run: dentro de $transaction — atómico.
// - Siempre $disconnect() gestionado desde la action vía withTemporaryPrismaClient.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[categories-import-runner] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { PrismaClient } from "@prisma/client";
import type {
  DataOnboardingPreviewResult,
  DataOnboardingDbAwarePreviewResult,
  CategoriesImportRowResult,
  CategoriesImportDryRunResult,
  CategoriesImportResult,
} from "../../../types/platform.types";

// ── Status válidos para importación ──────────────────────────────

const VALID_IMPORT_STATUSES = new Set(["active", "inactive", "suspended"]);

// "deleted" está excluido deliberadamente en E1C-A por seguridad.
// No se permite importar categorías con status=deleted desde Excel.

// ── Generación determinística de código ──────────────────────────
//
// Algoritmo:
// 1. Normalizar NFD → quitar diacríticos
// 2. Uppercase
// 3. Mantener solo A-Z, 0-9 y espacios
// 4. Espacios → _
// 5. Colapsar underscores múltiples
// 6. Recortar _ inicial/final
// 7. Truncar a 50 chars
// 8. Si vacío → usar "CAT"

export function generateCategoryCode(name: string): string {
  const raw = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);

  return raw || "CAT";
}

// ── Helpers ───────────────────────────────────────────────────────

function strVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

// ── Input del runner ──────────────────────────────────────────────

export interface CategoriesImportRunnerInput {
  parsedPreview: DataOnboardingPreviewResult;
  dbAwareResult: DataOnboardingDbAwarePreviewResult;
  prismaClient:  PrismaClient;
  tenantId:      string;
  isDryRun:      boolean;
}

// ── Runner principal ──────────────────────────────────────────────

export async function runCategoriesImport(
  input: CategoriesImportRunnerInput,
): Promise<CategoriesImportResult | CategoriesImportDryRunResult> {
  const { parsedPreview, dbAwareResult, prismaClient, tenantId, isDryRun } = input;

  // ── 1. Reunir solo las filas que el DB-aware marcó como CREATE ─
  const createRows = dbAwareResult.rows.filter((r) => r.resolution === "CREATE");

  // ── 2. Mapear a datos de creación con validación de status ─────

  interface RowToCreate {
    rowNumber: number;
    name:      string;
    code:      string;
    status:    string;
    desc:      string | null;
    valid:     true;
  }

  interface RowBlocked {
    rowNumber: number;
    name:      string;
    code:      string;
    reason:    string;
    valid:     false;
  }

  type PreparedRow = RowToCreate | RowBlocked;

  const prepared: PreparedRow[] = createRows.map((dbRow) => {
    const parsedRow = parsedPreview.rows.find((r) => r.rowNumber === dbRow.rowNumber);
    const name = strVal(parsedRow?.data.name ?? dbRow.naturalKey);
    const code = generateCategoryCode(name);

    if (!code || code === "CAT") {
      // "CAT" fallback solo si el nombre queda vacío tras normalizar
      if (!name) {
        return { rowNumber: dbRow.rowNumber, name, code, reason: "Nombre vacío — no se puede generar código.", valid: false };
      }
    }

    // Validar status
    const rawStatus = strVal(parsedRow?.data.status ?? "");
    const status    = rawStatus === "" ? "active" : rawStatus.toLowerCase();

    if (rawStatus !== "" && !VALID_IMPORT_STATUSES.has(status)) {
      return {
        rowNumber: dbRow.rowNumber,
        name,
        code,
        reason: `Status '${rawStatus}' no es válido para importación. Valores aceptados: active, inactive, suspended.`,
        valid:   false,
      };
    }

    const desc = strVal(parsedRow?.data.description ?? "") || null;

    return { rowNumber: dbRow.rowNumber, name, code, status, desc, valid: true };
  });

  const blocked = prepared.filter((r) => !r.valid) as RowBlocked[];
  const toCreate = prepared.filter((r): r is RowToCreate => r.valid);

  // ── 3. Verificar colisión de código entre filas del Excel ──────
  const codesSeen = new Map<string, number>(); // code → rowNumber del primer registro
  const duplicatesInFile: RowBlocked[] = [];

  for (const row of toCreate) {
    if (codesSeen.has(row.code)) {
      duplicatesInFile.push({
        rowNumber: row.rowNumber,
        name:      row.name,
        code:      row.code,
        reason:    `Código '${row.code}' generado ya existe en otra fila del archivo (fila ${codesSeen.get(row.code)}).`,
        valid:     false,
      });
    } else {
      codesSeen.set(row.code, row.rowNumber);
    }
  }

  const allBlocked = [...blocked, ...duplicatesInFile];

  // ── 4. Si hay cualquier fila bloqueada → abortar todo ─────────
  // E1C-A no permite importación parcial.

  if (allBlocked.length > 0) {
    const allRowResults: CategoriesImportRowResult[] = [
      ...toCreate
        .filter((r) => !duplicatesInFile.find((d) => d.rowNumber === r.rowNumber))
        .map((r) => ({ rowNumber: r.rowNumber, name: r.name, code: r.code, resolution: "SKIPPED" as const, reason: "Bloqueado por otras filas con error." })),
      ...allBlocked.map((r) => ({ rowNumber: r.rowNumber, name: r.name, code: r.code, resolution: "ERROR" as const, reason: r.reason })),
    ].sort((a, b) => a.rowNumber - b.rowNumber);

    if (isDryRun) {
      return {
        wouldCreate: 0,
        blocked:     allBlocked.length,
        totalRows:   dbAwareResult.rows.length,
        rows:        allRowResults,
      } satisfies CategoriesImportDryRunResult;
    }

    throw new Error(
      `Importación bloqueada: ${allBlocked.length} fila(s) con error. ` +
      "E1C-A no permite importación parcial. Corrija el archivo e intente de nuevo.",
    );
  }

  // ── 5. Verificar colisión de código contra la base destino ─────
  const codesToCheck = toCreate.map((r) => r.code);

  const existingCodes = codesToCheck.length > 0
    ? await prismaClient.productCategory.findMany({
        where:  { tenant_id: tenantId, code: { in: codesToCheck } },
        select: { code: true },
      })
    : [];

  const existingCodeSet = new Set(existingCodes.map((c) => c.code));
  const codeClashes = toCreate.filter((r) => existingCodeSet.has(r.code));

  if (codeClashes.length > 0) {
    const clashList = codeClashes.map((r) => `'${r.code}' (fila ${r.rowNumber})`).join(", ");
    if (isDryRun) {
      const rowResults: CategoriesImportRowResult[] = toCreate.map((r) =>
        existingCodeSet.has(r.code)
          ? { rowNumber: r.rowNumber, name: r.name, code: r.code, resolution: "ERROR", reason: `Código '${r.code}' ya existe en la base destino con el mismo tenant.` }
          : { rowNumber: r.rowNumber, name: r.name, code: r.code, resolution: "SKIPPED", reason: "Bloqueado por choque de código en otra fila." }
      );
      return {
        wouldCreate: 0,
        blocked:     codeClashes.length,
        totalRows:   dbAwareResult.rows.length,
        rows:        rowResults,
      } satisfies CategoriesImportDryRunResult;
    }
    throw new Error(
      `Colisión de código en la base destino: ${clashList}. ` +
      "El código generado ya está en uso por otra categoría del mismo tenant. " +
      "Revise los nombres en el Excel para que generen códigos únicos.",
    );
  }

  // ── 6. Dry-run limpio → retornar conteo sin escribir ──────────

  if (isDryRun) {
    const rowResults: CategoriesImportRowResult[] = toCreate.map((r) => ({
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
    } satisfies CategoriesImportDryRunResult;
  }

  // ── 7. EXECUTE: transacción ───────────────────────────────────

  const now = new Date();

  await prismaClient.$transaction(async (tx) => {
    for (const row of toCreate) {
      await tx.productCategory.create({
        data: {
          tenant_id:   tenantId,
          code:        row.code,
          name:        row.name,
          description: row.desc,
          status:      row.status as "active" | "inactive" | "suspended" | "deleted",
          created_at:  now,
          updated_at:  now,
        },
      });
    }
  });

  const rowResults: CategoriesImportRowResult[] = toCreate.map((r) => ({
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
    datasetKey:   "categories",
    rows:         rowResults,
  } satisfies CategoriesImportResult;
}
