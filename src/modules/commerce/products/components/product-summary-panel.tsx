"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/products — product-summary-panel.tsx
//
// Panel de detalle del producto seleccionado.
//
// variant="full"  → grid 3 columnas: identidad | inventario | costos
// variant="panel" → columna única: identidad (scroll) + inventario (fijo 200px)
//
// ProductCostsPricesStrip → strip horizontal exportado para usar
// debajo de la grilla en el layout ERP de products-client.tsx.
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
  variant?: "full" | "panel";
}

// ── Helpers ───────────────────────────────────────────────────────

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

// Formato monetario seguro: siempre punto decimal, siempre 2 decimales, sin dependencia de locale.
function formatMoney(value: number | null | undefined): string {
  if (value == null) return "—";
  return "$" + value.toFixed(2);
}

// Celda de precio para el strip horizontal
function PricePill({
  label,
  value,
  highlighted,
}: {
  label: string;
  value: string;
  highlighted?: boolean;
}) {
  return (
    <div className="shrink-0">
      <p className="text-[10px] text-zinc-400 leading-none mb-1 whitespace-nowrap">{label}</p>
      <p
        className={`font-mono leading-none font-bold ${
          highlighted ? "text-base text-zinc-900" : "text-sm text-zinc-700"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ── Bloque vacío / cargando ───────────────────────────────────────

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

// ── Bloque de identidad (reutilizado en full y panel) ─────────────

interface IdentityBlockProps {
  summary: ProductSummary;
  canManage: boolean;
  onRequestStatusChange: () => void;
  onRequestEdit: () => void;
}

function IdentityBlock({
  summary,
  canManage,
  onRequestStatusChange,
  onRequestEdit,
}: IdentityBlockProps) {
  return (
    <div className="p-4">
      {/* Identidad */}
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

      {/* Acciones */}
      {canManage && (
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={onRequestStatusChange}
            className="flex-1 text-xs border border-zinc-200 rounded-lg py-1.5 text-zinc-600
                       hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
          >
            Cambiar estado
          </button>
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

// ── Strip horizontal de costos y precios (exportado) ──────────────
// Usado debajo de la grilla en el layout ERP de products-client.tsx.

export function ProductCostsPricesStrip({
  summary,
}: {
  summary: ProductSummary | null;
}) {
  if (!summary) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-zinc-300">
        <DollarSign size={12} className="opacity-50" />
        Selecciona un producto para ver costos y precios
      </div>
    );
  }

  // sale_price = precio CON IVA (fuente de verdad). Sin IVA e IVA se derivan.
  const taxRateStrip   = summary.tax_rate ? summary.tax_rate.rate : 13;
  const taxFactorStrip = 1 + taxRateStrip / 100;
  const priceWithIva   = summary.sale_price ?? null;
  const priceSinIva    = priceWithIva !== null
    ? Math.round(priceWithIva / taxFactorStrip * 100) / 100
    : null;
  const ivaAmount      = priceWithIva !== null && priceSinIva !== null
    ? Math.round((priceWithIva - priceSinIva) * 100) / 100
    : null;

  const taxLabel = `IVA (${taxRateStrip}%)`;

  return (
    <div className="flex items-center flex-wrap gap-x-5 gap-y-2 px-4 py-2.5 min-h-[52px]">
      {/* Etiqueta de sección */}
      <div className="flex items-center gap-1.5 shrink-0">
        <DollarSign size={13} className="text-zinc-400" />
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide whitespace-nowrap">
          Costos y precios
        </span>
      </div>

      <div className="hidden sm:block h-5 w-px bg-zinc-200 shrink-0" />

      <PricePill label="Precio unitario" value={formatMoney(summary.cost_price)} />
      <PricePill label="Precio sin IVA"  value={formatMoney(priceSinIva)} />
      <PricePill label={taxLabel}         value={formatMoney(ivaAmount)} />

      <div className="hidden sm:block h-5 w-px bg-zinc-200 shrink-0" />

      <PricePill label="Precio con IVA" value={formatMoney(priceWithIva)} highlighted />
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
  variant = "full",
}: ProductSummaryPanelProps) {
  if (isLoading) return <LoadingPanel />;
  if (!summary) return <EmptyPanel />;

  // ── Modo panel: columna única, identidad (scroll) + inventario (fijo) ──
  if (variant === "panel") {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Identidad + clasificación + logística + acciones */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <IdentityBlock
            summary={summary}
            canManage={canManage}
            onRequestStatusChange={onRequestStatusChange}
            onRequestEdit={onRequestEdit}
          />
        </div>
        {/* Inventario en zona fija inferior */}
        <div className="shrink-0 h-[200px] overflow-y-auto border-t border-zinc-100">
          <InventoryBlock productId={summary.id} />
        </div>
      </div>
    );
  }

  // ── Modo full (por defecto): grid 3 columnas ──────────────────────
  // sale_price = precio CON IVA (fuente de verdad). Sin IVA e IVA se derivan.
  const taxRateFull    = summary.tax_rate ? summary.tax_rate.rate : 13;
  const taxFactorFull  = 1 + taxRateFull / 100;
  const priceWithIvaFull = summary.sale_price ?? null;
  const priceSinIvaFull  = priceWithIvaFull !== null
    ? Math.round(priceWithIvaFull / taxFactorFull * 100) / 100
    : null;
  const ivaAmountFull    = priceWithIvaFull !== null && priceSinIvaFull !== null
    ? Math.round((priceWithIvaFull - priceSinIvaFull) * 100) / 100
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 h-full divide-y lg:divide-y-0 lg:divide-x divide-zinc-100">

      {/* Bloque 1: Identidad + Clasificación + Logística */}
      <div className="overflow-y-auto">
        <IdentityBlock
          summary={summary}
          canManage={canManage}
          onRequestStatusChange={onRequestStatusChange}
          onRequestEdit={onRequestEdit}
        />
      </div>

      {/* Bloque 2: Inventario real */}
      <InventoryBlock productId={summary.id} />

      {/* Bloque 3: Costos y precios */}
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
              ? <span className="font-mono font-semibold">{formatMoney(summary.cost_price)}</span>
              : null
          }
        />
        <FieldRow
          label="Precio sin IVA"
          value={
            priceSinIvaFull !== null
              ? <span className="font-mono font-semibold">{formatMoney(priceSinIvaFull)}</span>
              : null
          }
        />
        <FieldRow
          label={summary.tax_rate ? `${summary.tax_rate.name} (${summary.tax_rate.rate}%)` : "IVA (13%)"}
          value={
            ivaAmountFull !== null
              ? <span className="font-mono font-semibold">{formatMoney(ivaAmountFull)}</span>
              : null
          }
        />
        <FieldRow
          label="Precio con IVA"
          value={
            priceWithIvaFull !== null
              ? <span className="font-mono font-bold text-zinc-900 text-sm">{formatMoney(priceWithIvaFull)}</span>
              : null
          }
        />

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
