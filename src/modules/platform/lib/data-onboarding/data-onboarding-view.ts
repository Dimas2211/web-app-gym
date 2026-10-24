// ─────────────────────────────────────────────────────────────────
// platform/lib/data-onboarding — data-onboarding-view.ts
//
// ONBOARDING-5K. Vista para el navegador de resultados completos.
// Puro: recibe el resultado COMPLETO calculado server-side y devuelve
// una copia con una muestra acotada de filas para renderizar.
//
// - Los summary/conteos NO se recalculan: siempre reflejan el archivo
//   completo. Solo se acorta el arreglo `rows`.
// - La muestra prioriza filas con problemas (errores, luego
//   advertencias) y se devuelve ordenada por número de fila.
// - Nunca se usa para alimentar análisis ni escritura: el pipeline de
//   importación re-parsea el archivo server-side.
// ─────────────────────────────────────────────────────────────────

import type {
  DataOnboardingPreviewResult,
  DataOnboardingDbAwarePreviewResult,
} from "../../types/platform.types";
import { DATA_ONBOARDING_VIEW_ROWS_LIMIT } from "./data-onboarding-limits";

/**
 * Muestra de hasta `limit` filas: primero las de mayor prioridad
 * (0 = más importante), luego el resto, en orden de fila.
 */
export function sampleRowsByPriority<T extends { rowNumber: number }>(
  rows:     T[],
  priority: (row: T) => number,
  limit:    number = DATA_ONBOARDING_VIEW_ROWS_LIMIT,
): T[] {
  if (rows.length <= limit) return rows;
  return rows
    .map((row, index) => ({ row, index, p: priority(row) }))
    .sort((a, b) => a.p - b.p || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.row)
    .sort((a, b) => a.rowNumber - b.rowNumber);
}

export function toPreviewResultView(result: DataOnboardingPreviewResult): DataOnboardingPreviewResult {
  const rows = sampleRowsByPriority(result.rows, (r) =>
    r.status === "ERROR" ? 0 : r.status === "WARNING" ? 1 : 2,
  );
  if (rows === result.rows) return result;
  return { ...result, rows, sample: { shownRows: rows.length, totalRows: result.rows.length } };
}

export function toDbAwareResultView(result: DataOnboardingDbAwarePreviewResult): DataOnboardingDbAwarePreviewResult {
  const rows = sampleRowsByPriority(result.rows, (r) =>
    r.resolution === "ERROR" ? 0 : r.warnings.length > 0 || r.resolution !== "CREATE" ? 1 : 2,
  );
  if (rows === result.rows) return result;
  return { ...result, rows, sample: { shownRows: rows.length, totalRows: result.rows.length } };
}

/**
 * Acota `rows` de un resultado de runner (dry-run o EXECUTE) para la
 * respuesta al navegador. Los conteos (`created`, `wouldCreate`,
 * `blocked`, `totalRows`) del resultado se conservan intactos.
 */
export function toRunnerResultView<T>(result: T): T {
  if (!result || typeof result !== "object" || !("rows" in result)) return result;
  const rows = (result as { rows: unknown }).rows;
  if (!Array.isArray(rows)) return result;
  const typed = rows as { rowNumber: number; resolution?: string }[];
  const sampled = sampleRowsByPriority(typed, (r) =>
    r.resolution === "ERROR" ? 0 : r.resolution === "SKIPPED" ? 1 : 2,
  );
  if (sampled === typed) return result;
  return { ...result, rows: sampled };
}
