import type { SalesLineReportRow } from "../types/commerce-report.types";
import type { SalesMovementType } from "./sales-report-movements";

export function groupSalesReportLines(rows: SalesLineReportRow[]) {
  const groups = new Map<string, {
    movementId: string; movementType: SalesMovementType; saleCode: string;
    saleDate: string; customerName: string | null; items: SalesLineReportRow[];
  }>();
  for (const row of rows) {
    const key = row.movement_id;
    let group = groups.get(key);
    if (!group) {
      group = { movementId: key, movementType: row.movement_type, saleCode: row.sale_code,
        saleDate: row.sale_date, customerName: row.customer_name, items: [] };
      groups.set(key, group);
    }
    group.items.push(row);
  }
  return [...groups.values()];
}
