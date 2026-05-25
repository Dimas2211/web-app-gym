// ─────────────────────────────────────────────────────────────────
// commerce/cash — derive-cash-cut-status.ts
//
// Helper puro que calcula el CashCutStatus a partir del estado
// de lifecycle y la diferencia de cierre.
// No toca base de datos ni schema.
// ─────────────────────────────────────────────────────────────────

import type { CashCutStatus, CashSessionStatus } from "../types/cash.types";

export function deriveCashCutStatus(
  status:            CashSessionStatus,
  difference_amount: number | null,
): CashCutStatus {
  if (status === "OPEN")      return "OPEN";
  if (status === "CANCELLED") return "CANCELLED";

  // status === "CLOSED"
  const diff = difference_amount ?? 0;
  if (diff > 0)  return "CLOSED_OVER";
  if (diff < 0)  return "CLOSED_SHORT";
  return "CLOSED_BALANCED";
}
