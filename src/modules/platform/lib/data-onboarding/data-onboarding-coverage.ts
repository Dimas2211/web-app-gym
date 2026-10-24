// ─────────────────────────────────────────────────────────────────
// platform/lib/data-onboarding — data-onboarding-coverage.ts
//
// ONBOARDING-5K. Verificación pura de que el análisis DB-aware cubre
// exactamente todas las filas parseadas del archivo. La usa el pipeline
// de importación antes de ejecutar cualquier runner.
// ─────────────────────────────────────────────────────────────────

import type {
  DataOnboardingPreviewResult,
  DataOnboardingDbAwarePreviewResult,
} from "../../types/platform.types";

/**
 * ONBOARDING-5K: null si el análisis DB-aware cubre exactamente las filas
 * parseadas (mismo conteo y mismos números de fila) y el parseo no es una
 * muestra; si no, el motivo del rechazo.
 */
export function analysisCoverageError(
  parsedPreview: DataOnboardingPreviewResult,
  dbAwareResult: DataOnboardingDbAwarePreviewResult,
): string | null {
  const total = parsedPreview.summary.totalRows;
  if (parsedPreview.sample || parsedPreview.rows.length !== total) {
    return `El archivo tiene ${total} registro(s) pero solo ${parsedPreview.rows.length} quedaron disponibles para importar. No se permite importación parcial.`;
  }
  if (dbAwareResult.sample || dbAwareResult.rows.length !== total) {
    return `El análisis cubrió ${dbAwareResult.rows.length} de ${total} registro(s). No se permite importación parcial.`;
  }
  const analyzed = new Set(dbAwareResult.rows.map((r) => r.rowNumber));
  const missing = parsedPreview.rows.filter((r) => !analyzed.has(r.rowNumber)).length;
  if (missing > 0) {
    return `${missing} registro(s) del archivo no fueron analizados. No se permite importación parcial.`;
  }
  return null;
}
