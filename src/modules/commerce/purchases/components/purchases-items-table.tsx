"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchases-items-table.tsx
//
// Grilla de líneas del documento seleccionado (Bloque D).
//
// Columnas: Código · Producto · Cant. · C. Unitario · Gravada ·
//           IVA · Salida (stub) · Entrada (stub)
//
// Estados:
//   !selectedId               → sin selección
//   selectedId && isLoading   → muestra detalle anterior + indicador discreto
//   detail con items          → grilla real
//   detail sin items          → sin líneas
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
  { key: "product_code",  label: "Código",      widthCls: "w-[110px]"  },
  { key: "product_name",  label: "Producto",    widthCls: "w-[320px]"  },
  { key: "quantity",      label: "Cant.",       widthCls: "w-[90px]",  align: "right" },
  { key: "unit_cost",     label: "C. Unitario", widthCls: "w-[110px]", align: "right" },
  { key: "line_subtotal", label: "Gravada",     widthCls: "w-[120px]", align: "right" },
  { key: "tax_amount",    label: "IVA",         widthCls: "w-[100px]", align: "right" },
  { key: "salida",        label: "Salida",      widthCls: "w-[100px]", align: "right", stub: true },
  { key: "entrada",       label: "Entrada",     widthCls: "w-[100px]", align: "right", stub: true },
];

// ── Helpers ───────────────────────────────────────────────────────

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

// ── Props ─────────────────────────────────────────────────────────

interface PurchasesItemsTableProps {
  selectedId: string | null;
  detail:     PurchaseDetail | null;
  isLoading?: boolean;
}

// ── Componente ────────────────────────────────────────────────────

export function PurchasesItemsTable({ selectedId, detail, isLoading }: PurchasesItemsTableProps) {
  // ── Sin selección: mensaje centrado ──────────────────────────
  if (!selectedId) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-600">
        Selecciona un documento para ver sus líneas
      </div>
    );
  }

  // ── Cargando primera vez (sin detalle previo): placeholder ────
  // No se desmonta la estructura; se muestra solo mientras no hay
  // ningún detalle anterior que mantener visible.
  if (!detail && isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-auto min-h-0">
          <div className="min-w-[1050px]">
            {/* Encabezado idéntico para no cambiar el layout */}
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
            {/* Filas skeleton */}
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center h-7 px-3 border-b border-zinc-800/40">
                {COLUMNS.map((col) => (
                  <div key={col.key} className={`shrink-0 pr-3 ${col.widthCls}`}>
                    <div className="h-2.5 rounded bg-zinc-800 animate-pulse" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Sin líneas confirmado (detalle ya llegó y está vacío) ─────
  if (!detail || detail.items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-600">
        {!detail ? "Selecciona un documento para ver sus líneas" : "Este documento no tiene líneas"}
      </div>
    );
  }

  // ── Grilla real — con indicador discreto si está recargando ──
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto min-h-0">
        <div className="min-w-[800px]">

          {/* Encabezado sticky — incluye indicador discreto de carga */}
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
            {isLoading && (
              <span className="ml-auto shrink-0 text-[10px] text-zinc-600 animate-pulse pr-1">
                Actualizando…
              </span>
            )}
          </div>

          {/* Filas — opacidad reducida mientras recarga */}
          <div className={isLoading ? "opacity-50 transition-opacity duration-150" : "transition-opacity duration-150"}>
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
    </div>
  );
}
