"use client";

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { Search, AlertTriangle, AlertCircle, Info, X, Plus, Loader2 } from "lucide-react";
import type { ProductForSaleResult } from "../queries/search-products-for-sale";
import type { AddSaleItemInput } from "../schemas/sale.schemas";

interface Props {
  onAdd:    (data: AddSaleItemInput) => Promise<{ ok: boolean; error?: string }>;
  isAdding: boolean;
  disabled?: boolean;
}

export interface SaleProductSearchHandle {
  focus: () => void;
}

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
        <Info className="h-3 w-3" />Sin registro de inventario
      </span>
    );
  return null;
}

export const SaleProductSearch = forwardRef<SaleProductSearchHandle, Props>(
function SaleProductSearch({ onAdd, isAdding, disabled }, ref) {
  const [query,        setQuery]        = useState("");
  const [results,      setResults]      = useState<ProductForSaleResult[]>([]);
  const [isSearching,  setIsSearching]  = useState(false);
  const [searchError,  setSearchError]  = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected,     setSelected]     = useState<ProductForSaleResult | null>(null);
  const [quantity,     setQuantity]     = useState("1");
  const [unitPrice,    setUnitPrice]    = useState("");
  const [discount,     setDiscount]     = useState("0");
  const [addError,     setAddError]     = useState<string | null>(null);

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef  = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => searchInputRef.current?.focus(),
  }));

  // Cierra dropdown al hacer clic fuera
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Búsqueda con debounce
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const res  = await fetch(`/api/products/search-for-sale?q=${encodeURIComponent(trimmed)}`);
        const json = await res.json() as { ok: boolean; items?: ProductForSaleResult[]; error?: string };
        if (json.ok) {
          setResults(json.items ?? []);
          setShowDropdown(true);
        } else {
          setSearchError("No se pudieron buscar productos.");
        }
      } catch {
        setSearchError("No se pudieron buscar productos.");
      } finally {
        setIsSearching(false);
      }
    }, 320);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  function handleSelectProduct(p: ProductForSaleResult) {
    setSelected(p);
    setQuery(p.name);
    setShowDropdown(false);
    setUnitPrice(p.sale_price != null ? String(p.sale_price) : "");
    setDiscount("0");
    setQuantity("1");
    setAddError(null);
  }

  function handleClearSelected() {
    setSelected(null);
    setQuery("");
    setResults([]);
    setShowDropdown(false);
    setAddError(null);
  }

  const handleAdd = useCallback(async () => {
    if (!selected) return;

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
      product_id:       selected.id,
      quantity:         qty,
      unit_price:       price,
      discount_amount:  disc,
      tax_rate_override: selected.tax_rate ?? null,
    });

    if (!result.ok) {
      setAddError(result.error ?? "No se pudo agregar la línea.");
      return;
    }

    handleClearSelected();
    // Devuelve el foco al buscador para agregar el próximo producto sin mouse
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [selected, quantity, unitPrice, discount, onAdd]);

  const noPriceWarning = selected != null && selected.sale_price == null;
  const noTaxWarning   = selected != null && selected.tax_rate == null;

  return (
    <div className="flex-none border-b border-zinc-800">

      {/* Fila de búsqueda */}
      <div className="relative px-3 py-2" ref={dropdownRef}>
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
          {isSearching && <Loader2 className="h-3.5 w-3.5 flex-none animate-spin text-zinc-500" />}
        </div>

        {/* Dropdown de resultados */}
        {showDropdown && results.length > 0 && (
          <div className="absolute left-3 right-3 top-full z-50 mt-0.5 max-h-52 overflow-y-auto rounded border border-zinc-700 bg-zinc-900 shadow-xl">
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectProduct(p)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-zinc-800"
              >
                <div className="min-w-0">
                  <span className="font-mono text-[10px] text-zinc-500">{p.product_code}</span>
                  <span className="ml-2 truncate text-xs text-zinc-200">{p.name}</span>
                  {p.unit_symbol && (
                    <span className="ml-1 text-[10px] text-zinc-500">{p.unit_symbol}</span>
                  )}
                </div>
                <div className="flex flex-none items-center gap-2">
                  <span className="font-mono text-[10px] text-zinc-400">
                    {p.sale_price != null ? `$${p.sale_price.toFixed(2)}` : "—"}
                  </span>
                  <StockBadge alert={p.stock_alert} />
                </div>
              </button>
            ))}
          </div>
        )}

        {showDropdown && results.length === 0 && !isSearching && (
          <div className="absolute left-3 right-3 top-full z-50 mt-0.5 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-xl">
            <span className="text-xs text-zinc-500">Sin resultados para &quot;{query}&quot;</span>
          </div>
        )}

        {searchError && <p className="mt-1 text-[11px] text-red-400">{searchError}</p>}
      </div>

      {/* Tarjeta de producto seleccionado + entrada */}
      {selected && (
        <div className="flex flex-col gap-1.5 px-3 pb-2.5">

          {/* Info del producto */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
            <span className="font-mono text-zinc-400">{selected.product_code}</span>
            <span className="font-medium text-zinc-300">{selected.name}</span>
            {selected.unit_symbol && <span>{selected.unit_symbol}</span>}
            {selected.tax_rate != null
              ? <span className="text-zinc-600">IVA {selected.tax_rate}%</span>
              : noTaxWarning && <span className="text-amber-500/70">Sin impuesto configurado</span>}
            <StockBadge alert={selected.stock_alert} />
          </div>

          {noPriceWarning && (
            <p className="text-[11px] text-amber-400">
              Producto sin precio de venta configurado. Ingresa el precio manualmente.
            </p>
          )}

          {/* Fila de entrada */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <label className="w-10 text-[10px] text-zinc-500">Cant.</label>
            <input
              type="number"
              min="0.001"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="h-7 w-20 rounded border border-zinc-700 bg-zinc-800 px-2 text-right text-xs text-zinc-100 focus:border-zinc-500 focus:outline-none"
            />

            <label className="w-10 text-[10px] text-zinc-500">Precio</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="h-7 w-24 rounded border border-zinc-700 bg-zinc-800 px-2 text-right text-xs text-zinc-100 focus:border-zinc-500 focus:outline-none"
            />

            <label className="w-16 text-[10px] text-zinc-500">Descuento</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="h-7 w-20 rounded border border-zinc-700 bg-zinc-800 px-2 text-right text-xs text-zinc-100 focus:border-zinc-500 focus:outline-none"
            />

            <button
              type="button"
              onClick={handleAdd}
              disabled={isAdding || disabled}
              className="flex h-7 items-center gap-1 rounded bg-emerald-700 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-40"
            >
              {isAdding
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Plus className="h-3 w-3" />}
              Agregar
            </button>
          </div>

          {addError && <p className="text-[11px] text-red-400">{addError}</p>}
        </div>
      )}
    </div>
  );
});
SaleProductSearch.displayName = "SaleProductSearch";
