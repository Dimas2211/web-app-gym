"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/products — product-summary-panel.tsx
//
// Panel de tres bloques: identidad+logística | inventario | precios.
// El bloque de inventario consulta datos reales de product_locations
// vía GET /api/products/[id]/inventory-summary.
//
// Acción "Editar producto":
//   - Solo visible si canManage && summary !== null
//   - No abre EditProductDialog directamente
//   - Dispara onRequestEdit() → el padre gestiona el flujo key_guard → edit_open
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { PackageSearch, Warehouse, DollarSign, Pencil } from "lucide-react";
import type { ProductSummary } from "../types/product-summary.types";
import type { ProductInventorySummary } from "../queries/get-product-inventory-summary";
import {
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUS_COLORS,
  PRODUCT_TYPE_LABELS,
} from "../utils/product-status.utils";

interface ProductSummaryPanelProps {
  summary: ProductSummary | null;
  isLoading?: boolean;
  canManage: boolean;
  onRequestStatusChange: () => void;
  onRequestEdit: () => void;
}

// ── Sub-bloques ───────────────────────────────────────────────────

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1 text-sm py-0.5">
      <span className="text-zinc-400 text-xs w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-zinc-800 font-medium text-xs flex-1 min-w-0 break-words">
        {value ?? <span className="text-zinc-300">—</span>}
      </span>
    </div>
  );
}

function formatPrice(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-CL", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

// ── Bloque vacío ─────────────────────────────────────────────────

function EmptyPanel() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6 text-zinc-400">
      <PackageSearch size={32} className="mb-2 opacity-30" />
      <p className="text-sm">Selecciona un producto para ver el resumen</p>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="flex items-center justify-center h-full p-6 text-zinc-400 text-sm">
      Cargando…
    </div>
  );
}

// ── Bloque inventario real ────────────────────────────────────────

const ALERT_BADGE: Record<string, string> = {
  OK:    "bg-green-50 text-green-700 border border-green-200",
  LOW:   "bg-amber-50 text-amber-700 border border-amber-200",
  EMPTY: "bg-red-50 text-red-600 border border-red-200",
};

const ALERT_LABEL: Record<string, string> = {
  OK:    "Stock OK",
  LOW:   "Bajo mínimo",
  EMPTY: "Sin existencia",
};

function InventoryDataRows({ inv }: { inv: ProductInventorySummary }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Stock actual",  value: <span className="font-mono">{inv.current_stock}</span> },
    { label: "Stock mínimo",  value: <span className="font-mono">{inv.min_stock}</span> },
    { label: "Pedido usual",  value: <span className="font-mono">{inv.reorder_quantity}</span> },
    { label: "Bodega",        value: inv.warehouse ?? <span className="text-zinc-300">—</span> },
    { label: "Estante",       value: inv.shelf     ?? <span className="text-zinc-300">—</span> },
    ...(inv.position ? [{ label: "Posición", value: inv.position }] : []),
  ];

  return (
    <div className="space-y-1.5">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex justify-between items-center text-xs">
          <span className="text-zinc-400">{label}</span>
          <span className="text-zinc-700 font-medium">{value}</span>
        </div>
      ))}
      <div className="pt-1 flex justify-between items-center text-xs">
        <span className="text-zinc-400">Estado</span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ALERT_BADGE[inv.stock_alert] ?? ""}`}>
          {ALERT_LABEL[inv.stock_alert] ?? inv.stock_alert}
        </span>
      </div>
      {!inv.is_active && (
        <div className="mt-1 text-[10px] text-amber-600 text-right">
          Inactivo en esta sucursal
        </div>
      )}
      <div className="pt-1 text-[10px] text-zinc-300 text-right">
        Act. {inv.updated_at_label}
      </div>
    </div>
  );
}

function InventoryBlock({ productId }: { productId: string }) {
  const [inv, setInv]         = useState<ProductInventorySummary | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setInv(undefined);

    fetch(`/api/products/${productId}/inventory-summary`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ProductInventorySummary | null) => {
        if (!cancelled) setInv(data);
      })
      .catch(() => { if (!cancelled) setInv(null); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [productId]);

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center gap-2 mb-3">
        <Warehouse size={14} className="text-zinc-400" />
        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
          Inventario
        </h4>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-zinc-300">
          Cargando…
        </div>
      ) : inv ? (
        <InventoryDataRows inv={inv} />
      ) : (
        <div className="flex-1 flex items-center justify-center p-4 bg-zinc-50 rounded-lg border border-dashed border-zinc-200">
          <p className="text-xs text-zinc-400 text-center leading-relaxed">
            Este producto todavía no tiene inventario configurado en esta sucursal.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Panel principal ───────────────────────────────────────────────

export function ProductSummaryPanel({
  summary,
  isLoading = false,
  canManage,
  onRequestStatusChange,
  onRequestEdit,
}: ProductSummaryPanelProps) {
  if (isLoading) return <LoadingPanel />;
  if (!summary) return <EmptyPanel />;

  const taxWithIva =
    summary.sale_price !== null && summary.tax_rate
      ? summary.sale_price * (1 + summary.tax_rate.rate / 100)
      : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 h-full divide-y lg:divide-y-0 lg:divide-x divide-zinc-100">

      {/* ── Bloque 1: Identidad + Clasificación + Logística ──────── */}
      <div className="p-4 overflow-y-auto">
        {/* Header de identidad */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="text-xs font-mono text-zinc-400 mb-0.5">{summary.product_code}</p>
            <h3 className="text-sm font-semibold text-zinc-900 leading-snug">{summary.name}</h3>
            {summary.description && (
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed line-clamp-2">
                {summary.description}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                ${PRODUCT_STATUS_COLORS[summary.status]}`}
            >
              {PRODUCT_STATUS_LABELS[summary.status]}
            </span>
            <span className="text-xs text-zinc-400">
              {PRODUCT_TYPE_LABELS[summary.product_type] ?? summary.product_type}
            </span>
          </div>
        </div>

        {/* Flags rápidos */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {summary.is_stockable && (
            <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded-full">
              Controla stock
            </span>
          )}
          {summary.allow_sale && (
            <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
              Venta
            </span>
          )}
          {summary.allow_purchase && (
            <span className="text-xs bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">
              Compra
            </span>
          )}
        </div>

        {/* Clasificación */}
        <div className="mb-3">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
            Clasificación
          </p>
          <FieldRow label="Categoría" value={summary.category.name} />
          <FieldRow label="Línea"     value={summary.line?.name ?? null} />
          <FieldRow label="Sublínea"  value={summary.subline?.name ?? null} />
          <FieldRow label="Marca"     value={summary.brand} />
        </div>

        {/* Logística */}
        <div className="mb-3">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
            Logística
          </p>
          <FieldRow label="Unidad"    value={`${summary.unit.name} (${summary.unit.symbol})`} />
          <FieldRow label="Empaque"   value={summary.package_unit} />
          <FieldRow label="Proveedor" value={summary.supplier?.name ?? null} />
          <FieldRow label="SKU"       value={summary.sku} />
        </div>

        {/* Acciones — solo si tiene permisos y el producto no está descontinuado */}
        {canManage && (
          <div className="flex gap-2 mt-2">
            {summary.status !== "DISCONTINUED" && (
              <button
                type="button"
                onClick={onRequestStatusChange}
                className="flex-1 text-xs border border-zinc-200 rounded-lg py-1.5 text-zinc-600
                           hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
              >
                Cambiar estado
              </button>
            )}
            <button
              type="button"
              onClick={onRequestEdit}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-zinc-200
                         rounded-lg py-1.5 text-zinc-600 hover:border-zinc-900 hover:text-zinc-900
                         hover:bg-zinc-50 transition-colors"
            >
              <Pencil size={11} />
              Editar producto
            </button>
          </div>
        )}
      </div>

      {/* ── Bloque 2: Inventario real ────────────────────────────── */}
      <InventoryBlock productId={summary.id} />

      {/* ── Bloque 3: Costos y precios ────────────────────────────── */}
      <div className="p-4 overflow-y-auto">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign size={14} className="text-zinc-400" />
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            Costos y precios
          </h4>
        </div>

        <FieldRow
          label="Costo unitario"
          value={
            summary.cost_price !== null
              ? <span className="font-mono">{formatPrice(summary.cost_price)}</span>
              : null
          }
        />
        <FieldRow
          label="Precio sin IVA"
          value={
            summary.sale_price !== null
              ? <span className="font-mono">{formatPrice(summary.sale_price)}</span>
              : null
          }
        />
        <FieldRow
          label="Tasa de impuesto"
          value={
            summary.tax_rate
              ? `${summary.tax_rate.name} (${summary.tax_rate.rate}%)`
              : null
          }
        />
        <FieldRow
          label="Precio con IVA"
          value={
            taxWithIva !== null
              ? <span className="font-mono font-semibold text-zinc-900">{formatPrice(taxWithIva)}</span>
              : null
          }
        />

        {/* Margen estimado — stub honesto */}
        <div className="mt-4 p-3 bg-zinc-50 rounded-lg border border-dashed border-zinc-200">
          <p className="text-xs text-zinc-400 text-center">
            Margen estimado disponible en{" "}
            <span className="font-semibold text-zinc-500">Etapa 14</span>
            <br />
            <span className="text-zinc-300">commerce/sales</span>
          </p>
        </div>
      </div>
    </div>
  );
}
