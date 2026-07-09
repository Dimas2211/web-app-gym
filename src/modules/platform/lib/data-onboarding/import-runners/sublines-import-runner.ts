// ─────────────────────────────────────────────────────────────────
// platform — sublines-import-runner.ts
//
// E1C-B: Runner SERVER-ONLY para importar sublíneas de productos desde un
// preview ya validado contra la base de datos cliente destino.
//
// Garantías:
// - Solo escribe en product_sublines.
// - No actualiza, no elimina, no hace upsert.
// - No toca categorías, líneas, productos, clientes, proveedores,
//   ventas, DTE, inventario ni ninguna otra tabla.
// - Política fija: CREATE_ONLY.
// - line_id se resuelve a partir del dependencyCheck ya calculado
//   por el analizador DB-aware (no se re-resuelve ambigüedad aquí).
// - Genera código determinístico desde name.
// - Verifica colisión de código dentro de la misma línea antes de crear
//   (unique real: line_id + code).
// - Si cualquier fila falla la validación previa → bloquea todo.
// - Dry-run: sin escrituras — solo análisis y retorno de conteos.
// - Real run: dentro de $transaction — atómico.
// - Siempre $disconnect() gestionado desde la action vía withTemporaryPrismaClient.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[sublines-import-runner] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { PrismaClient } from "@prisma/client";
import type {
  DataOnboardingPreviewResult,
  DataOnboardingDbAwarePreviewResult,
  SublinesImportRowResult,
  SublinesImportDryRunResult,
  SublinesImportResult,
} from "../../../types/platform.types";

// ── Status válidos para importación ──────────────────────────────
// "deleted" está excluido deliberadamente en E1C-B por seguridad.

const VALID_IMPORT_STATUSES = new Set(["active", "inactive", "suspended"]);

// ── Generación determinística de código (idéntica a categories/lines) ─

export function generateSublineCode(name: string): string {
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

  return raw || "SUB";
}

// ── Helpers ───────────────────────────────────────────────────────

function strVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

// ── Input del runner ──────────────────────────────────────────────

export interface SublinesImportRunnerInput {
  parsedPreview: DataOnboardingPreviewResult;
  dbAwareResult: DataOnboardingDbAwarePreviewResult;
  prismaClient:  PrismaClient;
  tenantId:      string;
  isDryRun:      boolean;
}

// ── Runner principal ──────────────────────────────────────────────

export async function runSublinesImport(
  input: SublinesImportRunnerInput,
): Promise<SublinesImportResult | SublinesImportDryRunResult> {
  const { parsedPreview, dbAwareResult, prismaClient, tenantId, isDryRun } = input;

  // ── 1. Reunir solo las filas que el DB-aware marcó como CREATE ─
  const createRows = dbAwareResult.rows.filter((r) => r.resolution === "CREATE");

  interface RowToCreate {
    rowNumber: number;
    name:      string;
    lineName:  string;
    lineId:    string;
    code:      string;
    status:    string;
    valid:     true;
  }

  interface RowBlocked {
    rowNumber: number;
    name:      string;
    lineName:  string;
    code:      string;
    reason:    string;
    valid:     false;
  }

  type PreparedRow = RowToCreate | RowBlocked;

  const prepared: PreparedRow[] = createRows.map((dbRow) => {
    const parsedRow = parsedPreview.rows.find((r) => r.rowNumber === dbRow.rowNumber);
    const name       = strVal(parsedRow?.data.name ?? "");
    const lineName   = strVal(parsedRow?.data.line_name ?? "");

    // line_id ya fue resuelto por el analizador DB-aware (dependencyChecks)
    const lineDep = dbRow.dependencyChecks.find((d) => d.dependencyType === "line");
    const lineId  = lineDep?.foundId;

    if (!lineId) {
      return {
        rowNumber: dbRow.rowNumber, name, lineName, code: "",
        reason: `Línea "${lineName}" no resuelta. La fila debió bloquearse en el análisis DB-aware.`,
        valid: false,
      };
    }

    const code = generateSublineCode(name);

    if (!name) {
      return { rowNumber: dbRow.rowNumber, name, lineName, code, reason: "Nombre vacío — no se puede generar código.", valid: false };
    }

    const rawStatus = strVal(parsedRow?.data.status ?? "");
    const status     = rawStatus === "" ? "active" : rawStatus.toLowerCase();

    if (rawStatus !== "" && !VALID_IMPORT_STATUSES.has(status)) {
      return {
        rowNumber: dbRow.rowNumber,
        name,
        lineName,
        code,
        reason: `Status '${rawStatus}' no es válido para importación. Valores aceptados: active, inactive, suspended.`,
        valid:  false,
      };
    }

    return { rowNumber: dbRow.rowNumber, name, lineName, lineId, code, status, valid: true };
  });

  const blocked  = prepared.filter((r) => !r.valid) as RowBlocked[];
  const toCreate = prepared.filter((r): r is RowToCreate => r.valid);

  // ── 2. Verificar colisión de código entre filas del Excel (por línea) ─
  const codesSeen = new Map<string, number>(); // `${lineId}::${code}` → rowNumber
  const duplicatesInFile: RowBlocked[] = [];

  for (const row of toCreate) {
    const key = `${row.lineId}::${row.code}`;
    if (codesSeen.has(key)) {
      duplicatesInFile.push({
        rowNumber: row.rowNumber,
        name:      row.name,
        lineName:  row.lineName,
        code:      row.code,
        reason:    `Código '${row.code}' generado ya existe en otra fila del archivo dentro de la misma línea (fila ${codesSeen.get(key)}).`,
        valid:     false,
      });
    } else {
      codesSeen.set(key, row.rowNumber);
    }
  }

  const allBlocked = [...blocked, ...duplicatesInFile];

  // ── 3. Si hay cualquier fila bloqueada → abortar todo (sin import parcial) ─

  if (allBlocked.length > 0) {
    const allRowResults: SublinesImportRowResult[] = [
      ...toCreate
        .filter((r) => !duplicatesInFile.find((d) => d.rowNumber === r.rowNumber))
        .map((r) => ({ rowNumber: r.rowNumber, name: r.name, lineName: r.lineName, code: r.code, resolution: "SKIPPED" as const, reason: "Bloqueado por otras filas con error." })),
      ...allBlocked.map((r) => ({ rowNumber: r.rowNumber, name: r.name, lineName: r.lineName, code: r.code, resolution: "ERROR" as const, reason: r.reason })),
    ].sort((a, b) => a.rowNumber - b.rowNumber);

    if (isDryRun) {
      return {
        wouldCreate: 0,
        blocked:     allBlocked.length,
        totalRows:   dbAwareResult.rows.length,
        rows:        allRowResults,
      } satisfies SublinesImportDryRunResult;
    }

    throw new Error(
      `Importación bloqueada: ${allBlocked.length} fila(s) con error. ` +
      "E1C-B no permite importación parcial. Corrija el archivo e intente de nuevo.",
    );
  }

  // ── 4. Verificar colisión de código contra la base destino ─────
  const lineIds = Array.from(new Set(toCreate.map((r) => r.lineId)));
  const codes   = Array.from(new Set(toCreate.map((r) => r.code)));

  const existingSublines = (lineIds.length > 0 && codes.length > 0)
    ? await prismaClient.productSubline.findMany({
        where:  { tenant_id: tenantId, line_id: { in: lineIds }, code: { in: codes } },
        select: { line_id: true, code: true },
      })
    : [];

  const existingKeySet = new Set(existingSublines.map((s) => `${s.line_id}::${s.code}`));
  const codeClashes = toCreate.filter((r) => existingKeySet.has(`${r.lineId}::${r.code}`));

  if (codeClashes.length > 0) {
    const clashList = codeClashes.map((r) => `'${r.code}' en línea "${r.lineName}" (fila ${r.rowNumber})`).join(", ");
    if (isDryRun) {
      const rowResults: SublinesImportRowResult[] = toCreate.map((r) =>
        existingKeySet.has(`${r.lineId}::${r.code}`)
          ? { rowNumber: r.rowNumber, name: r.name, lineName: r.lineName, code: r.code, resolution: "ERROR", reason: `Código '${r.code}' ya existe en esa línea en la base destino.` }
          : { rowNumber: r.rowNumber, name: r.name, lineName: r.lineName, code: r.code, resolution: "SKIPPED", reason: "Bloqueado por choque de código en otra fila." }
      );
      return {
        wouldCreate: 0,
        blocked:     codeClashes.length,
        totalRows:   dbAwareResult.rows.length,
        rows:        rowResults,
      } satisfies SublinesImportDryRunResult;
    }
    throw new Error(
      `Colisión de código en la base destino: ${clashList}. ` +
      "El código generado ya está en uso por otra sublínea dentro de la misma línea. " +
      "Revise los nombres en el Excel para que generen códigos únicos.",
    );
  }

  // ── 5. Dry-run limpio → retornar conteo sin escribir ──────────

  if (isDryRun) {
    const rowResults: SublinesImportRowResult[] = toCreate.map((r) => ({
      rowNumber: r.rowNumber,
      name:      r.name,
      lineName:  r.lineName,
      code:      r.code,
      resolution: "CREATED" as const,
    }));

    return {
      wouldCreate: toCreate.length,
      blocked:     0,
      totalRows:   dbAwareResult.rows.length,
      rows:        rowResults,
    } satisfies SublinesImportDryRunResult;
  }

  // ── 6. EXECUTE: transacción ───────────────────────────────────

  const now = new Date();

  await prismaClient.$transaction(async (tx) => {
    for (const row of toCreate) {
      await tx.productSubline.create({
        data: {
          tenant_id:  tenantId,
          line_id:    row.lineId,
          code:       row.code,
          name:       row.name,
          status:     row.status as "active" | "inactive" | "suspended" | "deleted",
          created_at: now,
          updated_at: now,
        },
      });
    }
  });

  const rowResults: SublinesImportRowResult[] = toCreate.map((r) => ({
    rowNumber: r.rowNumber,
    name:      r.name,
    lineName:  r.lineName,
    code:      r.code,
    resolution: "CREATED" as const,
  }));

  return {
    created:      toCreate.length,
    skipped:      0,
    errors:       0,
    totalRows:    dbAwareResult.rows.length,
    importPolicy: "CREATE_ONLY",
    datasetKey:   "sublines",
    rows:         rowResults,
  } satisfies SublinesImportResult;
}
