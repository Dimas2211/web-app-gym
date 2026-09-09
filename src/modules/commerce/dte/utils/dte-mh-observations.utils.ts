// commerce/dte — dte-mh-observations.utils.ts
//
// FASE IV-B.1 — Corrección 2 — clasificador explícito de PROCESADO
// ACCEPTED vs OBSERVED, reutilizable por el reconciliation service (y,
// en un hotfix futuro fuera de esta microfase, por el pipeline SEND).
//
// El Manual MH muestra un ejemplo "Sin Observaciones" con
// `observaciones: ["", ""]` — un array no vacío de strings vacíos.
// `Array.isArray(observaciones) && observaciones.length > 0` (criterio
// usado hoy en transmit-dte-document.service.ts) clasificaría esto
// como OBSERVED incorrectamente. Este helper exige contenido
// significativo real, no solo la forma del array.
//
// HALLAZGO DOCUMENTADO (no corregido en esta microfase — fuera de
// alcance, ver docs/modules/platform-phase-4b-dte-query-reconciliation.md):
// transmit-dte-document.service.ts (determineFinalStatus) tiene
// potencialmente el mismo bug para la respuesta de recepciondte. No se
// modifica aquí para no alterar comportamiento productivo existente
// sin evidencia empírica confirmada contra ese endpoint — se propone
// como hotfix separado.

export function hasMeaningfulMhObservations(observaciones: unknown[] | null | undefined): boolean {
  if (!Array.isArray(observaciones)) return false;
  return observaciones.some((entry) => {
    if (typeof entry === "string") return entry.trim().length > 0;
    if (entry != null && typeof entry === "object") return Object.keys(entry).length > 0;
    return entry != null && entry !== "";
  });
}

/**
 * Determina si una respuesta MH con `estado=PROCESADO` debe clasificarse
 * como OBSERVED (en vez de ACCEPTED). Evidencia positiva requerida:
 *   - codigoMsg === "002", o
 *   - descripcionMsg contiene "observaci" (case-insensitive), o
 *   - hasMeaningfulMhObservations(observaciones) === true
 * Ausencia de las tres -> ACCEPTED.
 */
export function isMhProcessedObserved(params: {
  codigoMsg?: string | null;
  descripcionMsg?: string | null;
  observaciones?: unknown[] | null;
}): boolean {
  const { codigoMsg, descripcionMsg, observaciones } = params;
  if (codigoMsg === "002") return true;
  if (descripcionMsg?.toLowerCase().includes("observaci")) return true;
  if (hasMeaningfulMhObservations(observaciones)) return true;
  return false;
}
