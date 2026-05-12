"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — sale-summary-panel.tsx
//
// Panel resumen documental (Bloque B).
// Muestra campos de cabecera de la venta seleccionada.
// ─────────────────────────────────────────────────────────────────

import type { SaleListItem, SaleDetail } from "../types/sale.types";

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
    CONTADO: "Contado",
    CREDITO: "Crédito",
    OTRO:    "Otro",
  };
  return map[code] ?? code;
}

function dteTypeLabel(code: string | null | undefined): string {
  if (!code) return "—";
  const map: Record<string, string> = {
    "01": "FE 01",
    "03": "CCFE 03",
    "04": "NR 04",
    "05": "NC 05",
    "06": "ND 06",
    "07": "CR 07",
    "08": "LFE 08",
    "09": "DL 09",
    "11": "FEX 11",
    "14": "FSE 14",
    "15": "CF 15",
  };
  return map[code] ?? code;
}

function dteStatusLabel(status: string): string {
  const map: Record<string, string> = {
    NOT_REQUIRED:         "No requerido",
    PENDING_GENERATION:   "Pendiente",
    GENERATED:            "Generado",
    SCHEMA_VALIDATED:     "Validado",
    SIGNED:               "Firmado",
    SENT:                 "Enviado",
    ACCEPTED:             "Aceptado",
    REJECTED:             "Rechazado",
    OBSERVED:             "Observado",
    CONTINGENCY_PENDING:  "Contingencia",
    INVALIDATION_PENDING: "Inv. pendiente",
    INVALIDATED:          "Invalidado",
  };
  return map[status] ?? status;
}

function dteStatusCls(status: string): string {
  if (status === "ACCEPTED")  return "text-emerald-400";
  if (status === "REJECTED" || status === "INVALIDATED") return "text-red-400";
  if (status === "SIGNED" || status === "SENT")          return "text-amber-300";
  if (status === "OBSERVED" || status === "CONTINGENCY_PENDING") return "text-orange-400";
  return "text-zinc-400";
}

function plazoLabel(
  term_code:  string | null | undefined,
  term_value: number | null | undefined,
): string {
  if (!term_code && !term_value) return "—";
  if (term_code === "DIAS" && term_value != null) return `${term_value} días`;
  if (term_code === "MESES" && term_value != null) return `${term_value} meses`;
  if (term_value != null) return String(term_value);
  return term_code ?? "—";
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

  const itemCount = detail
    ? String(detail.items.length)
    : item?.item_count != null
      ? String(item.item_count)
      : "—";

  return (
    <div className="flex-none border-b border-zinc-800 bg-zinc-900 px-3 py-2 space-y-1.5">

      {/* Fila 1: identidad documental */}
      <div className="grid grid-cols-8 gap-x-3">

        {/* Código */}
        <div className="min-w-0">
          <span className={labelCls}>Código venta</span>
          <span className={realValCls}>{src?.sale_code ?? "—"}</span>
        </div>

        {/* Fecha */}
        <div className="min-w-0">
          <span className={labelCls}>Fecha</span>
          <span className={realValCls}>{src?.sale_date_label ?? "—"}</span>
        </div>

        {/* Cliente */}
        <div className="min-w-0">
          <span className={labelCls}>Cliente</span>
          <span className={src?.customer_name ? realValCls : stubValCls}>
            {src?.customer_name ?? "Consumidor final"}
          </span>
        </div>

        {/* Estado */}
        <div className="min-w-0">
          <span className={labelCls}>Estado</span>
          {src?.status
            ? <StatusBadge status={src.status} />
            : <span className={stubValCls}>—</span>
          }
        </div>

        {/* Tipo DTE */}
        <div className="min-w-0">
          <span className={labelCls}>Tipo DTE</span>
          <span className={src?.primary_dte_type_code ? realValCls : stubValCls}>
            {dteTypeLabel(src?.primary_dte_type_code)}
          </span>
        </div>

        {/* Condición operación */}
        <div className="min-w-0">
          <span className={labelCls}>Cond. operación</span>
          <span className={detail?.condition_operation_code ? realValCls : stubValCls}>
            {conditionLabel(detail?.condition_operation_code)}
          </span>
        </div>

        {/* Forma de pago */}
        <div className="min-w-0">
          <span className={labelCls}>Forma de pago</span>
          <span className={detail?.payment_method_code ? realValCls : stubValCls}>
            {paymentMethodLabel(detail?.payment_method_code)}
          </span>
        </div>

        {/* Ítems */}
        <div className="min-w-0">
          <span className={labelCls}>Ítems</span>
          <span className={realValCls}>{itemCount}</span>
        </div>

      </div>

      {/* Bloque DTE — visible cuando hay documento fiscal generado */}
      {detail?.dte_document && (
        <div className="border-t border-zinc-800 pt-1.5">
          <div className="grid grid-cols-5 gap-x-3">

            <div className="min-w-0">
              <span className={labelCls}>Estado DTE</span>
              <span className={`block text-xs font-medium truncate ${dteStatusCls(detail.dte_document.dte_status)}`}>
                {dteStatusLabel(detail.dte_document.dte_status)}
              </span>
            </div>

            <div className="min-w-0">
              <span className={labelCls}>Tipo DTE doc.</span>
              <span className="block text-xs text-zinc-300 font-mono truncate">
                {dteTypeLabel(detail.dte_document.dte_type_code)}
              </span>
            </div>

            <div className="min-w-0">
              <span className={labelCls}>Cód. generación</span>
              <span
                className="block text-xs text-amber-400 font-mono truncate"
                title={detail.dte_document.generation_code ?? ""}
              >
                {detail.dte_document.generation_code ?? "—"}
              </span>
            </div>

            <div className="min-w-0">
              <span className={labelCls}>Nº control</span>
              <span
                className="block text-xs text-zinc-300 font-mono truncate"
                title={detail.dte_document.control_number ?? ""}
              >
                {detail.dte_document.control_number ?? "—"}
              </span>
            </div>

            <div className="min-w-0">
              <span className={labelCls}>Sello recepción</span>
              <span
                className="block text-xs text-zinc-400 font-mono truncate"
                title={detail.dte_document.reception_stamp ?? ""}
              >
                {detail.dte_document.reception_stamp ?? "—"}
              </span>
            </div>

          </div>
        </div>
      )}

      {/* Fila 2: totales + auditoría */}
      <div className="grid grid-cols-8 gap-x-3">

        {/* Subtotal */}
        <div className="min-w-0">
          <span className={labelCls}>Subtotal</span>
          <span className={realValCls}>{src ? formatMoney(src.subtotal) : "$0.00"}</span>
        </div>

        {/* Descuento */}
        <div className="min-w-0">
          <span className={labelCls}>Descuento</span>
          <span className={src?.discount_amount ? realValCls : stubValCls}>
            {src ? formatMoney(src.discount_amount) : "$0.00"}
          </span>
        </div>

        {/* IVA */}
        <div className="min-w-0">
          <span className={labelCls}>IVA</span>
          <span className={realValCls}>{src ? formatMoney(src.tax_amount) : "$0.00"}</span>
        </div>

        {/* Total */}
        <div className="min-w-0">
          <span className={labelCls}>Total</span>
          <span className="block text-xs text-zinc-100 font-semibold truncate">
            {src ? formatMoney(src.total_amount) : "$0.00"}
          </span>
        </div>

        {/* Estado pago */}
        <div className="min-w-0">
          <span className={labelCls}>Estado pago</span>
          {src?.payment_status
            ? <PayStatusBadge status={src.payment_status} />
            : <span className={stubValCls}>—</span>
          }
        </div>

        {/* Plazo */}
        <div className="min-w-0">
          <span className={labelCls}>Plazo</span>
          <span className={detail?.payment_term_value != null ? realValCls : stubValCls}>
            {plazoLabel(detail?.payment_term_code, detail?.payment_term_value)}
          </span>
        </div>

        {/* Creado por */}
        <div className="min-w-0">
          <span className={labelCls}>Creado por</span>
          <span className={detail?.created_by_name ? realValCls : stubValCls}>
            {detail?.created_by_name ?? "—"}
          </span>
        </div>

        {/* Notas */}
        <div className="min-w-0">
          <span className={labelCls}>Notas</span>
          <span className={detail?.notes ? realValCls : stubValCls} title={detail?.notes ?? ""}>
            {detail?.notes ?? "—"}
          </span>
        </div>

      </div>
    </div>
  );
}
