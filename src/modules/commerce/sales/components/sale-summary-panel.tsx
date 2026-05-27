"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — sale-summary-panel.tsx
//
// Panel resumen documental (Bloque B).
// Muestra campos de cabecera de la venta seleccionada.
// ─────────────────────────────────────────────────────────────────

import type { SaleListItem, SaleDetail } from "../types/sale.types";
import { getDteShortCode } from "../utils/dte-type-labels";

// ── Estilos ───────────────────────────────────────────────────────

const labelCls   = "block text-[10px] font-medium uppercase tracking-wider text-zinc-500 truncate";
const realValCls = "block text-xs text-zinc-100 truncate";
const stubValCls = "block text-xs text-zinc-500 truncate";

// ── Props ─────────────────────────────────────────────────────────

interface SaleSummaryPanelProps {
  item:   SaleListItem | null;
  detail: SaleDetail   | null;
}

// ── Helpers ───────────────────────────────────────────────────────

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

// CAT-017 — Forma de pago
function paymentMethodLabel(code: string | null | undefined): string {
  if (!code) return "—";
  const map: Record<string, string> = {
    "01": "Billetes y monedas",
    "02": "Tarjeta Débito",
    "03": "Tarjeta Crédito",
    "04": "Cheque",
    "05": "Transferencia-Depósito Bancario",
    "08": "Dinero electrónico",
    "09": "Monedero electrónico",
    "11": "Bitcoin",
    "12": "Otras Criptomonedas",
    "13": "Cuentas por pagar del receptor",
    "14": "Giro bancario",
    "99": "Otros",
  };
  const label = map[code];
  return label ? `${code} — ${label}` : code;
}

// CAT-016 — Condición de operación
function conditionLabel(code: string | null | undefined): string {
  if (!code) return "—";
  const map: Record<string, string> = {
    "1": "Contado",
    "2": "A crédito",
    "3": "Otro",
  };
  const label = map[code];
  return label ? `${code} — ${label}` : code;
}

function dteTypeLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return getDteShortCode(code);
}

// ── Badges de estado ──────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    DRAFT:     { label: "Borrador",   cls: "bg-zinc-800 text-zinc-400 border border-zinc-700"                },
    CONFIRMED: { label: "Confirmada", cls: "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50" },
    CANCELLED: { label: "Anulada",    cls: "bg-red-900/50 text-red-400 border border-red-700/50"             },
  };
  const { label, cls } = config[status] ?? { label: status, cls: "bg-zinc-800 text-zinc-400 border border-zinc-700" };
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function PayStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    UNPAID:   { label: "Sin pago",  cls: "bg-zinc-800 text-zinc-500 border border-zinc-700"               },
    PARTIAL:  { label: "Parcial",   cls: "bg-amber-900/50 text-amber-300 border border-amber-700/50"      },
    PAID:     { label: "Pagado",    cls: "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50" },
    REFUNDED: { label: "Devuelto",  cls: "bg-purple-900/50 text-purple-300 border border-purple-700/50"   },
  };
  const { label, cls } = config[status] ?? { label: status, cls: "bg-zinc-800 text-zinc-400 border border-zinc-700" };
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ── Componente ────────────────────────────────────────────────────

export function SaleSummaryPanel({ item, detail }: SaleSummaryPanelProps) {
  if (!item && !detail) {
    return (
      <div className="flex-none border-b border-zinc-800 bg-zinc-900 px-3 py-3 flex items-center justify-center h-16">
        <span className="text-xs text-zinc-600">Selecciona una venta para ver el resumen</span>
      </div>
    );
  }

  // Use item (always current) as primary for list-level fields.
  // Only use detail for detail-only fields when it belongs to the currently selected sale.
  const currentDetail = (detail && item && detail.id === item.id) ? detail : null;
  const src = item ?? detail!;

  const itemCount = currentDetail
    ? String(currentDetail.items.length)
    : item?.item_count != null
      ? String(item.item_count)
      : "—";

  return (
    <div className="flex-none border-b border-zinc-800 bg-zinc-900 px-3 py-2 space-y-1.5">

      {/* Fila 1: identidad operativa — 9 slots fijos */}
      <div className="grid grid-cols-9 gap-x-3">

        {/* 1 — Código venta */}
        <div className="min-w-0">
          <span className={labelCls}>Código venta</span>
          <span className={realValCls}>{src?.sale_code ?? "—"}</span>
        </div>

        {/* 2 — Fecha */}
        <div className="min-w-0">
          <span className={labelCls}>Fecha</span>
          <span className={realValCls}>{src?.sale_date_label ?? "—"}</span>
        </div>

        {/* 3 — Cliente */}
        <div className="min-w-0">
          <span className={labelCls}>Cliente</span>
          <span className={src?.customer_name ? realValCls : stubValCls}>
            {src?.customer_name ?? "Consumidor final"}
          </span>
        </div>

        {/* 4 — Estado */}
        <div className="min-w-0">
          <span className={labelCls}>Estado</span>
          {src?.status
            ? <StatusBadge status={src.status} />
            : <span className={stubValCls}>—</span>
          }
        </div>

        {/* 5 — Inventario — slot siempre presente; contenido según estado */}
        <div className="min-w-0">
          <span className={labelCls}>Inventario</span>
          {currentDetail?.status === "CONFIRMED"
            ? currentDetail.inventory_moved
              ? <span className="block text-[10px] text-emerald-400 font-medium truncate">Aplicado</span>
              : <span className="block text-[10px] text-amber-400 font-medium truncate">Pendiente</span>
            : <span className={stubValCls}>—</span>
          }
        </div>

        {/* 6 — Estado pago */}
        <div className="min-w-0">
          <span className={labelCls}>Estado pago</span>
          {src?.payment_status
            ? <PayStatusBadge status={src.payment_status} />
            : <span className={stubValCls}>—</span>
          }
        </div>

        {/* 7 — Cond. operación */}
        <div className="min-w-0">
          <span className={labelCls}>Cond. operación</span>
          <span
            className={currentDetail?.condition_operation_code ? realValCls : stubValCls}
            title={conditionLabel(currentDetail?.condition_operation_code)}
          >
            {conditionLabel(currentDetail?.condition_operation_code)}
          </span>
        </div>

        {/* 8 — Forma de pago */}
        <div className="min-w-0">
          <span className={labelCls}>Forma de pago</span>
          <span
            className={currentDetail?.payment_method_code ? realValCls : stubValCls}
            title={paymentMethodLabel(currentDetail?.payment_method_code)}
          >
            {paymentMethodLabel(currentDetail?.payment_method_code)}
          </span>
        </div>

        {/* 9 — Ítems */}
        <div className="min-w-0">
          <span className={labelCls}>Ítems</span>
          <span className={realValCls}>{itemCount}</span>
        </div>

      </div>

      {/* Fila 2: totales + documental + auditoría — 9 slots fijos */}
      <div className="grid grid-cols-9 gap-x-3">

        {/* 1 — Subtotal */}
        <div className="min-w-0">
          <span className={labelCls}>Subtotal</span>
          <span className={realValCls}>{src ? formatMoney(src.subtotal) : "$0.00"}</span>
        </div>

        {/* 2 — Descuento */}
        <div className="min-w-0">
          <span className={labelCls}>Descuento</span>
          <span className={src?.discount_amount ? realValCls : stubValCls}>
            {src ? formatMoney(src.discount_amount) : "$0.00"}
          </span>
        </div>

        {/* 3 — IVA */}
        <div className="min-w-0">
          <span className={labelCls}>IVA</span>
          <span className={realValCls}>{src ? formatMoney(src.tax_amount) : "$0.00"}</span>
        </div>

        {/* 4 — Total */}
        <div className="min-w-0">
          <span className={labelCls}>Total</span>
          <span className="block text-xs text-zinc-100 font-semibold truncate">
            {src ? formatMoney(src.total_amount) : "$0.00"}
          </span>
        </div>

        {/* 5 — Tipo DTE */}
        <div className="min-w-0">
          <span className={labelCls}>Tipo DTE</span>
          <span className={`font-mono ${src?.primary_dte_type_code ? realValCls : stubValCls}`}>
            {dteTypeLabel(src?.primary_dte_type_code)}
          </span>
        </div>

        {/* 6 — Creado por */}
        <div className="min-w-0">
          <span className={labelCls}>Creado por</span>
          <span className={currentDetail?.created_by_name ? realValCls : stubValCls}>
            {currentDetail?.created_by_name ?? "—"}
          </span>
        </div>

        {/* 7 — Creación */}
        <div className="min-w-0">
          <span className={labelCls}>Creación</span>
          <span className={src?.created_at_label ? realValCls : stubValCls}>
            {src?.created_at_label ?? "—"}
          </span>
        </div>

        {/* 8 — Confirmado */}
        <div className="min-w-0">
          <span className={labelCls}>Confirmado</span>
          <span className={currentDetail?.confirmed_at_label ? realValCls : stubValCls}>
            {currentDetail?.confirmed_at_label ?? "—"}
          </span>
        </div>

        {/* 9 — Notas */}
        <div className="min-w-0">
          <span className={labelCls}>Notas</span>
          <span className={currentDetail?.notes ? realValCls : stubValCls} title={currentDetail?.notes ?? ""}>
            {currentDetail?.notes ?? "—"}
          </span>
        </div>

      </div>
    </div>
  );
}
