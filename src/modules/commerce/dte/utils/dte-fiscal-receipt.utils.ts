// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-fiscal-receipt.utils.ts
//
// isFiscallyReceivedByMh — definición semántica ÚNICA de qué significa
// que un DteOutgoingDocument fue "fiscalmente recibido por Hacienda".
//
// Se usa para decidir ELEGIBILIDAD PARA ENTREGA EXTERNA (Entrega DTE /
// MariaDB), no para decidir estado fiscal, invalidación, notas de
// crédito, retransmisión ni firma — esos flujos siguen exigiendo
// ACCEPTED estricto y no deben usar este helper.
//
// Regla:
//   (dte_status === "ACCEPTED" || dte_status === "OBSERVED")
//   && reception_stamp no nulo/no vacío
//
// MH devuelve documentos ACCEPTED (sin observaciones) u OBSERVED
// (recibido con observaciones no bloqueantes, codigoMsg "002") como
// recibidos fiscalmente — ambos casos traen reception_stamp (sello de
// recepción), que es la evidencia real de recepción. REJECTED, SIGNED,
// SCHEMA_VALIDATED, PENDING_*, SENT e INVALIDATED nunca son elegibles.
//
// Función pura, sin acceso a DB — server-safe y client-safe.
// ─────────────────────────────────────────────────────────────────

const FISCALLY_RECEIVED_STATUSES = new Set(["ACCEPTED", "OBSERVED"]);

export function isFiscallyReceivedByMh(
  status: string,
  receptionStamp: string | null | undefined,
): boolean {
  if (!FISCALLY_RECEIVED_STATUSES.has(status)) return false;
  return typeof receptionStamp === "string" && receptionStamp.trim().length > 0;
}
