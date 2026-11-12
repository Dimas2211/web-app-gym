import type { DteContinuationOperation, DteContinuationState } from "./types";
import { isFiscallyReceivedByMh } from "../utils/dte-fiscal-receipt.utils";

export function continuationLabel(type: string): string | null {
  return (
    (
      {
        "01": "Continuar factura",
        "03": "Continuar CCF",
        "05": "Continuar nota de crédito",
        "11": "Continuar factura de exportación",
        "14": "Continuar factura de sujeto excluido",
      } as Record<string, string>
    )[type] ?? null
  );
}
export function continuationAllowed(
  s: DteContinuationState,
  op: DteContinuationOperation
): boolean {
  if (
    s.originStatus !== "CONFIRMED" ||
    ["CANCELLED", "INVALIDATED", "INVALIDATION_PENDING", "NOT_REQUIRED"].includes(s.status)
  )
    return false;
  switch (op) {
    case "generate":
      return (
        !s.hasSignature && !s.hasStamp && ["PENDING_GENERATION", "GENERATED"].includes(s.status)
      );
    case "sign":
      return s.status === "SCHEMA_VALIDATED" && s.hasJson && !s.hasSignature && !s.hasStamp;
    case "transmit":
      return s.status === "SIGNED" && s.hasSignature && !s.hasStamp;
    case "reconcile":
      return s.status === "SIGNED" && !s.hasStamp;
    case "deliver":
      return isFiscallyReceivedByMh(s.status, s.hasStamp ? "present" : null) && !s.delivered;
    case "reopen":
      return s.status === "REJECTED" && !s.hasStamp && s.canReopen;
  }
}
