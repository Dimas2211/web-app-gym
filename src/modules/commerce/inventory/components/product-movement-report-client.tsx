"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/inventory — product-movement-report-client.tsx
//
// Commerce → Consultas y reportes → Movimientos por producto.
//
// - Selección de producto OBLIGATORIA (código o nombre). Sin producto
//   no se consulta nada: nunca se carga el historial de todo el catálogo.
// - Filtros: Desde / Hasta (día local El Salvador) y tipo de movimiento.
// - Pantalla paginada (50 por página) con total real visible.
// - Excel/PDF piden TODAS las filas con los filtros APLICADOS (no los
//   inputs sin consultar) vía mode=export; si el historial excede el
//   límite de exportación se informa y no se genera archivo parcial.
// - Al cambiar de producto se limpian de inmediato encabezado y filas.
// ─────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { FileSpreadsheet, FileText, Loader2, Search, X } from "lucide-react";
import type { MovementType } from "../types/inventory-movement.types";
import type { ProductMovementReport } from "../queries/get-product-movement-report";
import type { MovementProductOption } from "../queries/search-movement-products";
import { ProductMovementsTable } from "./product-movements-table";
import { MOVEMENT_TYPE_OPTIONS, getMovementTypeLabel } from "../utils/inventory-movement-labels";
import {
  describeMovementPeriod,
  exportProductMovementsExcel,
  exportProductMovementsPdf,
} from "../utils/export-inventory-movement-report";

const REPORT_PATH = "/dashboard/reports/commerce/inventory-movements";

interface AppliedFilters {
  date_from: string;
  date_to: string;
  movement_type: MovementType | "";
}

interface Props {
  initialProduct: MovementProductOption | null;
  initialProductError?: string | null;
}

function buildQuery(productId: string, f: AppliedFilters, extra: Record<string, string>): string {
  const q = new URLSearchParams({ product_id: productId, ...extra });
  if (f.date_from) q.set("date_from", f.date_from);
  if (f.date_to) q.set("date_to", f.date_to);
  if (f.movement_type) q.set("movement_type", f.movement_type);
  return q.toString();
}

const inputCls =
  "block w-full bg-zinc-950 border border-zinc-700 rounded-md px-2.5 py-1.5 text-sm text-zinc-100 " +
  "focus:outline-none focus:ring-2 focus:ring-zinc-500";

export function ProductMovementReportClient({ initialProduct, initialProductError = null }: Props) {
  const [product, setProduct] = useState<MovementProductOption | null>(initialProduct);
  const [inputs, setInputs] = useState<AppliedFilters>({ date_from: "", date_to: "", movement_type: "" });
  const [applied, setApplied] = useState<AppliedFilters>(inputs);
  const [page, setPage] = useState(1);

  const [report, setReport] = useState<ProductMovementReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialProductError);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const requestRef = useRef(0);

  // ── Carga paginada ───────────────────────────────────────────
  const load = useCallback(async (p: MovementProductOption, f: AppliedFilters, pg: number) => {
    const reqId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/product-movements?${buildQuery(p.id, f, { page: String(pg) })}`, { cache: "no-store" });
      const data = await res.json();
      if (reqId !== requestRef.current) return;
      if (!res.ok) throw new Error(data?.error ?? "Error consultando movimientos.");
      setReport(data as ProductMovementReport);
    } catch (e) {
      if (reqId !== requestRef.current) return;
      setReport(null);
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      if (reqId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (product) void load(product, applied, page);
  }, [product, applied, page, load]);

  // ── Selección de producto ────────────────────────────────────
  function selectProduct(p: MovementProductOption | null) {
    requestRef.current++; // descarta respuestas en vuelo del producto anterior
    setReport(null);
    setError(null);
    setExportError(null);
    setLoading(false);
    setPage(1);
    setApplied({ ...inputs });
    setProduct(p);
    // URL enlazable sin re-render del servidor (no se pierden filtros).
    window.history.replaceState(null, "", p ? `${REPORT_PATH}?product_id=${p.id}` : REPORT_PATH);
  }

  function applyFilters() {
    if (inputs.date_from && inputs.date_to && inputs.date_from > inputs.date_to) {
      setError("La fecha inicial no puede ser posterior a la fecha final.");
      return;
    }
    setExportError(null);
    setPage(1);
    setApplied({ ...inputs });
  }

  // ── Exportación (todas las filas con los filtros aplicados) ──
  async function download(kind: "excel" | "pdf") {
    if (!product || exporting) return;
    setExporting(kind);
    setExportError(null);
    try {
      const res = await fetch(`/api/inventory/product-movements?${buildQuery(product.id, applied, { mode: "export" })}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudo preparar la exportación.");
      const full = data as ProductMovementReport;
      const typeLabel = full.movement_type ? getMovementTypeLabel(full.movement_type) : null;
      if (kind === "excel") await exportProductMovementsExcel(full, typeLabel);
      else await exportProductMovementsPdf(full, typeLabel);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "No se pudo generar el archivo.");
    } finally {
      setExporting(null);
    }
  }

  const from = report ? (report.page - 1) * report.page_size + 1 : 0;
  const to = report ? from + report.items.length - 1 : 0;

  return (
    <section className="space-y-4">
      {/* ── Producto + filtros ─────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-4">
        <ProductPicker product={product} onSelect={selectProduct} />

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-zinc-400">
            Desde
            <input type="date" className={inputCls} value={inputs.date_from}
              onChange={(e) => setInputs((f) => ({ ...f, date_from: e.target.value }))} />
          </label>
          <label className="text-xs text-zinc-400">
            Hasta
            <input type="date" className={inputCls} value={inputs.date_to}
              onChange={(e) => setInputs((f) => ({ ...f, date_to: e.target.value }))} />
          </label>
          <label className="text-xs text-zinc-400">
            Tipo de movimiento
            <select className={inputCls} value={inputs.movement_type}
              onChange={(e) => setInputs((f) => ({ ...f, movement_type: e.target.value as MovementType | "" }))}>
              <option value="">Todos</option>
              {MOVEMENT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={applyFilters} disabled={!product || loading}
            className="h-[34px] rounded-md bg-zinc-100 px-4 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-40">
            {loading ? "Consultando…" : "Consultar"}
          </button>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => void download("excel")} disabled={!report || loading || !!exporting}
              className="h-[34px] flex items-center gap-1.5 rounded-md border border-zinc-600 px-3 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40">
              {exporting === "excel" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
              Exportar Excel
            </button>
            <button type="button" onClick={() => void download("pdf")} disabled={!report || loading || !!exporting}
              className="h-[34px] flex items-center gap-1.5 rounded-md border border-zinc-600 px-3 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40">
              {exporting === "pdf" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              Exportar PDF
            </button>
          </div>
        </div>
        {exportError && <p role="alert" className="text-sm text-amber-400">{exportError}</p>}
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-800 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p>}

      {!product && !error && (
        <div className="rounded-lg border border-dashed border-zinc-700 py-12 text-center text-sm text-zinc-400">
          Seleccioná un producto por código o nombre para consultar su historial de movimientos.
        </div>
      )}

      {product && loading && !report && (
        <div className="flex items-center justify-center gap-2 py-12 text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Consultando movimientos…</span>
        </div>
      )}

      {/* ── Resultado ──────────────────────────────────────────── */}
      {report && (
        <div className={`rounded-lg bg-white text-zinc-800 overflow-hidden ${loading ? "opacity-60" : ""}`}>
          <div className="border-b border-zinc-200 px-4 py-3">
            <p className="text-[11px] font-semibold tracking-wider text-zinc-400">ZOLVI — MOVIMIENTOS DE INVENTARIO</p>
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <HeaderField label="Producto" value={report.product.name} />
              <HeaderField label="Código" value={report.product.product_code} mono />
              <HeaderField label="Sucursal" value={report.location.name} />
              <HeaderField label="Desde" value={report.date_from_label ?? "Inicio del historial"} />
              <HeaderField label="Hasta" value={report.date_to_label ?? "Actualidad"} />
              <HeaderField label="Tipo de movimiento" value={report.movement_type ? getMovementTypeLabel(report.movement_type) : "Todos"} />
              <HeaderField label="Fecha de generación" value={report.generated_at_label} />
              <HeaderField label="Cantidad de movimientos" value={report.total.toLocaleString("en-US")} />
            </dl>
          </div>

          <ProductMovementsTable items={report.items} />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-500">
            <span>
              {report.total === 0
                ? `Sin movimientos · ${describeMovementPeriod(report)}`
                : `Mostrando ${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} de ${report.total.toLocaleString("en-US")} movimientos · orden cronológico`}
            </span>
            {report.total_pages > 1 && (
              <div className="flex items-center gap-2">
                <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(1)}
                  className="rounded border border-zinc-300 px-2 py-0.5 disabled:opacity-40">«</button>
                <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}
                  className="rounded border border-zinc-300 px-2 py-0.5 disabled:opacity-40">Anterior</button>
                <span>Página {report.page} de {report.total_pages}</span>
                <button type="button" disabled={page >= report.total_pages || loading} onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-zinc-300 px-2 py-0.5 disabled:opacity-40">Siguiente</button>
                <button type="button" disabled={page >= report.total_pages || loading} onClick={() => setPage(report.total_pages)}
                  className="rounded border border-zinc-300 px-2 py-0.5 disabled:opacity-40">»</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function HeaderField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 min-w-0">
      <dt className="shrink-0 text-zinc-400">{label}:</dt>
      <dd className={`truncate font-medium text-zinc-800 ${mono ? "font-mono" : ""}`} title={value}>{value}</dd>
    </div>
  );
}

// ── Selector de producto ─────────────────────────────────────────

function ProductPicker({
  product,
  onSelect,
}: {
  product: MovementProductOption | null;
  onSelect: (p: MovementProductOption | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<MovementProductOption[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const res = await fetch(`/api/inventory/product-movements/products?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data?.error ?? "No se pudo buscar productos.");
        setOptions((data.items ?? []) as MovementProductOption[]);
      } catch (e) {
        if (!cancelled) { setOptions([]); setSearchError(e instanceof Error ? e.message : "Error"); }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, open]);

  if (product) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-zinc-400">Producto</span>
        <div className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5">
          <span className="font-mono text-xs text-zinc-400">{product.product_code}</span>
          <span className="text-sm font-medium text-zinc-100">{product.name}</span>
        </div>
        <button type="button" onClick={() => { setQuery(""); onSelect(null); setOpen(true); }}
          className="flex items-center gap-1 text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200">
          <X className="w-3 h-3" /> Cambiar producto
        </button>
      </div>
    );
  }

  return (
    <div className="relative max-w-xl">
      <label className="text-xs text-zinc-400">
        Producto <span className="text-rose-400">*</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="Buscar por código o nombre…"
            value={query}
            autoFocus
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          />
        </div>
      </label>
      {open && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-zinc-700 bg-zinc-950 py-1 shadow-lg">
          {searching && <li className="px-3 py-2 text-xs text-zinc-500">Buscando…</li>}
          {!searching && searchError && <li className="px-3 py-2 text-xs text-rose-400">{searchError}</li>}
          {!searching && !searchError && options.length === 0 && (
            <li className="px-3 py-2 text-xs text-zinc-500">Sin productos con inventario en esta sucursal.</li>
          )}
          {!searching && options.map((o) => (
            <li key={o.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); onSelect(o); }}
                className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-zinc-800">
                <span className="w-28 shrink-0 truncate font-mono text-xs text-zinc-400">{o.product_code}</span>
                <span className="truncate text-sm text-zinc-100">{o.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
