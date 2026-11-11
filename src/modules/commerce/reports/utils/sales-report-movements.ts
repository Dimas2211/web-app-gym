// Pure movement rules shared by report queries, UI and exports.
export type SalesMovementType = "SALE" | "CANCELLATION";
export interface SalesMovement {
  movement_type: SalesMovementType;
  movement_date: string;
  sign: 1 | -1;
}
export interface SaleHistoryDates {
  status: string;
  sale_date: Date | string;
  confirmed_at?: Date | string | null;
  cancelled_at?: Date | string | null;
}
const businessDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/El_Salvador", year: "numeric", month: "2-digit", day: "2-digit",
});
export function saleDateString(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}
export function cancellationDateString(value: Date | string): string {
  return businessDate.format(new Date(value));
}
export function salesMovementLabel(type: SalesMovementType): string {
  return type === "CANCELLATION" ? "Anulación" : "Venta";
}
export function money(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }

export function saleReportMovements(sale: SaleHistoryDates, from: string, to: string): SalesMovement[] {
  if (sale.status !== "CONFIRMED" && sale.status !== "CANCELLED") return [];
  // Cancelled drafts never generated a commercial sale.
  if (sale.status === "CANCELLED" && !sale.confirmed_at) return [];
  const movements: SalesMovement[] = [];
  const original = saleDateString(sale.sale_date);
  if (original >= from && original <= to) movements.push({ movement_type: "SALE", movement_date: original, sign: 1 });
  if (sale.status === "CANCELLED" && sale.cancelled_at) {
    const date = cancellationDateString(sale.cancelled_at);
    if (date >= from && date <= to) movements.push({ movement_type: "CANCELLATION", movement_date: date, sign: -1 });
  }
  return movements;
}

export function salesMovementCountsLabel(rows: ReadonlyArray<{ movement_id: string; movement_type: SalesMovementType }>): string {
  const movements = new Map(rows.map((row) => [row.movement_id, row.movement_type]));
  const sales = [...movements.values()].filter((type) => type === "SALE").length;
  const cancellations = movements.size - sales;
  return `${sales} ${sales === 1 ? "venta" : "ventas"} · ${cancellations} ${cancellations === 1 ? "anulación" : "anulaciones"}`;
}
