"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/reports — commerce-tabular-reports.tsx
//
// Zona de reportes tabulares debajo de las gráficas del dashboard.
// Cinco pestañas cargadas bajo demanda.
// ─────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef } from "react";
import { Loader2, FileSpreadsheet, FileText } from "lucide-react";
import type {
  SalesLineReportRow,
  PurchasesLineReportRow,
  ProductSummaryRow,
  CustomerSummaryRow,
  SupplierSummaryRow,
} from "../types/commerce-report.types";
import { formatCurrency } from "../utils/report-number-format";
import {
  exportSalesExcel,
  exportPurchasesExcel,
  exportProductsExcel,
  exportCustomersExcel,
  exportSuppliersExcel,
} from "../utils/export-report-excel";
import {
  exportSalesPdf,
  exportPurchasesPdf,
  exportProductsPdf,
  exportCustomersPdf,
  exportSuppliersPdf,
} from "../utils/export-report-pdf";

// ── types ────────────────────────────────────────────────────────

import type { TabularFilters } from "../types/commerce-report.types";
export type { TabularFilters };

type TabId = "sales" | "purchases" | "products" | "customers" | "suppliers";

interface TabMeta {
  id:    TabId;
  label: string;
}

const TABS: TabMeta[] = [
  { id: "sales",     label: "Ventas detalle" },
  { id: "purchases", label: "Compras detalle" },
  { id: "products",  label: "Productos" },
  { id: "customers", label: "Clientes" },
  { id: "suppliers", label: "Proveedores" },
];

// ── shared primitives ─────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
      {message}
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-zinc-400">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-sm">Cargando…</span>
    </div>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <div className="rounded border border-rose-800 bg-rose-900/20 p-3 text-sm text-rose-400">
      {message}
    </div>
  );
}

function RowCount({ count }: { count: number }) {
  return (
    <p className="text-xs text-zinc-500 mb-2">
      {count} {count === 1 ? "registro" : "registros"}
    </p>
  );
}

// ── table shell ───────────────────────────────────────────────────

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto max-h-[520px] overflow-y-auto border border-zinc-800 rounded">
      <table className="w-full text-xs text-left border-collapse">
        {children}
      </table>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`sticky top-0 z-10 bg-zinc-900 border-b border-zinc-700 px-3 py-2 font-semibold text-zinc-400 whitespace-nowrap ${right ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}

function Td({ children, right, mono, dim }: { children: React.ReactNode; right?: boolean; mono?: boolean; dim?: boolean }) {
  return (
    <td
      className={`border-b border-zinc-800/60 px-3 py-1.5 whitespace-nowrap ${right ? "text-right" : ""} ${mono ? "font-mono" : ""} ${dim ? "text-zinc-500" : "text-zinc-200"}`}
    >
      {children}
    </td>
  );
}

function TotalRow({ children }: { children: React.ReactNode }) {
  return (
    <tr className="bg-zinc-800/40 font-semibold text-zinc-200 sticky bottom-0">
      {children}
    </tr>
  );
}

// ── format helpers ────────────────────────────────────────────────

const c = (v: number | null | undefined) =>
  v != null ? formatCurrency(v) : "—";
const n = (v: number | null | undefined, d = 2) =>
  v != null ? v.toFixed(d) : "—";

// ── Sales lines ───────────────────────────────────────────────────

function SalesLinesTable({ rows }: { rows: SalesLineReportRow[] }) {
  if (!rows.length) return <EmptyState message="Sin líneas de venta en el período." />;

  const totQty      = rows.reduce((s, r) => s + r.quantity, 0);
  const totSubtotal = rows.reduce((s, r) => s + r.line_subtotal, 0);
  const totTax      = rows.reduce((s, r) => s + r.tax_amount, 0);
  const totTotal    = rows.reduce((s, r) => s + r.line_total, 0);
  const totCost     = rows.reduce((s, r) => s + (r.cost_estimate ?? 0), 0);
  const totMargin   = rows.reduce((s, r) => s + (r.margin_estimate ?? 0), 0);
  const hasCost     = rows.some((r) => r.cost_estimate !== null);

  return (
    <TableShell>
      <thead>
        <tr>
          <Th>Fecha</Th>
          <Th>N° Venta</Th>
          <Th>Cliente</Th>
          <Th>Tipo</Th>
          <Th>Código</Th>
          <Th>Producto / Servicio</Th>
          <Th>Categoría</Th>
          <Th>Línea</Th>
          <Th right>Cant.</Th>
          <Th right>P. Unit.</Th>
          <Th right>Subtotal</Th>
          <Th right>IVA</Th>
          <Th right>Total</Th>
          {hasCost && <Th right>Costo est.</Th>}
          {hasCost && <Th right>Margen est.</Th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-zinc-800/30">
            <Td dim>{r.sale_date}</Td>
            <Td mono>{r.sale_code}</Td>
            <Td>{r.customer_name ?? <span className="text-zinc-600">—</span>}</Td>
            <Td dim>{r.product_type === "SERVICE" ? "Serv." : "Prod."}</Td>
            <Td mono dim>{r.product_code}</Td>
            <Td>{r.product_name}</Td>
            <Td dim>{r.category_name ?? "—"}</Td>
            <Td dim>{r.line_name ?? "—"}</Td>
            <Td right mono>{n(r.quantity, r.quantity % 1 === 0 ? 0 : 2)}</Td>
            <Td right mono>{c(r.unit_price)}</Td>
            <Td right mono>{c(r.line_subtotal)}</Td>
            <Td right mono>{c(r.tax_amount)}</Td>
            <Td right mono>{c(r.line_total)}</Td>
            {hasCost && <Td right mono dim>{c(r.cost_estimate)}</Td>}
            {hasCost && (
              <Td right mono>
                <span className={r.margin_estimate != null && r.margin_estimate < 0 ? "text-rose-400" : "text-emerald-400"}>
                  {c(r.margin_estimate)}
                </span>
              </Td>
            )}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <TotalRow>
          <td colSpan={hasCost ? 8 : 8} className="px-3 py-2 text-zinc-400 text-xs">TOTAL</td>
          <Td right mono>{n(totQty, 0)}</Td>
          <Td right>—</Td>
          <Td right mono>{c(totSubtotal)}</Td>
          <Td right mono>{c(totTax)}</Td>
          <Td right mono>{c(totTotal)}</Td>
          {hasCost && <Td right mono>{c(totCost)}</Td>}
          {hasCost && (
            <Td right mono>
              <span className={totMargin < 0 ? "text-rose-400" : "text-emerald-400"}>
                {c(totMargin)}
              </span>
            </Td>
          )}
        </TotalRow>
      </tfoot>
    </TableShell>
  );
}

// ── Purchase lines ────────────────────────────────────────────────

function PurchaseLinesTable({ rows }: { rows: PurchasesLineReportRow[] }) {
  if (!rows.length) return <EmptyState message="Sin líneas de compra en el período." />;

  const totQty      = rows.reduce((s, r) => s + r.quantity, 0);
  const totSubtotal = rows.reduce((s, r) => s + r.line_subtotal, 0);
  const totTax      = rows.reduce((s, r) => s + r.tax_amount, 0);
  const totTotal    = rows.reduce((s, r) => s + r.line_total, 0);

  return (
    <TableShell>
      <thead>
        <tr>
          <Th>Fecha</Th>
          <Th>N° Compra</Th>
          <Th>Proveedor</Th>
          <Th>Código</Th>
          <Th>Producto</Th>
          <Th>Categoría</Th>
          <Th>Línea</Th>
          <Th right>Cant.</Th>
          <Th right>C. Unit.</Th>
          <Th right>Subtotal</Th>
          <Th right>IVA</Th>
          <Th right>Total</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-zinc-800/30">
            <Td dim>{r.purchase_date}</Td>
            <Td mono>{r.purchase_code}</Td>
            <Td>{r.supplier_name}</Td>
            <Td mono dim>{r.product_code}</Td>
            <Td>{r.product_name}</Td>
            <Td dim>{r.category_name ?? "—"}</Td>
            <Td dim>{r.line_name ?? "—"}</Td>
            <Td right mono>{n(r.quantity, r.quantity % 1 === 0 ? 0 : 2)}</Td>
            <Td right mono>{c(r.unit_cost)}</Td>
            <Td right mono>{c(r.line_subtotal)}</Td>
            <Td right mono>{c(r.tax_amount)}</Td>
            <Td right mono>{c(r.line_total)}</Td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <TotalRow>
          <td colSpan={7} className="px-3 py-2 text-zinc-400 text-xs">TOTAL</td>
          <Td right mono>{n(totQty, 0)}</Td>
          <Td right>—</Td>
          <Td right mono>{c(totSubtotal)}</Td>
          <Td right mono>{c(totTax)}</Td>
          <Td right mono>{c(totTotal)}</Td>
        </TotalRow>
      </tfoot>
    </TableShell>
  );
}

// ── Product summary ───────────────────────────────────────────────

function ProductSummaryTable({ rows }: { rows: ProductSummaryRow[] }) {
  if (!rows.length) return <EmptyState message="Sin movimientos de producto en el período." />;

  const hasCost   = rows.some((r) => r.cost_avg !== null);
  const hasMargin = rows.some((r) => r.margin_estimate !== null);
  const totSold   = rows.reduce((s, r) => s + r.amount_sold, 0);
  const totPurch  = rows.reduce((s, r) => s + r.amount_purchased, 0);
  const totMargin = rows.reduce((s, r) => s + (r.margin_estimate ?? 0), 0);

  return (
    <TableShell>
      <thead>
        <tr>
          <Th>Código</Th>
          <Th>Producto</Th>
          <Th>Tipo</Th>
          <Th>Categoría</Th>
          <Th>Línea</Th>
          <Th right>Cant. vendida</Th>
          <Th right>Monto vendido</Th>
          <Th right>Cant. comprada</Th>
          <Th right>Monto comprado</Th>
          {hasCost   && <Th right>Costo prom.</Th>}
          {hasMargin && <Th right>Margen est.</Th>}
          <Th>Últ. venta</Th>
          <Th>Últ. compra</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.product_id} className="hover:bg-zinc-800/30">
            <Td mono dim>{r.product_code}</Td>
            <Td>{r.product_name}</Td>
            <Td dim>{r.product_type === "SERVICE" ? "Serv." : "Prod."}</Td>
            <Td dim>{r.category_name ?? "—"}</Td>
            <Td dim>{r.line_name ?? "—"}</Td>
            <Td right mono>{n(r.qty_sold, r.qty_sold % 1 === 0 ? 0 : 2)}</Td>
            <Td right mono>{c(r.amount_sold)}</Td>
            <Td right mono>{n(r.qty_purchased, r.qty_purchased % 1 === 0 ? 0 : 2)}</Td>
            <Td right mono>{c(r.amount_purchased)}</Td>
            {hasCost && <Td right mono dim>{c(r.cost_avg)}</Td>}
            {hasMargin && (
              <Td right mono>
                <span className={r.margin_estimate != null && r.margin_estimate < 0 ? "text-rose-400" : "text-emerald-400"}>
                  {c(r.margin_estimate)}
                </span>
              </Td>
            )}
            <Td dim>{r.last_sale_date ?? "—"}</Td>
            <Td dim>{r.last_purchase_date ?? "—"}</Td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <TotalRow>
          <td colSpan={5} className="px-3 py-2 text-zinc-400 text-xs">TOTAL</td>
          <Td right>—</Td>
          <Td right mono>{c(totSold)}</Td>
          <Td right>—</Td>
          <Td right mono>{c(totPurch)}</Td>
          {hasCost   && <Td right>—</Td>}
          {hasMargin && (
            <Td right mono>
              <span className={totMargin < 0 ? "text-rose-400" : "text-emerald-400"}>
                {c(totMargin)}
              </span>
            </Td>
          )}
          <td colSpan={2} />
        </TotalRow>
      </tfoot>
    </TableShell>
  );
}

// ── Customer summary ──────────────────────────────────────────────

function CustomerSummaryTable({ rows }: { rows: CustomerSummaryRow[] }) {
  if (!rows.length) return <EmptyState message="Sin ventas a clientes en el período." />;

  const totAmount = rows.reduce((s, r) => s + r.total_amount, 0);
  const totCount  = rows.reduce((s, r) => s + r.sale_count, 0);

  return (
    <TableShell>
      <thead>
        <tr>
          <Th>Cliente</Th>
          <Th right>N° ventas</Th>
          <Th right>Total vendido</Th>
          <Th right>Ticket prom.</Th>
          <Th>Última venta</Th>
          <Th>Prod./Serv. más comprado</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.customer_id ?? `__null_${i}`} className="hover:bg-zinc-800/30">
            <Td>{r.customer_name}</Td>
            <Td right mono>{r.sale_count}</Td>
            <Td right mono>{c(r.total_amount)}</Td>
            <Td right mono>{c(r.avg_ticket)}</Td>
            <Td dim>{r.last_sale_date ?? "—"}</Td>
            <Td dim>{r.top_product_name ?? "—"}</Td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <TotalRow>
          <td className="px-3 py-2 text-zinc-400 text-xs">TOTAL</td>
          <Td right mono>{totCount}</Td>
          <Td right mono>{c(totAmount)}</Td>
          <Td right mono>{totCount > 0 ? c(totAmount / totCount) : "—"}</Td>
          <td colSpan={2} />
        </TotalRow>
      </tfoot>
    </TableShell>
  );
}

// ── Supplier summary ──────────────────────────────────────────────

function SupplierSummaryTable({ rows }: { rows: SupplierSummaryRow[] }) {
  if (!rows.length) return <EmptyState message="Sin compras a proveedores en el período." />;

  const totAmount = rows.reduce((s, r) => s + r.total_amount, 0);
  const totCount  = rows.reduce((s, r) => s + r.purchase_count, 0);

  return (
    <TableShell>
      <thead>
        <tr>
          <Th>Proveedor</Th>
          <Th right>N° compras</Th>
          <Th right>Total comprado</Th>
          <Th>Producto más comprado</Th>
          <Th>Última compra</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.supplier_id} className="hover:bg-zinc-800/30">
            <Td>{r.supplier_name}</Td>
            <Td right mono>{r.purchase_count}</Td>
            <Td right mono>{c(r.total_amount)}</Td>
            <Td dim>{r.top_product_name ?? "—"}</Td>
            <Td dim>{r.last_purchase_date ?? "—"}</Td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <TotalRow>
          <td className="px-3 py-2 text-zinc-400 text-xs">TOTAL</td>
          <Td right mono>{totCount}</Td>
          <Td right mono>{c(totAmount)}</Td>
          <td colSpan={2} />
        </TotalRow>
      </tfoot>
    </TableShell>
  );
}

// ── State per tab ─────────────────────────────────────────────────

interface TabState<T> {
  data:    T[] | null;
  loading: boolean;
  error:   string | null;
}

function initTab<T>(): TabState<T> {
  return { data: null, loading: false, error: null };
}

function serializeFilters(f: TabularFilters): string {
  return JSON.stringify({
    date_from:    f.date_from,
    date_to:      f.date_to,
    customer_id:  f.customer_id  ?? "",
    supplier_id:  f.supplier_id  ?? "",
    product_id:   f.product_id   ?? "",
    product_type: f.product_type ?? "",
    limit:        f.limit        ?? 500,
  });
}

// ── Main component ────────────────────────────────────────────────

interface Props {
  filters: TabularFilters;
}

export function CommerceTabularReports({ filters }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("sales");

  const [salesState,     setSalesState]     = useState<TabState<SalesLineReportRow>>(initTab());
  const [purchasesState, setPurchasesState] = useState<TabState<PurchasesLineReportRow>>(initTab());
  const [productsState,  setProductsState]  = useState<TabState<ProductSummaryRow>>(initTab());
  const [customersState, setCustomersState] = useState<TabState<CustomerSummaryRow>>(initTab());
  const [suppliersState, setSuppliersState] = useState<TabState<SupplierSummaryRow>>(initTab());

  const [exporting,    setExporting]    = useState<"xlsx" | "pdf" | null>(null);
  const [exportError,  setExportError]  = useState<string | null>(null);

  // Track which filters were used for the data currently shown
  const appliedKeyRef = useRef<string>("");
  const currentKey    = serializeFilters(filters);
  const hasPending    = appliedKeyRef.current !== "" && appliedKeyRef.current !== currentKey;

  const buildParams = useCallback((f: TabularFilters) => {
    const p = new URLSearchParams({
      date_from: f.date_from,
      date_to:   f.date_to,
    });
    if (f.customer_id)  p.set("customer_id",  f.customer_id);
    if (f.supplier_id)  p.set("supplier_id",  f.supplier_id);
    if (f.product_id)   p.set("product_id",   f.product_id);
    if (f.product_type) p.set("product_type", f.product_type);
    if (f.limit)        p.set("limit",        String(f.limit));
    return p;
  }, []);

  function clearAllCaches() {
    setSalesState(initTab());
    setPurchasesState(initTab());
    setProductsState(initTab());
    setCustomersState(initTab());
    setSuppliersState(initTab());
  }

  async function loadTab(tabId: TabId, forceReload = false) {
    setActiveTab(tabId);
    const params = buildParams(filters);

    async function fetchTab<T>(
      url: string,
      getter: TabState<T>,
      setter: React.Dispatch<React.SetStateAction<TabState<T>>>,
    ) {
      if (!forceReload && getter.data !== null) return; // use cached data
      setter((s) => ({ ...s, loading: true, error: null }));
      try {
        const res  = await fetch(`${url}?${params}`);
        const text = await res.text();
        if (!text) {
          setter({ data: null, loading: false, error: `El endpoint respondió vacío (HTTP ${res.status})` });
          return;
        }
        let body: { rows?: T[]; error?: string };
        try {
          body = JSON.parse(text) as { rows?: T[]; error?: string };
        } catch {
          setter({ data: null, loading: false, error: `Respuesta no es JSON (HTTP ${res.status}): ${text.slice(0, 300)}` });
          return;
        }
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setter({ data: body.rows ?? [], loading: false, error: null });
      } catch (e) {
        setter({ data: null, loading: false, error: e instanceof Error ? e.message : "Error" });
      }
    }

    switch (tabId) {
      case "sales":
        await fetchTab("/api/reports/commerce/sales-lines", salesState, setSalesState);
        break;
      case "purchases":
        await fetchTab("/api/reports/commerce/purchase-lines", purchasesState, setPurchasesState);
        break;
      case "products":
        await fetchTab("/api/reports/commerce/product-summary", productsState, setProductsState);
        break;
      case "customers":
        await fetchTab("/api/reports/commerce/customer-summary", customersState, setCustomersState);
        break;
      case "suppliers":
        await fetchTab("/api/reports/commerce/supplier-summary", suppliersState, setSuppliersState);
        break;
    }
  }

  function handleTabClick(tabId: TabId) {
    void loadTab(tabId);
  }

  function handleApplyListados() {
    clearAllCaches();
    appliedKeyRef.current = currentKey;
    void loadTab(activeTab, true);
  }

  // Returns true if the active tab has data loaded
  function activeTabHasData(): boolean {
    switch (activeTab) {
      case "sales":     return (salesState.data?.length     ?? 0) > 0;
      case "purchases": return (purchasesState.data?.length ?? 0) > 0;
      case "products":  return (productsState.data?.length  ?? 0) > 0;
      case "customers": return (customersState.data?.length ?? 0) > 0;
      case "suppliers": return (suppliersState.data?.length ?? 0) > 0;
    }
  }

  function handleExport(format: "xlsx" | "pdf") {
    setExportError(null);
    setExporting(format);
    // setTimeout lets React render the loading state before the synchronous export blocks
    setTimeout(() => {
      try {
        if (format === "xlsx") {
          switch (activeTab) {
            case "sales":     exportSalesExcel(salesState.data!,         filters); break;
            case "purchases": exportPurchasesExcel(purchasesState.data!, filters); break;
            case "products":  exportProductsExcel(productsState.data!,   filters); break;
            case "customers": exportCustomersExcel(customersState.data!, filters); break;
            case "suppliers": exportSuppliersExcel(suppliersState.data!, filters); break;
          }
        } else {
          switch (activeTab) {
            case "sales":     exportSalesPdf(salesState.data!,         filters); break;
            case "purchases": exportPurchasesPdf(purchasesState.data!, filters); break;
            case "products":  exportProductsPdf(productsState.data!,   filters); break;
            case "customers": exportCustomersPdf(customersState.data!, filters); break;
            case "suppliers": exportSuppliersPdf(suppliersState.data!, filters); break;
          }
        }
      } catch (e) {
        setExportError(e instanceof Error ? e.message : "Error al exportar");
      } finally {
        setExporting(null);
      }
    }, 50);
  }

  function renderTabContent() {
    switch (activeTab) {
      case "sales": {
        const { data, loading, error } = salesState;
        if (loading) return <LoadingRow />;
        if (error)   return <ErrorRow message={error} />;
        if (!data)   return <EmptyState message="Haz clic en Aplicar listados para cargar los datos." />;
        return (
          <>
            <RowCount count={data.length} />
            <SalesLinesTable rows={data} />
          </>
        );
      }
      case "purchases": {
        const { data, loading, error } = purchasesState;
        if (loading) return <LoadingRow />;
        if (error)   return <ErrorRow message={error} />;
        if (!data)   return <EmptyState message="Haz clic en Aplicar listados para cargar los datos." />;
        return (
          <>
            <RowCount count={data.length} />
            <PurchaseLinesTable rows={data} />
          </>
        );
      }
      case "products": {
        const { data, loading, error } = productsState;
        if (loading) return <LoadingRow />;
        if (error)   return <ErrorRow message={error} />;
        if (!data)   return <EmptyState message="Haz clic en Aplicar listados para cargar los datos." />;
        return (
          <>
            <RowCount count={data.length} />
            <ProductSummaryTable rows={data} />
          </>
        );
      }
      case "customers": {
        const { data, loading, error } = customersState;
        if (loading) return <LoadingRow />;
        if (error)   return <ErrorRow message={error} />;
        if (!data)   return <EmptyState message="Haz clic en Aplicar listados para cargar los datos." />;
        return (
          <>
            <RowCount count={data.length} />
            <CustomerSummaryTable rows={data} />
          </>
        );
      }
      case "suppliers": {
        const { data, loading, error } = suppliersState;
        if (loading) return <LoadingRow />;
        if (error)   return <ErrorRow message={error} />;
        if (!data)   return <EmptyState message="Haz clic en Aplicar listados para cargar los datos." />;
        return (
          <>
            <RowCount count={data.length} />
            <SupplierSummaryTable rows={data} />
          </>
        );
      }
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      {/* Header with title + action buttons */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Listados detallados
        </h3>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {hasPending && (
            <span className="text-[11px] text-amber-400">
              Filtros cambiados — aplica para actualizar
            </span>
          )}
          {exportError && (
            <span className="text-[11px] text-rose-400">{exportError}</span>
          )}
          {/* Export buttons */}
          <button
            type="button"
            disabled={!activeTabHasData() || exporting !== null}
            onClick={() => handleExport("xlsx")}
            title="Exportar Excel"
            className="h-7 px-2.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 bg-emerald-800/60 text-emerald-300 hover:bg-emerald-700/60 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exporting === "xlsx"
              ? <><Loader2 className="w-3 h-3 animate-spin" />Exportando…</>
              : <><FileSpreadsheet className="w-3 h-3" />Excel</>
            }
          </button>
          <button
            type="button"
            disabled={!activeTabHasData() || exporting !== null}
            onClick={() => handleExport("pdf")}
            title="Exportar PDF"
            className="h-7 px-2.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 bg-rose-900/60 text-rose-300 hover:bg-rose-800/60 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exporting === "pdf"
              ? <><Loader2 className="w-3 h-3 animate-spin" />Exportando…</>
              : <><FileText className="w-3 h-3" />PDF</>
            }
          </button>
          <button
            type="button"
            onClick={handleApplyListados}
            className={`h-7 px-3 text-xs font-medium rounded transition-colors ${
              hasPending
                ? "bg-amber-500 text-white hover:bg-amber-400 animate-pulse"
                : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
            }`}
          >
            Aplicar listados
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-zinc-800 mb-4 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabClick(tab.id)}
            className={`px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>{renderTabContent()}</div>
    </div>
  );
}
