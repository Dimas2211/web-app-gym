// ─────────────────────────────────────────────────────────────────
// commerce/dte — purchase-payment-method.mapper.ts
//
// Mapper Purchase.cancellation_type → CAT-017 (forma de pago MH),
// usado por el builder FSE 14 (generate-fse-json.service.ts) para
// `resumen.pagos[].codigo`.
//
// Purchase captura la forma de pago real en `cancellation_type`
// (etiqueta UI "Cancelación") — ver purchase-document.constants.ts.
// `payment_condition` es una magnitud fiscal distinta (CAT-016,
// condicionOperacion: Contado/Crédito/Otro) y nunca se usa para
// derivar el código de forma de pago.
//
// Purchase.cancellation_type no distingue Tarjeta Débito de Tarjeta
// Crédito (un solo valor "POS") — se mapea a "02" (Tarjeta Débito)
// como valor por defecto razonable. Si en el futuro se requiere
// distinguir, debe capturarse un campo adicional en Purchase.
// ─────────────────────────────────────────────────────────────────

// CAT-017 — Formas de pago DTE El Salvador (subconjunto usado aquí).
export const CAT017_EFECTIVO      = "01";
export const CAT017_TARJETA_DEBITO  = "02";
export const CAT017_TARJETA_CREDITO = "03";
export const CAT017_CHEQUE          = "04";
export const CAT017_TRANSFERENCIA   = "05";
export const CAT017_OTROS           = "99";

const CANCELLATION_TYPE_TO_CAT017: Record<string, string> = {
  EFE: CAT017_EFECTIVO,
  CHE: CAT017_CHEQUE,
  TRN: CAT017_TRANSFERENCIA,
  POS: CAT017_TARJETA_DEBITO,
  OTR: CAT017_OTROS,
};

/**
 * Traduce Purchase.cancellation_type (EFE/CHE/TRN/POS/OTR) al código
 * CAT-017 correspondiente. Si el valor no existe o no está mapeado,
 * cae a "99" (Otros) — nunca lanza.
 */
export function mapCancellationTypeToCat017(
  cancellationType: string | null | undefined,
): string {
  if (!cancellationType) return CAT017_OTROS;
  return CANCELLATION_TYPE_TO_CAT017[cancellationType] ?? CAT017_OTROS;
}
