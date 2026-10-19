import type { InventoryMovementItem } from "../types/inventory-movement.types";

const COLUMNS = ["Fecha", "Tipo", "Código", "Producto", "Documento", "Entrada", "Salida", "Stock anterior", "Stock resultante", "Costo unitario", "Usuario", "Observaciones"];

function safe(value: string | null | undefined): string {
  const s = value ?? "";
  return /^[=+@\-\t\r]/.test(s) ? "'" + s : s;
}

function values(item: InventoryMovementItem): (string | number)[] {
  return [
    safe(item.created_at_label),
    safe(item.movement_type),
    safe(item.product_code),
    safe(item.product_name),
    safe(item.reference_code),
    item.movement_direction === "ADDITIVE" ? item.quantity : 0,
    item.movement_direction === "SUBTRACTIVE" ? item.quantity : 0,
    item.stock_before,
    item.resulting_stock,
    item.unit_cost ?? "",
    safe(item.performed_by_name ?? item.performed_by),
    safe(item.notes),
  ];
}

function filename(ext: string): string {
  return "zolvi-inventario-movimientos-" + new Date().toISOString().slice(0, 10) + "." + ext;
}

export async function exportInventoryMovementsExcel(items: InventoryMovementItem[]): Promise<void> {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Zolvi — Movimientos de inventario"],
    ["Fecha de generación", new Date().toLocaleString("es-SV")],
    ["Alcance", "Sucursal activa"],
    ["Movimientos", items.length],
    [],
    COLUMNS,
    ...items.map(values),
  ]);
  worksheet["!cols"] = [21, 22, 17, 32, 22, 12, 12, 16, 17, 16, 24, 40]
    .map((wch) => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Movimientos");
  XLSX.writeFile(workbook, filename("xlsx"));
}

export async function exportInventoryMovementsPdf(items: InventoryMovementItem[]): Promise<void> {
  const [{ default: jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const document = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  document.setFontSize(16);
  document.text("Zolvi — Movimientos de inventario", 14, 15);
  document.setFontSize(9);
  document.text("Generado: " + new Date().toLocaleString("es-SV") + " | Sucursal activa | Movimientos: " + items.length, 14, 22);
  autoTable(document, {
    startY: 28,
    head: [COLUMNS],
    body: items.map((item) => values(item).map(String)),
    margin: { left: 10, right: 10 },
    theme: "striped",
    styles: { fontSize: 7, cellPadding: 1.6, overflow: "linebreak" },
    headStyles: { fillColor: [39, 48, 62] },
  });
  document.save(filename("pdf"));
}
