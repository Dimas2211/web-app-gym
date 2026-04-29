"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/products — product-traceability-tabs.tsx
//
// Pestañas de trazabilidad del producto seleccionado.
// - Ventas y movimientos mantienen stub NOT_IMPLEMENTED.
// - Compras / Entradas muestra historial real vía
//   GET /api/products/[id]/purchase-history
// - Grupos muestra la jerarquía del catálogo del producto.
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { ShoppingCart, ShoppingBag, BarChart2, Layers, FileText } from "lucide-react";
import type { ProductSummary } from "../types/product-summary.types";
import type { ProductPurchaseHistoryRow } from "../queries/get-product-purchase-history";
import type { InventoryMovementItem } from "../../inventory/types/inventory-movement.types";

type TabId = "resumen" | "ventas" | "compras" | "movimientos" | "grupos";

interface ProductTraceabilityTabsProps {
  summary: ProductSummary | null;
}

// ── Componente de stub honesto ────────────────────────────────────

function TraceabilityStub({
  icon: Icon,
  moduleName,
  availableInStage,
}: {
  icon: React.ElementType;
  moduleName: string;
  availableInStage: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-8 text-center text-zinc-400">
      <Icon size={28} className="mb-2 opacity-25" />
      <p className="text-sm">
        El historial de{" "}
        <span className="font-medium text-zinc-500">{moduleName}</span>{" "}
        estará disponible cuando se implemente este módulo.
      </p>
      <p className="text-xs mt-1 text-zinc-300">{availableInStage}</p>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("es-CL");
}

function fmtAmount(n: number): string {
  return n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT:     "Borrador",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
};

const STATUS_CLS: Record<string, string> = {
  DRAFT:     "bg-zinc-100 text-zinc-500",
  CONFIRMED: "bg-green-50 text-green-700",
  CANCELLED: "bg-red-50 text-red-500",
};

// ── Pestaña Compras / Entradas ────────────────────────────────────

function ComprasTab({ productId }: { productId: string }) {
  const [rows, setRows]       = useState<ProductPurchaseHistoryRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRows(null);

    fetch(`/api/products/${productId}/purchase-history`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ProductPurchaseHistoryRow[]) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [productId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-zinc-300">
        Cargando historial de compras…
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-zinc-400">
        <ShoppingBag size={28} className="mb-2 opacity-25" />
        <p className="text-sm">Este producto todavía no tiene compras registradas.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-100 text-zinc-400 font-medium">
            <th className="text-left px-3 py-2 whitespace-nowrap">Fecha</th>
            <th className="text-left px-3 py-2 whitespace-nowrap">Documento</th>
            <th className="text-left px-3 py-2 whitespace-nowrap">Proveedor</th>
            <th className="text-right px-3 py-2 whitespace-nowrap">Cantidad</th>
            <th className="text-right px-3 py-2 whitespace-nowrap">Costo unit.</th>
            <th className="text-right px-3 py-2 whitespace-nowrap">Gravada</th>
            <th className="text-right px-3 py-2 whitespace-nowrap">IVA</th>
            <th className="text-right px-3 py-2 whitespace-nowrap">Total</th>
            <th className="text-left px-3 py-2 whitespace-nowrap">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const doc = r.document_number ?? r.purchase_code;
            const stCls = STATUS_CLS[r.status] ?? "bg-zinc-100 text-zinc-500";
            return (
              <tr key={r.purchase_item_id} className="border-b border-zinc-50 hover:bg-zinc-50">
                <td className="px-3 py-1.5 whitespace-nowrap text-zinc-600">{fmtDate(r.purchase_date)}</td>
                <td className="px-3 py-1.5 whitespace-nowrap font-mono text-zinc-600">{doc}</td>
                <td className="px-3 py-1.5 whitespace-nowrap text-zinc-700">{r.supplier_name}</td>
                <td className="px-3 py-1.5 text-right text-zinc-700">{fmtAmount(r.quantity)}</td>
                <td className="px-3 py-1.5 text-right text-zinc-600">{fmtAmount(r.unit_cost)}</td>
                <td className="px-3 py-1.5 text-right text-zinc-600">{fmtAmount(r.line_subtotal)}</td>
                <td className="px-3 py-1.5 text-right text-zinc-600">{fmtAmount(r.tax_amount)}</td>
                <td className="px-3 py-1.5 text-right font-medium text-zinc-800">{fmtAmount(r.line_total)}</td>
                <td className="px-3 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${stCls}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Pestaña Movimientos ───────────────────────────────────────────

const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  INITIAL_LOAD:    "Carga inicial",
  MANUAL_IN:       "Entrada manual",
  MANUAL_OUT:      "Salida manual",
  ADJUSTMENT_UP:   "Ajuste positivo",
  ADJUSTMENT_DOWN: "Ajuste negativo",
  PURCHASE_IN:     "Entrada por compra",
  SALE_OUT:        "Salida por venta",
  TRANSFER_IN:     "Transf. entrada",
  TRANSFER_OUT:    "Transf. salida",
  RETURN_IN:       "Devolución entrada",
  RETURN_OUT:      "Devolución salida",
};

function MovimientosTab({ productId }: { productId: string }) {
  const [items, setItems]   = useState<InventoryMovementItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setItems(null);

    fetch(`/api/inventory/movements?product_id=${productId}&page_size=100`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items: InventoryMovementItem[] }) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [productId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-zinc-300">
        Cargando historial de movimientos…
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-zinc-400">
        <BarChart2 size={28} className="mb-2 opacity-25" />
        <p className="text-sm">Este producto todavía no tiene movimientos de inventario registrados.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-100 text-zinc-400 font-medium">
            <th className="text-left px-3 py-2 whitespace-nowrap">Fecha</th>
            <th className="text-left px-3 py-2 whitespace-nowrap">Tipo</th>
            <th className="text-left px-3 py-2 whitespace-nowrap">Dirección</th>
            <th className="text-right px-3 py-2 whitespace-nowrap">Cantidad</th>
            <th className="text-right px-3 py-2 whitespace-nowrap">Stock ant.</th>
            <th className="text-right px-3 py-2 whitespace-nowrap">Stock result.</th>
            <th className="text-right px-3 py-2 whitespace-nowrap">Costo unit.</th>
            <th className="text-left px-3 py-2 whitespace-nowrap">Referencia</th>
            <th className="text-left px-3 py-2 whitespace-nowrap">Notas</th>
            <th className="text-left px-3 py-2 whitespace-nowrap">Usuario</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => {
            const isAdditive = m.movement_direction === "ADDITIVE";
            return (
              <tr key={m.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                <td className="px-3 py-1.5 whitespace-nowrap text-zinc-500">{m.created_at_label}</td>
                <td className="px-3 py-1.5 whitespace-nowrap text-zinc-700">
                  {MOVEMENT_TYPE_LABEL[m.movement_type] ?? m.movement_type}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${isAdditive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-500"}`}>
                    {isAdditive ? "Entrada" : "Salida"}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right font-medium text-zinc-800">{fmtAmount(m.quantity)}</td>
                <td className="px-3 py-1.5 text-right text-zinc-500">{fmtAmount(m.stock_before)}</td>
                <td className="px-3 py-1.5 text-right text-zinc-700">{fmtAmount(m.resulting_stock)}</td>
                <td className="px-3 py-1.5 text-right text-zinc-500">
                  {m.unit_cost != null ? fmtAmount(m.unit_cost) : "—"}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap font-mono text-zinc-500">
                  {m.reference_code ?? "—"}
                </td>
                <td className="px-3 py-1.5 text-zinc-500 max-w-[160px] truncate">
                  {m.notes ?? "—"}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-zinc-500">
                  {m.performed_by_name ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Pestaña Resumen ───────────────────────────────────────────────

function ResumenTab({ summary }: { summary: ProductSummary }) {
  return (
    <div className="p-4 text-sm text-zinc-600 space-y-1">
      <p>
        <span className="text-zinc-400 text-xs w-32 inline-block">Código</span>
        <span className="font-mono">{summary.product_code}</span>
      </p>
      <p>
        <span className="text-zinc-400 text-xs w-32 inline-block">Nombre</span>
        {summary.name}
      </p>
      <p>
        <span className="text-zinc-400 text-xs w-32 inline-block">Tipo</span>
        {summary.product_type}
      </p>
      <p>
        <span className="text-zinc-400 text-xs w-32 inline-block">Estado</span>
        {summary.status}
      </p>
      <p>
        <span className="text-zinc-400 text-xs w-32 inline-block">Proveedor</span>
        {summary.supplier?.name ?? "—"}
      </p>
      <p>
        <span className="text-zinc-400 text-xs w-32 inline-block">SKU</span>
        <span className="font-mono">{summary.sku ?? "—"}</span>
      </p>
    </div>
  );
}

// ── Pestaña Grupos ────────────────────────────────────────────────

function GruposTab({ summary }: { summary: ProductSummary }) {
  return (
    <div className="p-4">
      <div className="flex items-start gap-2 text-sm">
        <div className="space-y-3">
          {/* Categoría */}
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-zinc-700 shrink-0" />
            <div>
              <p className="text-xs text-zinc-400">Categoría</p>
              <p className="text-sm font-medium text-zinc-800">
                {summary.category.name}
                <span className="ml-2 font-mono text-xs text-zinc-400">
                  {summary.category.code}
                </span>
              </p>
            </div>
          </div>

          {/* Línea */}
          <div className="flex items-center gap-2 ml-4">
            <span className="w-2 h-2 rounded-full bg-zinc-400 shrink-0" />
            <div>
              <p className="text-xs text-zinc-400">Línea</p>
              {summary.line ? (
                <p className="text-sm text-zinc-700">{summary.line.name}</p>
              ) : (
                <p className="text-xs text-zinc-300">Sin línea</p>
              )}
            </div>
          </div>

          {/* Sublínea */}
          <div className="flex items-center gap-2 ml-8">
            <span className="w-2 h-2 rounded-full bg-zinc-200 shrink-0" />
            <div>
              <p className="text-xs text-zinc-400">Sublínea</p>
              {summary.subline ? (
                <p className="text-sm text-zinc-700">{summary.subline.name}</p>
              ) : (
                <p className="text-xs text-zinc-300">Sin sublínea</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────

export function ProductTraceabilityTabs({ summary }: ProductTraceabilityTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("resumen");

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "resumen",      label: "Resumen",           icon: FileText   },
    { id: "ventas",       label: "Ventas",             icon: ShoppingCart },
    { id: "compras",      label: "Compras / Entradas", icon: ShoppingBag },
    { id: "movimientos",  label: "Movimientos",        icon: BarChart2  },
    { id: "grupos",       label: "Grupos",             icon: Layers     },
  ];

  const tabCls = (id: TabId) =>
    `flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ` +
    (activeTab === id
      ? "border-zinc-900 text-zinc-900"
      : "border-transparent text-zinc-400 hover:text-zinc-600 hover:border-zinc-300");

  if (!summary) {
    return (
      <div className="border-t border-zinc-100 flex items-center justify-center py-4 text-xs text-zinc-300">
        Selecciona un producto para ver trazabilidad
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-200 flex flex-col min-h-0">
      {/* Barra de pestañas */}
      <div className="flex overflow-x-auto border-b border-zinc-100 bg-white shrink-0 px-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={tabCls(id)}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Contenido de la pestaña activa */}
      <div className="flex-1 overflow-auto min-h-[120px]">
        {activeTab === "resumen" && <ResumenTab summary={summary} />}

        {activeTab === "ventas" && (
          <TraceabilityStub
            icon={ShoppingCart}
            moduleName="ventas"
            availableInStage={summary.traceability.sales.availableInStage + " — " + summary.traceability.sales.moduleName}
          />
        )}

        {activeTab === "compras" && (
          <ComprasTab productId={summary.id} />
        )}

        {activeTab === "movimientos" && (
          <MovimientosTab productId={summary.id} />
        )}

        {activeTab === "grupos" && <GruposTab summary={summary} />}
      </div>
    </div>
  );
}
