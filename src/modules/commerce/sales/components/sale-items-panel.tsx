"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — sale-items-panel.tsx
//
// Grilla de líneas de la venta seleccionada (Bloque D).
//
// Columnas: Línea · Código · Nombre · Tipo · Stockable ·
//           Cantidad · Precio · Descuento · IVA · Total línea
//
// 4 estados explícitos:
//   !selectedId                  → sin selección
//   selectedId && !detail        → cargando
//   detail && items.length === 0 → sin líneas
//   detail && items.length > 0   → grilla real
// ─────────────────────────────────────────────────────────────────

import type { SaleDetail } from "../types/sale.types";

// ── Definición de columnas ────────────────────────────────────────

interface ColDef {
  key:      string;
  label:    string;
  widthCls: string;
  align?:   "right";
}

const COLUMNS: ColDef[] = [
  { key: "line_number",           label: "#",          widthCls: "w-10"          },
  { key: "product_code_snapshot", label: "Código",     widthCls: "w-28"          },
  { key: "product_name_snapshot", label: "Nombre",     widthCls: "min-w-[180px]" },
  { key: "product_type_snapshot", label: "Tipo",       widthCls: "w-24"          },
  { key: "is_stockable_snapshot", label: "Stock",      widthCls: "w-16"          },
  { key: "quantity",              label: "Cant.",      widthCls: "w-20",  align: "right" },
  { key: "unit_price",            label: "Precio",     widthCls: "w-24",  align: "right" },
  { key: "discount_amount",       label: "Descuento",  widthCls: "w-24",  align: "right" },
  { key: "tax_amount",            label: "IVA",        widthCls: "w-20",  align: "right" },
  { key: "line_total",            label: "Total",      widthCls: "w-24",  align: "right" },
];

// ── Helpers ───────────────────────────────────────────────────────

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

// ── Props ─────────────────────────────────────────────────────────

interface SaleItemsPanelProps {
  selectedId: string | null;
  detail:     SaleDetail | null;
}

// ── Componente ────────────────────────────────────────────────────

export function SaleItemsPanel({ selectedId, detail }: SaleItemsPanelProps) {
  // Estado 1: sin selección
  if (!selectedId) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 items-center justify-center text-xs text-zinc-600">
          Selecciona una venta para ver sus líneas
        </div>
        <DtePlaceholder />
      </div>
    );
  }

  // Estado 2: cargando
  if (!detail) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 items-center justify-center text-xs text-zinc-600">
          Cargando líneas…
        </div>
        <DtePlaceholder />
      </div>
    );
  }

  // Estado 3: sin líneas
  if (detail.items.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 items-center justify-center text-xs text-zinc-600">
          Esta venta no tiene líneas
        </div>
        <DtePlaceholder />
      </div>
    );
  }

  // Estado 4: grilla real
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto min-h-0">
        <div className="min-w-[900px]">

          {/* Encabezado sticky */}
          <div className="sticky top-0 z-10 flex items-center h-7 border-b border-zinc-800 bg-zinc-900 px-3">
            {COLUMNS.map((col) => (
              <div
                key={col.key}
                className={[
                  "shrink-0 pr-3 select-none text-[10px] font-semibold uppercase tracking-wide text-zinc-500",
                  col.widthCls,
                  col.align === "right" ? "text-right" : "",
                ].join(" ")}
              >
                {col.label}
              </div>
            ))}
          </div>

          {/* Filas */}
          {detail.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center h-7 px-3 border-b border-zinc-800/40 text-xs text-zinc-300"
            >
              {COLUMNS.map((col) => {
                function cell(content: React.ReactNode, extraCls = "") {
                  return (
                    <div
                      key={col.key}
                      className={[
                        "shrink-0 pr-3 truncate",
                        col.widthCls,
                        col.align === "right" ? "text-right" : "",
                        extraCls,
                      ].join(" ")}
                    >
                      {content}
                    </div>
                  );
                }

                switch (col.key) {
                  case "line_number":
                    return cell(item.line_number);
                  case "product_code_snapshot":
                    return cell(<span className="font-mono">{item.product_code_snapshot}</span>);
                  case "product_name_snapshot":
                    return cell(item.product_name_snapshot);
                  case "product_type_snapshot":
                    return cell(
                      <span className="text-zinc-400">{item.product_type_snapshot ?? "—"}</span>
                    );
                  case "is_stockable_snapshot":
                    return cell(
                      item.is_stockable_snapshot
                        ? <span className="text-emerald-400">Sí</span>
                        : <span className="text-zinc-500">No</span>
                    );
                  case "quantity":
                    return cell(Number(item.quantity).toFixed(2));
                  case "unit_price":
                    return cell(formatMoney(Number(item.unit_price)));
                  case "discount_amount":
                    return cell(
                      Number(item.discount_amount) > 0
                        ? <span className="text-amber-400">{formatMoney(Number(item.discount_amount))}</span>
                        : "—"
                    );
                  case "tax_amount":
                    return cell(formatMoney(Number(item.tax_amount)));
                  case "line_total":
                    return cell(<span className="font-mono">{formatMoney(Number(item.line_total))}</span>);
                  default:
                    return cell("—");
                }
              })}
            </div>
          ))}
        </div>
      </div>
      <DtePlaceholder />
    </div>
  );
}

// ── Bloque placeholder DTE ────────────────────────────────────────

function DtePlaceholder() {
  return (
    <div className="flex-none border-t border-zinc-800/60 bg-zinc-900/50 px-3 py-1 flex items-center gap-4 text-[10px] text-zinc-600">
      <span>
        <span className="text-zinc-500 font-medium mr-1">DTE:</span>
        No generado
      </span>
      <span>
        <span className="text-zinc-500 font-medium mr-1">PDF:</span>
        No disponible
      </span>
      <span>
        <span className="text-zinc-500 font-medium mr-1">Envío:</span>
        No disponible
      </span>
    </div>
  );
}
