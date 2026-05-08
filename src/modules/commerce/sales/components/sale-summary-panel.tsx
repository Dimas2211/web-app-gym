"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — sale-summary-panel.tsx
//
// Panel resumen documental (Bloque B).
// Muestra campos de cabecera de la venta seleccionada.
// ─────────────────────────────────────────────────────────────────

import type { SaleListItem, SaleDetail } from "../types/sale.types";
import { SaleDteBadge } from "./sale-dte-badge";

// ── Estilos ───────────────────────────────────────────────────────

const labelCls   = "block text-[10px] font-medium uppercase tracking-wider text-zinc-500 truncate";
const realValCls = "block text-xs text-zinc-100 truncate";
const stubValCls = "block text-xs text-zinc-500 truncate";

// ── Props ─────────────────────────────────────────────────────────

interface SaleSummaryPanelProps {
  item:    SaleListItem | null;
  detail:  SaleDetail   | null;
  loading: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function paymentMethodLabel(code: string | null | undefined): string {
  if (!code) return "—";
  const map: Record<string, string> = {
    CASH:     "Efectivo",
    CARD:     "Tarjeta",
    TRANSFER: "Transferencia",
    CREDIT:   "Crédito",
    CHEQUE:   "Cheque",
  };
  return map[code] ?? code;
}

function conditionLabel(code: string | null | undefined): string {
  if (!code) return "—";
  const map: Record<string, string> = {
    CONTADO:  "Contado",
    CREDITO:  "Crédito",
    OTRO:     "Otro",
  };
  return map[code] ?? code;
}

// ── Componente ────────────────────────────────────────────────────

export function SaleSummaryPanel({ item, detail, loading }: SaleSummaryPanelProps) {
  if (loading) {
    return (
      <div className="flex-none border-b border-zinc-800 bg-zinc-900 px-3 py-3 flex items-center justify-center h-16">
        <span className="text-xs text-zinc-500">Cargando resumen…</span>
      </div>
    );
  }

  if (!item && !detail) {
    return (
      <div className="flex-none border-b border-zinc-800 bg-zinc-900 px-3 py-3 flex items-center justify-center h-16">
        <span className="text-xs text-zinc-600">Selecciona una venta para ver el resumen</span>
      </div>
    );
  }

  const src = detail ?? item;

  interface FieldDef { label: string; value: string; stub?: boolean; }

  function fv(val: string | null | undefined): FieldDef["value"] {
    return val ?? "—";
  }

  const row1: FieldDef[] = [
    { label: "Código venta",    value: fv(src?.sale_code)                                           },
    { label: "Fecha",           value: fv(src?.sale_date_label)                                     },
    { label: "Cliente",         value: src?.customer_name ?? "Consumidor final"                     },
    { label: "Estado",          value: src ? src.status : "—",           stub: !src                 },
    { label: "Estado pago",     value: src ? src.payment_status : "—",   stub: !src                 },
    { label: "Cond. operación", value: detail ? conditionLabel(detail.condition_operation_code) : "—", stub: !detail },
    { label: "Forma de pago",   value: detail ? paymentMethodLabel(detail.payment_method_code)  : "—", stub: !detail },
    { label: "Ítems",           value: detail ? String(detail.items.length) : item?.item_count != null ? String(item.item_count) : "—" },
  ];

  const row2: FieldDef[] = [
    { label: "Subtotal",    value: src ? formatMoney(src.subtotal)       : "$0.00"                  },
    { label: "Descuento",   value: src ? formatMoney(src.discount_amount): "$0.00"                  },
    { label: "IVA",         value: src ? formatMoney(src.tax_amount)     : "$0.00"                  },
    { label: "Total",       value: src ? formatMoney(src.total_amount)   : "$0.00"                  },
    { label: "Creado por",  value: detail?.created_by_name ?? "—",     stub: !detail?.created_by_name },
    { label: "Creación",    value: detail?.created_at_label ?? src?.created_at_label ?? "—"         },
    { label: "Confirmado",  value: detail?.confirmed_at_label ?? "—",  stub: !detail?.confirmed_at  },
    { label: "Notas",       value: detail?.notes ?? "—",               stub: !detail?.notes         },
  ];

  function valCls(f: FieldDef): string {
    return src !== null && !f.stub ? realValCls : stubValCls;
  }

  const saleStatusLabel: Record<string, string> = {
    DRAFT:     "Borrador",
    CONFIRMED: "Confirmada",
    CANCELLED: "Anulada",
  };

  const payStatusLabel: Record<string, string> = {
    UNPAID:   "Sin pago",
    PARTIAL:  "Parcial",
    PAID:     "Pagado",
    REFUNDED: "Devuelto",
  };

  return (
    <div className="flex-none border-b border-zinc-800 bg-zinc-900 px-3 py-2 space-y-1.5">
      {/* Fila 1 */}
      <div className="grid grid-cols-8 gap-x-3">
        {row1.map((f, i) => (
          <div key={i} className="min-w-0">
            <span className={labelCls}>{f.label}</span>
            {f.label === "Estado" ? (
              <span className={valCls(f)}>
                {src ? (saleStatusLabel[f.value] ?? f.value) : "—"}
              </span>
            ) : f.label === "Estado pago" ? (
              <span className={valCls(f)}>
                {src ? (payStatusLabel[f.value] ?? f.value) : "—"}
              </span>
            ) : (
              <span className={valCls(f)}>{f.value}</span>
            )}
          </div>
        ))}
      </div>

      {/* Fila 2 */}
      <div className="grid grid-cols-8 gap-x-3">
        {row2.map((f, i) => (
          <div key={i} className="min-w-0">
            <span className={labelCls}>{f.label}</span>
            <span className={valCls(f)}>{f.value}</span>
          </div>
        ))}
      </div>

      {/* Bloque DTE placeholder */}
      <div className="border-t border-zinc-800 pt-1.5 flex items-center gap-3">
        <div className="min-w-0">
          <span className={labelCls}>DTE</span>
          <SaleDteBadge status={null} />
        </div>
        <span className="text-[10px] text-zinc-600">
          Pendiente de integración DTE
        </span>
      </div>
    </div>
  );
}
