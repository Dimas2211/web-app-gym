// ─────────────────────────────────────────────────────────────────
// platform — lines-import-runner.ts
//
// E1C-B: Runner SERVER-ONLY para importar líneas de productos desde un
// preview ya validado contra la base de datos cliente destino.
//
// Garantías:
// - Solo escribe en product_lines.
// - No actualiza, no elimina, no hace upsert.
// - No toca categorías, sublíneas, productos, clientes, proveedores,
//   ventas, DTE, inventario ni ninguna otra tabla.
// - Política fija: CREATE_ONLY.
// - category_id se resuelve a partir del dependencyCheck ya calculado
//   por el analizador DB-aware (no se re-consulta la categoría).
// - Genera código determinístico desde name.
// - Verifica colisión de código dentro de la misma categoría antes de crear
//   (unique real: category_id + code).
// - Si cualquier fila falla la validación previa → bloquea todo.
// - Dry-run: sin escrituras — solo análisis y retorno de conteos.
// - Real run: dentro de $transaction — atómico.
// - Siempre $disconnect() gestionado desde la action vía withTemporaryPrismaClient.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[lines-import-runner] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { PrismaClient } from "@prisma/client";
import type {
  DataOnboardingPreviewResult,
  DataOnboardingDbAwarePreviewResult,
  LinesImportRowResult,
  LinesImportDryRunResult,
  LinesImportResult,
} from "../../../types/platform.types";

// ── Status válidos para importación ──────────────────────────────
// "deleted" está excluido deliberadamente en E1C-B por seguridad.

const VALID_IMPORT_STATUSES = new Set(["active", "inactive", "suspended"]);

// ── Generación determinística de código (idéntica a categories) ───

export function generateLineCode(name: string): string {
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

  return raw || "LIN";
}

// ── Helpers ───────────────────────────────────────────────────────

function strVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

// ── Input del runner ──────────────────────────────────────────────

export interface LinesImportRunnerInput {
  parsedPreview: DataOnboardingPreviewResult;
  dbAwareResult: DataOnboardingDbAwarePreviewResult;
  prismaClient:  PrismaClient;
  tenantId:      string;
  isDryRun:      boolean;
}

// ── Runner principal ──────────────────────────────────────────────

export async function runLinesImport(
  input: LinesImportRunnerInput,
): Promise<LinesImportResult | LinesImportDryRunResult> {
  const { parsedPreview, dbAwareResult, prismaClient, tenantId, isDryRun } = input;

  // ── 1. Reunir solo las filas que el DB-aware marcó como CREATE ─
  const createRows = dbAwareResult.rows.filter((r) => r.resolution === "CREATE");

  interface RowToCreate {
    rowNumber:    number;
    name:         string;
    categoryName: string;
    categoryId:   string;
    code:         string;
    status:       string;
    valid:        true;
  }

  interface RowBlocked {
    rowNumber:    number;
    name:         string;
    categoryName: string;
    code:         string;
    reason:       string;
    valid:        false;
  }

  type PreparedRow = RowToCreate | RowBlocked;

  const prepared: PreparedRow[] = createRows.map((dbRow) => {
    const parsedRow    = parsedPreview.rows.find((r) => r.rowNumber === dbRow.rowNumber);
    const name         = strVal(parsedRow?.data.name ?? "");
    const categoryName = strVal(parsedRow?.data.category_name ?? "");

    // category_id ya fue resuelto por el analizador DB-aware (dependencyChecks)
    const catDep = dbRow.dependencyChecks.find((d) => d.dependencyType === "category");
    const categoryId = catDep?.foundId;

    if (!categoryId) {
      return {
        rowNumber: dbRow.rowNumber, name, categoryName, code: "",
        reason: `Categoría "${categoryName}" no resuelta. La fila debió bloquearse en el análisis DB-aware.`,
        valid: false,
      };
    }

    const code = generateLineCode(name);

    if (!name) {
      return { rowNumber: dbRow.rowNumber, name, categoryName, code, reason: "Nombre vacío — no se puede generar código.", valid: false };
    }

    const rawStatus = strVal(parsedRow?.data.status ?? "");
    const status     = rawStatus === "" ? "active" : rawStatus.toLowerCase();

    if (rawStatus !== "" && !VALID_IMPORT_STATUSES.has(status)) {
      return {
        rowNumber: dbRow.rowNumber,
        name,
        categoryName,
        code,
        reason: `Status '${rawStatus}' no es válido para importación. Valores aceptados: active, inactive, suspended.`,
        valid:  false,
      };
    }

    return { rowNumber: dbRow.rowNumber, name, categoryName, categoryId, code, status, valid: true };
  });

  const blocked  = prepared.filter((r) => !r.valid) as RowBlocked[];
  const toCreate = prepared.filter((r): r is RowToCreate => r.valid);

  // ── 2. Verificar colisión de código entre filas del Excel (por categoría) ─
  const codesSeen = new Map<string, number>(); // `${categoryId}::${code}` → rowNumber
  const duplicatesInFile: RowBlocked[] = [];

  for (const row of toCreate) {
    const key = `${row.categoryId}::${row.code}`;
    if (codesSeen.has(key)) {
      duplicatesInFile.push({
        rowNumber:    row.rowNumber,
        name:         row.name,
        categoryName: row.categoryName,
        code:         row.code,
        reason:       `Código '${row.code}' generado ya existe en otra fila del archivo dentro de la misma categoría (fila ${codesSeen.get(key)}).`,
        valid:        false,
      });
    } else {
      codesSeen.set(key, row.rowNumber);
    }
  }

  const allBlocked = [...blocked, ...duplicatesInFile];

  // ── 3. Si hay cualquier fila bloqueada → abortar todo (sin import parcial) ─

  if (allBlocked.length > 0) {
    const allRowResults: LinesImportRowResult[] = [
      ...toCreate
        .filter((r) => !duplicatesInFile.find((d) => d.rowNumber === r.rowNumber))
        .map((r) => ({ rowNumber: r.rowNumber, name: r.name, categoryName: r.categoryName, code: r.code, resolution: "SKIPPED" as const, reason: "Bloqueado por otras filas con error." })),
      ...allBlocked.map((r) => ({ rowNumber: r.rowNumber, name: r.name, categoryName: r.categoryName, code: r.code, resolution: "ERROR" as const, reason: r.reason })),
    ].sort((a, b) => a.rowNumber - b.rowNumber);

    if (isDryRun) {
      return {
        wouldCreate: 0,
        blocked:     allBlocked.length,
        totalRows:   dbAwareResult.rows.length,
        rows:        allRowResults,
      } satisfies LinesImportDryRunResult;
    }

    throw new Error(
      `Importación bloqueada: ${allBlocked.length} fila(s) con error. ` +
      "E1C-B no permite importación parcial. Corrija el archivo e intente de nuevo.",
    );
  }

  // ── 4. Verificar colisión de código contra la base destino ─────
  const categoryIds = Array.from(new Set(toCreate.map((r) => r.categoryId)));
  const codes       = Array.from(new Set(toCreate.map((r) => r.code)));

  const existingLines = (categoryIds.length > 0 && codes.length > 0)
    ? await prismaClient.productLine.findMany({
        where:  { tenant_id: tenantId, category_id: { in: categoryIds }, code: { in: codes } },
        select: { category_id: true, code: true },
      })
    : [];

  const existingKeySet = new Set(existingLines.map((l) => `${l.category_id}::${l.code}`));
  const codeClashes = toCreate.filter((r) => existingKeySet.has(`${r.categoryId}::${r.code}`));

  if (codeClashes.length > 0) {
    const clashList = codeClashes.map((r) => `'${r.code}' en categoría "${r.categoryName}" (fila ${r.rowNumber})`).join(", ");
    if (isDryRun) {
      const rowResults: LinesImportRowResult[] = toCreate.map((r) =>
        existingKeySet.has(`${r.categoryId}::${r.code}`)
          ? { rowNumber: r.rowNumber, name: r.name, categoryName: r.categoryName, code: r.code, resolution: "ERROR", reason: `Código '${r.code}' ya existe en esa categoría en la base destino.` }
          : { rowNumber: r.rowNumber, name: r.name, categoryName: r.categoryName, code: r.code, resolution: "SKIPPED", reason: "Bloqueado por choque de código en otra fila." }
      );
      return {
        wouldCreate: 0,
        blocked:     codeClashes.length,
        totalRows:   dbAwareResult.rows.length,
        rows:        rowResults,
      } satisfies LinesImportDryRunResult;
    }
    throw new Error(
      `Colisión de código en la base destino: ${clashList}. ` +
      "El código generado ya está en uso por otra línea dentro de la misma categoría. " +
      "Revise los nombres en el Excel para que generen códigos únicos.",
    );
  }

  // ── 5. Dry-run limpio → retornar conteo sin escribir ──────────

  if (isDryRun) {
    const rowResults: LinesImportRowResult[] = toCreate.map((r) => ({
      rowNumber:    r.rowNumber,
      name:         r.name,
      categoryName: r.categoryName,
      code:         r.code,
      resolution:   "CREATED" as const,
    }));

    return {
      wouldCreate: toCreate.length,
      blocked:     0,
      totalRows:   dbAwareResult.rows.length,
      rows:        rowResults,
    } satisfies LinesImportDryRunResult;
  }

  // ── 6. EXECUTE: transacción ───────────────────────────────────

  const now = new Date();

  await prismaClient.$transaction(async (tx) => {
    for (const row of toCreate) {
      await tx.productLine.create({
        data: {
          tenant_id:   tenantId,
          category_id: row.categoryId,
          code:        row.code,
          name:        row.name,
          status:      row.status as "active" | "inactive" | "suspended" | "deleted",
          created_at:  now,
          updated_at:  now,
        },
      });
    }
  });

  const rowResults: LinesImportRowResult[] = toCreate.map((r) => ({
    rowNumber:    r.rowNumber,
    name:         r.name,
    categoryName: r.categoryName,
    code:         r.code,
    resolution:   "CREATED" as const,
  }));

  return {
    created:      toCreate.length,
    skipped:      0,
    errors:       0,
    totalRows:    dbAwareResult.rows.length,
    importPolicy: "CREATE_ONLY",
    datasetKey:   "lines",
    rows:         rowResults,
  } satisfies LinesImportResult;
}
