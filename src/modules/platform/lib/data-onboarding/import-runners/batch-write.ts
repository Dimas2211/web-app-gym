// ─────────────────────────────────────────────────────────────────
// platform — batch-write.ts
//
// ONBOARDING-5K. Piezas comunes de escritura por lotes para los runners
// del Data Onboarding Center. SERVER-ONLY (lo importan solo runners).
//
// - Todas las inserciones de un import ocurren dentro de UNA sola
//   transacción interactiva: los lotes solo acotan el tamaño de cada
//   sentencia INSERT multi-fila (createMany), no la atomicidad.
// - Cada lote verifica que PostgreSQL insertó exactamente las filas
//   enviadas; si no, lanza → rollback total (nunca éxito parcial).
// - DATA_ONBOARDING_TX_OPTIONS.timeout queda por debajo del maxDuration
//   de la ruta (60 s): si la transacción no termina a tiempo, Prisma la
//   aborta y PostgreSQL hace rollback antes de que la función muera. Si
//   la función muriera igualmente, la conexión se cierra y PostgreSQL
//   revierte la transacción no confirmada.
// ─────────────────────────────────────────────────────────────────

import type {
  DataOnboardingPreviewResult,
  DataOnboardingPreviewRow,
  DataOnboardingDbAwarePreviewResult,
} from "../../../types/platform.types";
import { analysisCoverageError } from "../data-onboarding-coverage";
import { DATA_ONBOARDING_WRITE_BATCH_SIZE } from "../data-onboarding-limits";

/** Opciones de la transacción de escritura de cualquier import (< maxDuration 60 s de la ruta). */
export const DATA_ONBOARDING_TX_OPTIONS = { maxWait: 10_000, timeout: 45_000 } as const;

export function chunkRows<T>(items: T[], size: number = DATA_ONBOARDING_WRITE_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Inserta `items` en lotes con `write` (createMany del tx) y verifica el
 * conteo de cada lote. Devuelve el total insertado (= items.length).
 */
export async function createManyInBatches<T>(
  items: T[],
  write: (batch: T[]) => Promise<{ count: number }>,
  label: string,
): Promise<number> {
  let inserted = 0;
  for (const batch of chunkRows(items)) {
    const { count } = await write(batch);
    if (count !== batch.length) {
      throw new Error(
        `Inserción de ${label} incompleta: PostgreSQL insertó ${count} de ${batch.length} fila(s) del lote. ` +
        "La transacción se revirtió completa — no se escribió ningún registro.",
      );
    }
    inserted += count;
  }
  if (inserted !== items.length) {
    throw new Error(`Inserción de ${label} incompleta (${inserted} de ${items.length}). Transacción revertida.`);
  }
  return inserted;
}

/** Índice rowNumber → fila parseada (evita búsquedas O(n²) con .find por fila). */
export function indexParsedRows(preview: DataOnboardingPreviewResult): Map<number, DataOnboardingPreviewRow> {
  return new Map(preview.rows.map((r) => [r.rowNumber, r]));
}

/**
 * ONBOARDING-5K — defensa en profundidad de los runners Commerce: sin
 * importación parcial. El pipeline ya bloquea estos casos antes del runner;
 * aquí se repite para que un runner nunca escriba solo las filas CREATE de
 * un archivo con filas bloqueadas o con análisis incompleto.
 */
export function assertWholeFileCreatable(
  parsedPreview: DataOnboardingPreviewResult,
  dbAwareResult: DataOnboardingDbAwarePreviewResult,
): void {
  const coverage = analysisCoverageError(parsedPreview, dbAwareResult);
  if (coverage) throw new Error(coverage);
  const nonCreate = dbAwareResult.rows.filter((r) => r.resolution !== "CREATE").length;
  if (nonCreate > 0) {
    throw new Error(
      `${nonCreate} fila(s) no son creables según el análisis DB-aware. ` +
      "No se permite importación parcial: corrija el archivo e intente de nuevo.",
    );
  }
}
