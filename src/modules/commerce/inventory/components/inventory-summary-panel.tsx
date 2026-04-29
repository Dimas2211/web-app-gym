// ─────────────────────────────────────────────────────────────────
// commerce/inventory — inventory-summary-panel.tsx
//
// Panel lateral de contexto dependiente de la fila seleccionada.
// Muestra el estado operativo completo de un ProductLocation.
//
// No edita ningún campo inline.
// Las acciones (movimiento, activar/desactivar) disparan callbacks
// hacia el orquestador padre (inventory-client.tsx, Bloque 9).
//
// Layout: dos bloques verticales — identidad/clasificación | stock/ubicación
// ─────────────────────────────────────────────────────────────────

import { PackageSearch, Warehouse, ArrowUpDown, Power } from "lucide-react";
import type { ProductLocationDetail, StockAlertLevel } from "../types/inventory.types";

// ── Props ─────────────────────────────────────────────────────────

interface InventorySummaryPanelProps {
  detail: ProductLocationDetail | null;
  isLoading?: boolean;
  canManage: boolean;
  onRequestMovement: () => void;
  onRequestStatusChange: () => void;
}

// ── Estilos de alerta de stock ────────────────────────────────────

const ALERT_BADGE: Record<StockAlertLevel, { label: string; cls: string }> = {
  OK:    { label: "Stock OK",    cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  LOW:   { label: "Stock bajo",  cls: "bg-amber-100 text-amber-700 border-amber-200"      },
  EMPTY: { label: "Sin stock",   cls: "bg-red-100 text-red-700 border-red-200"            },
};

// ── Sub-componentes ───────────────────────────────────────────────

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1 py-0.5">
      <span className="text-zinc-400 text-xs w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-zinc-800 font-medium text-xs flex-1 min-w-0 break-words">
        {value ?? <span className="text-zinc-300">—</span>}
      </span>
    </div>
  );
}

function formatStock(value: number): string {
  return new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
}

// ── Paneles de estado vacío / carga ──────────────────────────────

function EmptyPanel() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6 text-zinc-400">
      <PackageSearch size={32} className="mb-2 opacity-30" />
      <p className="text-sm">Selecciona un registro para ver el detalle</p>
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

// ── Componente principal ──────────────────────────────────────────

export function InventorySummaryPanel({
  detail,
  isLoading = false,
  canManage,
  onRequestMovement,
  onRequestStatusChange,
}: InventorySummaryPanelProps) {
  if (isLoading) return <LoadingPanel />;
  if (!detail)   return <EmptyPanel />;

  const alert          = ALERT_BADGE[detail.stock_alert];
  const needsReorder   = detail.current_stock <= detail.min_stock && detail.reorder_quantity > 0;
  const shelfPosition  = [detail.shelf, detail.position].filter(Boolean).join(" / ") || null;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header de identidad ───────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-100 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-mono text-zinc-400 mb-0.5">{detail.product_code}</p>
            <h3 className="text-sm font-semibold text-zinc-900 leading-snug">
              {detail.product_name}
            </h3>
            {detail.product_description && (
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed line-clamp-2">
                {detail.product_description}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {/* Alerta de stock */}
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${alert.cls}`}
            >
              {alert.label}
            </span>
            {/* Activación en esta location */}
            <span className="flex items-center gap-1 text-xs text-zinc-400">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  detail.is_active ? "bg-emerald-500" : "bg-zinc-300"
                }`}
              />
              {detail.is_active ? "Activo" : "Inactivo"}
            </span>
          </div>
        </div>

        {/* Clasificación en una línea */}
        <p className="text-xs text-zinc-400 mt-2">
          {detail.category_name}
          {detail.line_name ? ` · ${detail.line_name}` : ""}
          {" · "}{detail.unit_symbol}
        </p>
      </div>

      {/* ── Cuerpo principal: dos secciones con scroll ────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Bloque 1: Stock operativo ────────────────────────────── */}
        <div className="px-4 py-3 border-b border-zinc-100">
          <div className="flex items-center gap-2 mb-2">
            <Warehouse size={13} className="text-zinc-400" />
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Stock operativo
            </h4>
          </div>

          {/* Métricas de stock */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="text-center p-2 bg-zinc-50 rounded-lg">
              <p className="text-xs text-zinc-400 mb-0.5">Actual</p>
              <p className={`text-base font-mono font-bold ${
                detail.stock_alert === "EMPTY"
                  ? "text-red-600"
                  : detail.stock_alert === "LOW"
                  ? "text-amber-600"
                  : "text-zinc-900"
              }`}>
                {formatStock(detail.current_stock)}
              </p>
            </div>
            <div className="text-center p-2 bg-zinc-50 rounded-lg">
              <p className="text-xs text-zinc-400 mb-0.5">Mínimo</p>
              <p className="text-base font-mono font-bold text-zinc-700">
                {formatStock(detail.min_stock)}
              </p>
            </div>
            <div className="text-center p-2 bg-zinc-50 rounded-lg">
              <p className="text-xs text-zinc-400 mb-0.5">Reorden</p>
              <p className="text-base font-mono font-bold text-zinc-700">
                {formatStock(detail.reorder_quantity)}
              </p>
            </div>
          </div>

          {/* Sugerencia de reposición */}
          {needsReorder && (
            <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">
                <span className="font-semibold">Reponer pronto</span>
                {" — cantidad sugerida: "}
                <span className="font-mono font-semibold">
                  {formatStock(detail.reorder_quantity)} {detail.unit_symbol}
                </span>
              </p>
            </div>
          )}

          <FieldRow label="SKU"       value={detail.sku} />
          <FieldRow label="Proveedor" value={detail.supplier_name} />
          <FieldRow label="Marca"     value={detail.brand} />
        </div>

        {/* ── Bloque 2: Ubicación física ───────────────────────────── */}
        <div className="px-4 py-3 border-b border-zinc-100">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
            Ubicación
          </h4>
          <FieldRow label="Almacén"      value={detail.warehouse} />
          <FieldRow label="Estante/Pos." value={shelfPosition} />
        </div>

        {/* ── Bloque 3: Auditoría ──────────────────────────────────── */}
        <div className="px-4 py-3">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
            Auditoría
          </h4>
          <FieldRow
            label="Actualizado"
            value={<span className="font-mono">{detail.updated_at_label}</span>}
          />
          <FieldRow
            label="Creado"
            value={<span className="font-mono">{detail.created_at_label}</span>}
          />
        </div>
      </div>

      {/* ── Footer: acciones ─────────────────────────────────────── */}
      {canManage && (
        <div className="px-4 py-3 border-t border-zinc-100 shrink-0 space-y-2">
          {/* Registrar movimiento — solo si el registro está activo */}
          <button
            type="button"
            onClick={onRequestMovement}
            disabled={!detail.is_active}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium
                       rounded-lg bg-zinc-900 text-white hover:bg-zinc-800
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={!detail.is_active ? "Reactiva este registro para registrar movimientos" : undefined}
          >
            <ArrowUpDown size={13} />
            Registrar movimiento
          </button>

          {/* Activar / desactivar */}
          <button
            type="button"
            onClick={onRequestStatusChange}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium
                       rounded-lg border border-zinc-200 text-zinc-600
                       hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
          >
            <Power size={13} />
            {detail.is_active ? "Desactivar registro" : "Activar registro"}
          </button>
        </div>
      )}
    </div>
  );
}
