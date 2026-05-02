"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchases-items-table.tsx
//
// Grilla de líneas del documento seleccionado (Bloque D).
//
// Columnas: Código · Producto · Cant. · C. Unitario · Gravada ·
//           IVA · Salida (stub) · Entrada (stub)
//
// 4 estados explícitos:
//   !selectedId                       → sin selección
//   selectedId && !detail             → cargando
//   detail && items.length === 0      → sin líneas
//   detail && items.length > 0        → grilla real
// ─────────────────────────────────────────────────────────────────

import type { PurchaseDetail } from "../types/purchase.types";

// ── Definición de columnas ────────────────────────────────────────

interface ColDef {
  key:      string;
  label:    string;
  widthCls: string;
  align?:   "right";
  stub?:    boolean;
}

const COLUMNS: ColDef[] = [
  { key: "product_code", label: "Código",      widthCls: "w-28"          },
  { key: "product_name", label: "Producto",    widthCls: "min-w-[200px]" },
  { key: "quantity",     label: "Cant.",       widthCls: "w-24",  align: "right" },
  { key: "unit_cost",    label: "C. Unitario", widthCls: "w-28",  align: "right" },
  { key: "line_subtotal",label: "Gravada",     widthCls: "w-28",  align: "right" },
  { key: "tax_amount",   label: "IVA",         widthCls: "w-24",  align: "right" },
  { key: "salida",       label: "Salida",      widthCls: "w-20",  align: "right", stub: true },
  { key: "entrada",      label: "Entrada",     widthCls: "w-20",  align: "right", stub: true },
];

// ── Helpers ───────────────────────────────────────────────────────

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

// ── Props ─────────────────────────────────────────────────────────

interface PurchasesItemsTableProps {
  selectedId: string | null;
  detail:     PurchaseDetail | null;
}

// ── Componente ────────────────────────────────────────────────────

export function PurchasesItemsTable({ selectedId, detail }: PurchasesItemsTableProps) {
  // ── Estado 1: sin selección ───────────────────────────────────
  if (!selectedId) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-600">
        Selecciona un documento para ver sus líneas
      </div>
    );
  }

  // ── Estado 2: cargando ────────────────────────────────────────
  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-600">
        Cargando líneas…
      </div>
    );
  }

  // ── Estado 3: sin líneas ──────────────────────────────────────
  if (detail.items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-600">
        Este documento no tiene líneas
      </div>
    );
  }

  // ── Estado 4: grilla real ─────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto min-h-0">
        <div className="min-w-[800px]">

          {/* Encabezado sticky */}
          <div className="sticky top-0 z-10 flex items-center h-7 border-b border-zinc-800 bg-zinc-900 px-3">
            {COLUMNS.map((col) => (
              <div
                key={col.key}
                className={[
                  "shrink-0 pr-3 select-none text-[10px] font-semibold uppercase tracking-wide",
                  col.widthCls,
                  col.align === "right" ? "text-right" : "",
                  col.stub ? "text-zinc-600" : "text-zinc-500",
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
                  case "product_code":
                    return cell(<span className="font-mono">{item.product_code}</span>);
                  case "product_name":
                    return cell(item.product_name);
                  case "quantity":
                    return cell(`${Number(item.quantity).toFixed(2)} ${item.unit_symbol}`);
                  case "unit_cost":
                    return cell(formatMoney(item.unit_cost));
                  case "line_subtotal":
                    return cell(formatMoney(item.line_subtotal));
                  case "tax_amount":
                    return cell(formatMoney(item.tax_amount));
                  case "salida":
                    return cell(<span className="text-zinc-600">—</span>);
                  case "entrada":
                    return cell(<span className="text-zinc-600">—</span>);
                  default:
                    return cell("—");
                }
              })}
            </div>
          ))}

        </div>
      </div>
    </div>
  );
}
