"use client";

import {
  useState, useEffect, useRef, useCallback,
  forwardRef, useImperativeHandle,
} from "react";
import {
  Search, AlertTriangle, AlertCircle, Info,
  X, Plus, Loader2,
} from "lucide-react";
import type { ProductForSaleResult } from "../queries/search-products-for-sale";
import type { AddSaleItemInput }      from "../schemas/sale.schemas";

const LIMIT     = 50;
const COL_COUNT = 13;

interface ActiveCell { rowIndex: number; colIndex: number; }

interface Props {
  onAdd:    (data: AddSaleItemInput) => Promise<{ ok: boolean; error?: string }>;
  isAdding: boolean;
  disabled?: boolean;
}

export interface SaleProductSearchHandle {
  focus: () => void;
}

// ── Helpers de presentación ──────────────────────────────────────────────────

function StockBadge({ alert }: { alert: ProductForSaleResult["stock_alert"] }) {
  if (!alert || alert === "OK") return null;
  if (alert === "LOW")
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
        <AlertTriangle className="h-3 w-3" />Stock bajo
      </span>
    );
  if (alert === "EMPTY")
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-red-400">
        <AlertCircle className="h-3 w-3" />Sin stock
      </span>
    );
  if (alert === "NO_LOCATION")
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-zinc-500">
        <Info className="h-3 w-3" />Sin registro
      </span>
    );
  return null;
}

function fmtPrice(p: ProductForSaleResult): string {
  return p.sale_price != null ? `$${p.sale_price.toFixed(2)}` : "—";
}

function fmtPriceWithTax(p: ProductForSaleResult): string {
  return p.sale_price_with_tax != null ? `$${p.sale_price_with_tax.toFixed(2)}` : "—";
}

function fmtStock(p: ProductForSaleResult): string {
  if (!p.is_stockable) return "—";
  return p.current_stock != null ? String(p.current_stock) : "—";
}

type AlertStatus = { label: string; cls: string };
function fmtStatus(p: ProductForSaleResult): AlertStatus {
  if (!p.is_stockable) return { label: "Servicio", cls: "text-blue-400" };
  const a = p.stock_alert;
  if (!a || a === "OK")    return { label: "OK",         cls: "text-emerald-500" };
  if (a === "LOW")         return { label: "Stock bajo",  cls: "text-amber-400"  };
  if (a === "EMPTY")       return { label: "Sin stock",   cls: "text-red-400"    };
  if (a === "NO_LOCATION") return { label: "Sin reg.",    cls: "text-zinc-500"   };
  return { label: "—", cls: "text-zinc-500" };
}

// ── Componente principal ─────────────────────────────────────────────────────

export const SaleProductSearch = forwardRef<SaleProductSearchHandle, Props>(
function SaleProductSearch({ onAdd, isAdding, disabled }, ref) {

  // ── Estado ───────────────────────────────────────────────────────────────

  const [query,          setQuery]          = useState("");
  const [results,        setResults]        = useState<ProductForSaleResult[]>([]);
  const [isLoadingInit,  setIsLoadingInit]  = useState(false);
  const [isLoadingMore,  setIsLoadingMore]  = useState(false);
  const [hasMore,        setHasMore]        = useState(false);
  const [nextOffset,     setNextOffset]     = useState<number | null>(null);
  const [searchError,    setSearchError]    = useState<string | null>(null);
  const [activeCell,     setActiveCell]     = useState<ActiveCell | null>(null);
  const [selected,       setSelected]       = useState<ProductForSaleResult | null>(null);
  const [quantity,       setQuantity]       = useState("1");
  const [unitPrice,      setUnitPrice]      = useState("");
  const [discount,       setDiscount]       = useState("0");
  const [addError,       setAddError]       = useState<string | null>(null);

  // ── Refs ─────────────────────────────────────────────────────────────────

  const debounceRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef   = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const priceInputRef    = useRef<HTMLInputElement>(null);
  const discountInputRef = useRef<HTMLInputElement>(null);
  const gridRef          = useRef<HTMLDivElement>(null);
  const rowRefs          = useRef<(HTMLTableRowElement | null)[]>([]);
  const queryRef         = useRef(query);
  const isLoadingMoreRef = useRef(false);

  queryRef.current = query;

  useImperativeHandle(ref, () => ({
    focus: () => searchInputRef.current?.focus(),
  }));

  // ── Cargar más páginas (infinite scroll) ─────────────────────────────────

  const fetchMore = useCallback(async () => {
    if (!hasMore || isLoadingMoreRef.current || nextOffset === null) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const q   = queryRef.current.trim();
      const url = `/api/products/search-for-sale?q=${encodeURIComponent(q)}&limit=${LIMIT}&offset=${nextOffset}`;
      const res  = await fetch(url);
      const json = await res.json() as {
        ok: boolean;
        items?: ProductForSaleResult[];
        pagination?: { hasMore: boolean; nextOffset: number | null };
      };
      if (json.ok) {
        setResults(prev => [...prev, ...(json.items ?? [])]);
        setHasMore(json.pagination?.hasMore ?? false);
        setNextOffset(json.pagination?.nextOffset ?? null);
      }
    } catch {
      // silent — el usuario puede seguir usando los resultados actuales
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasMore, nextOffset]);

  // ── Búsqueda inicial / query change (debounce) ───────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = query.trim() ? 320 : 0;
    debounceRef.current = setTimeout(async () => {
      setIsLoadingInit(true);
      setResults([]);
      setActiveCell(null);
      setHasMore(false);
      setNextOffset(null);
      setSearchError(null);
      isLoadingMoreRef.current = false;
      try {
        const q   = query.trim();
        const url = `/api/products/search-for-sale?q=${encodeURIComponent(q)}&limit=${LIMIT}&offset=0`;
        const res  = await fetch(url);
        const json = await res.json() as {
          ok: boolean;
          items?: ProductForSaleResult[];
          pagination?: { hasMore: boolean; nextOffset: number | null };
          error?: string;
        };
        if (json.ok) {
          setResults(json.items ?? []);
          setHasMore(json.pagination?.hasMore ?? false);
          setNextOffset(json.pagination?.nextOffset ?? null);
        } else {
          setSearchError("No se pudieron buscar productos.");
        }
      } catch {
        setSearchError("No se pudieron buscar productos.");
      } finally {
        setIsLoadingInit(false);
      }
    }, delay);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // ── scrollIntoView al cambiar celda activa (vertical + horizontal) ───────

  useEffect(() => {
    if (activeCell !== null) {
      const row  = rowRefs.current[activeCell.rowIndex];
      row?.scrollIntoView({ block: "nearest" });
      const cell = row?.cells[activeCell.colIndex];
      cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeCell]);

  // ── Scroll handler de la grilla (infinite scroll) ────────────────────────

  function handleGridScroll() {
    const el = gridRef.current;
    if (!el || !hasMore || isLoadingMoreRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < 120) {
      void fetchMore();
    }
  }

  // ── Seleccionar producto ─────────────────────────────────────────────────

  function handleSelectProduct(p: ProductForSaleResult) {
    setSelected(p);
    setActiveCell(null);
    // sale_price_with_tax es el precio comercial CON IVA — fuente principal para la venta.
    // Fallback a sale_price (sin IVA derivado) solo si con_iva no está disponible.
    const priceToUse = p.sale_price_with_tax ?? p.sale_price;
    setUnitPrice(priceToUse != null ? String(priceToUse) : "");
    setDiscount("0");
    setQuantity("1");
    setAddError(null);
    setTimeout(() => {
      quantityInputRef.current?.focus();
      quantityInputRef.current?.select();
    }, 0);
  }

  function handleClearSelected() {
    setSelected(null);
    setQuery("");
    setActiveCell(null);
    setAddError(null);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function handleCancelSelected() {
    setSelected(null);
    setQuantity("1");
    setUnitPrice("");
    setDiscount("0");
    setAddError(null);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  // ── Agregar línea ────────────────────────────────────────────────────────

  const handleAdd = useCallback(async () => {
    if (!selected || isAdding) return;

    const qty   = parseFloat(quantity);
    const price = parseFloat(unitPrice);
    const disc  = parseFloat(discount) || 0;

    if (isNaN(qty) || qty <= 0) {
      setAddError("La cantidad debe ser mayor que cero.");
      return;
    }
    if (isNaN(price) || price < 0) {
      setAddError("El precio no puede ser negativo.");
      return;
    }
    if (price === 0) {
      setAddError("El precio unitario es 0. Ingresa un precio válido antes de agregar.");
      return;
    }
    if (disc < 0) {
      setAddError("El descuento no puede ser negativo.");
      return;
    }

    setAddError(null);

    const result = await onAdd({
      product_id:        selected.id,
      quantity:          qty,
      unit_price:        price,
      discount_amount:   disc,
      tax_rate_override: selected.tax_rate ?? null,
    });

    if (!result.ok) {
      setAddError(result.error ?? "No se pudo agregar la línea.");
      return;
    }

    // Limpiar selección y campos; mantener query y resultados
    setSelected(null);
    setQuantity("1");
    setUnitPrice("");
    setDiscount("0");
    setAddError(null);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [selected, quantity, unitPrice, discount, onAdd, isAdding]);

  // ── Navegación por teclado (siempre desde input de búsqueda) ────────────

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const count = results.length;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (count === 0) return;
      const nextRow = activeCell === null ? 0 : Math.min(activeCell.rowIndex + 1, count - 1);
      const col     = activeCell?.colIndex ?? 0;
      setActiveCell({ rowIndex: nextRow, colIndex: col });
      if (nextRow >= count - 3 && hasMore && !isLoadingMoreRef.current) {
        void fetchMore();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (activeCell === null || activeCell.rowIndex === 0) {
        setActiveCell(null);
      } else {
        setActiveCell({ rowIndex: activeCell.rowIndex - 1, colIndex: activeCell.colIndex });
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (activeCell !== null) {
        setActiveCell({ ...activeCell, colIndex: Math.min(activeCell.colIndex + 1, COL_COUNT - 1) });
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (activeCell !== null) {
        setActiveCell({ ...activeCell, colIndex: Math.max(activeCell.colIndex - 1, 0) });
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      if (activeCell !== null) setActiveCell({ ...activeCell, colIndex: 0 });
    } else if (e.key === "End") {
      e.preventDefault();
      if (activeCell !== null) setActiveCell({ ...activeCell, colIndex: COL_COUNT - 1 });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeCell !== null && results[activeCell.rowIndex]) {
        handleSelectProduct(results[activeCell.rowIndex]!);
      } else if (count === 1) {
        handleSelectProduct(results[0]!);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (selected) {
        handleCancelSelected();
      } else {
        setActiveCell(null);
        setQuery("");
      }
    }
  }

  // ── Computed ─────────────────────────────────────────────────────────────

  const noPriceWarning = selected != null && selected.sale_price == null;
  const noTaxWarning   = selected != null && selected.tax_rate   == null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex-none border-t border-zinc-800">

      {/* ── A. Input de búsqueda ──────────────────────────────────────── */}
      <div className="px-3 pt-2 pb-1">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Buscar producto por código o nombre…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (selected) setSelected(null);
              }}
              onKeyDown={handleSearchKeyDown}
              disabled={disabled || isAdding}
              className="h-7 w-full bg-zinc-800 border border-zinc-700 rounded pl-7 pr-6 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
            />
            {query && (
              <button
                type="button"
                onClick={handleClearSelected}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {isLoadingInit && (
            <Loader2 className="h-3.5 w-3.5 flex-none animate-spin text-zinc-500" />
          )}
        </div>
        {searchError && (
          <p className="mt-1 text-[11px] text-red-400">{searchError}</p>
        )}
      </div>

      {/* ── B. Panel compacto de producto seleccionado ────────────────── */}
      {selected && (
        <div className="mx-3 mb-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5">

          {/* Fila principal: info · entradas · botones */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">

            {/* Info del producto */}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
              <span className="font-mono text-zinc-400">{selected.product_code}</span>
              <span className="font-medium text-zinc-300 truncate max-w-[160px]">{selected.name}</span>
              {selected.unit_symbol && <span>{selected.unit_symbol}</span>}
              {selected.tax_rate != null
                ? <span className="text-zinc-600">IVA {selected.tax_rate}%</span>
                : noTaxWarning && <span className="text-amber-500/70">Sin impuesto</span>}
              <StockBadge alert={selected.stock_alert} />
            </div>

            {/* Entradas */}
            <div className="flex items-center gap-x-1.5 gap-y-1 flex-wrap">
              <label className="text-[10px] text-zinc-500">Cant.</label>
              <input
                ref={quantityInputRef}
                type="number"
                min="0.001"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    priceInputRef.current?.focus();
                    priceInputRef.current?.select();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    handleCancelSelected();
                  }
                }}
                className="h-7 w-16 rounded border border-zinc-700 bg-zinc-800 px-2 text-right text-xs text-zinc-100 focus:border-zinc-500 focus:outline-none"
              />

              <label className="text-[10px] text-zinc-500">Precio</label>
              <input
                ref={priceInputRef}
                type="number"
                min="0"
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    discountInputRef.current?.focus();
                    discountInputRef.current?.select();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    handleCancelSelected();
                  }
                }}
                className="h-7 w-20 rounded border border-zinc-700 bg-zinc-800 px-2 text-right text-xs text-zinc-100 focus:border-zinc-500 focus:outline-none"
              />

              <label className="text-[10px] text-zinc-500">Desc.</label>
              <input
                ref={discountInputRef}
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void handleAdd(); }
                  else if (e.key === "Escape") { e.preventDefault(); handleCancelSelected(); }
                }}
                className="h-7 w-16 rounded border border-zinc-700 bg-zinc-800 px-2 text-right text-xs text-zinc-100 focus:border-zinc-500 focus:outline-none"
              />
            </div>

            {/* Botones */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={isAdding || disabled}
                className="flex h-7 items-center gap-1 rounded bg-emerald-700 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-40"
              >
                {isAdding
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Plus className="h-3 w-3" />}
                Agregar
              </button>
              <button
                type="button"
                onClick={handleCancelSelected}
                disabled={isAdding}
                className="flex h-7 items-center gap-1 rounded border border-zinc-700 px-2.5 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-40"
              >
                <X className="h-3 w-3" />
                Cerrar
              </button>
            </div>
          </div>

          {/* Advertencias y errores */}
          {noPriceWarning && (
            <p className="mt-1 text-[11px] text-amber-400">
              Producto sin precio configurado. Ingresa el precio manualmente.
            </p>
          )}
          {addError && <p className="mt-1 text-[11px] text-red-400">{addError}</p>}
        </div>
      )}

      {/* ── C. Grilla fija siempre visible (scroll vertical + horizontal) */}
      <div
        ref={gridRef}
        onScroll={handleGridScroll}
        className="mx-3 mb-2 overflow-auto rounded border border-zinc-800 bg-zinc-950"
        style={{ height: 180 }}
      >
        {isLoadingInit ? (
          <div className="flex h-full items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-zinc-600" />
            <span className="text-xs text-zinc-500">Cargando productos…</span>
          </div>
        ) : searchError ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-red-400">{searchError}</span>
          </div>
        ) : results.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-zinc-500">No hay productos para mostrar.</span>
          </div>
        ) : (
          <table className="table-fixed text-xs border-collapse" style={{ minWidth: "1100px" }}>
            <colgroup>
              <col style={{ width: "72px"  }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "72px"  }} />
              <col style={{ width: "96px"  }} />
              <col style={{ width: "88px"  }} />
              <col style={{ width: "88px"  }} />
              <col style={{ width: "72px"  }} />
              <col style={{ width: "100px" }} />
              <col style={{ width: "52px"  }} />
              <col style={{ width: "80px"  }} />
              <col style={{ width: "80px"  }} />
              <col style={{ width: "52px"  }} />
              <col style={{ width: "80px"  }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-zinc-900">
              <tr className="text-[10px] text-zinc-500 uppercase tracking-wide">
                <th className="px-2 py-1 text-left  font-medium">Código</th>
                <th className="px-2 py-1 text-left  font-medium">Nombre</th>
                <th className="px-2 py-1 text-left  font-medium">Tipo</th>
                <th className="px-2 py-1 text-left  font-medium">Categoría</th>
                <th className="px-2 py-1 text-left  font-medium">Línea</th>
                <th className="px-2 py-1 text-left  font-medium">Sublínea</th>
                <th className="px-2 py-1 text-left  font-medium">Marca</th>
                <th className="px-2 py-1 text-left  font-medium">Proveedor</th>
                <th className="px-2 py-1 text-center font-medium">Unidad</th>
                <th className="px-2 py-1 text-right font-medium">P. sin IVA</th>
                <th className="px-2 py-1 text-right font-medium">P. con IVA</th>
                <th className="px-2 py-1 text-right font-medium">Stock</th>
                <th className="px-2 py-1 text-center font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {results.map((p, idx) => {
                const isActiveRow = activeCell?.rowIndex === idx;
                const status      = fmtStatus(p);
                const isSelected  = selected?.id === p.id;

                function cellCls(col: number) {
                  return isActiveRow && activeCell?.colIndex === col
                    ? " ring-1 ring-inset ring-zinc-500/60"
                    : "";
                }

                return (
                  <tr
                    key={p.id}
                    ref={(el) => { rowRefs.current[idx] = el; }}
                    onClick={() => handleSelectProduct(p)}
                    className={[
                      "cursor-pointer border-t border-zinc-800/60 transition-colors",
                      isSelected  ? "bg-emerald-950/40"  :
                      isActiveRow ? "bg-zinc-700/60"      :
                                    "hover:bg-zinc-800/50",
                    ].join(" ")}
                  >
                    <td className={`px-2 py-1 font-mono text-[10px] text-zinc-400 truncate${cellCls(0)}`}>
                      {p.product_code}
                    </td>
                    <td className={`px-2 py-1 text-zinc-200 overflow-hidden${cellCls(1)}`}>
                      <span className="block truncate">{p.name}</span>
                    </td>
                    <td className={`px-2 py-1 text-zinc-400 truncate${cellCls(2)}`}>
                      {p.product_type ?? "—"}
                    </td>
                    <td className={`px-2 py-1 text-zinc-400 truncate${cellCls(3)}`}>
                      {p.category_name ?? "—"}
                    </td>
                    <td className={`px-2 py-1 text-zinc-400 truncate${cellCls(4)}`}>
                      {p.line_name ?? "—"}
                    </td>
                    <td className={`px-2 py-1 text-zinc-400 truncate${cellCls(5)}`}>
                      {p.subline_name ?? "—"}
                    </td>
                    <td className={`px-2 py-1 text-zinc-400 truncate${cellCls(6)}`}>
                      {p.brand ?? "—"}
                    </td>
                    <td className={`px-2 py-1 text-zinc-400 truncate${cellCls(7)}`}>
                      {p.supplier_name ?? "—"}
                    </td>
                    <td className={`px-2 py-1 text-center text-zinc-400${cellCls(8)}`}>
                      {p.unit_symbol ?? "—"}
                    </td>
                    <td className={`px-2 py-1 text-right font-mono text-zinc-300${cellCls(9)}`}>
                      {fmtPrice(p)}
                    </td>
                    <td className={`px-2 py-1 text-right font-mono text-zinc-300${cellCls(10)}`}>
                      {fmtPriceWithTax(p)}
                    </td>
                    <td className={`px-2 py-1 text-right font-mono text-zinc-400${cellCls(11)}`}>
                      {fmtStock(p)}
                    </td>
                    <td className={`px-2 py-1 text-center ${status.cls}${cellCls(12)}`}>
                      {status.label}
                    </td>
                  </tr>
                );
              })}

              {isLoadingMore && (
                <tr>
                  <td colSpan={13} className="px-2 py-1.5 text-center">
                    <Loader2 className="inline h-3 w-3 animate-spin text-zinc-600 mr-1" />
                    <span className="text-[10px] text-zinc-600">Cargando más…</span>
                  </td>
                </tr>
              )}

              {!hasMore && results.length >= LIMIT && (
                <tr>
                  <td colSpan={13} className="px-2 py-1 text-center text-[10px] text-zinc-700 select-none">
                    — Fin de resultados —
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
});
SaleProductSearch.displayName = "SaleProductSearch";
