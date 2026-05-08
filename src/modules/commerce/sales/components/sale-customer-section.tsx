"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Search, X } from "lucide-react";
import type { CustomerForSaleLookup } from "@/modules/commerce/customers/types/customer.types";

interface Props {
  selectedCustomer:   CustomerForSaleLookup | null;
  primaryDteTypeCode: "01" | "03";
  onSelect:           (c: CustomerForSaleLookup | null) => void;
}

const TAXPAYER_LABELS: Record<string, string> = {
  FINAL_CONSUMER:      "Consumidor final",
  REGISTERED_TAXPAYER: "Contribuyente",
  EXCLUDED_SUBJECT:    "Sujeto excluido",
};

function isCcfFiscalIncomplete(c: CustomerForSaleLookup): boolean {
  return !c.nit || !c.nrc || !c.activity_code;
}

export function SaleCustomerSection({ selectedCustomer, primaryDteTypeCode, onSelect }: Props) {
  const [query,       setQuery]       = useState("");
  const [results,     setResults]     = useState<CustomerForSaleLookup[]>([]);
  const [open,        setOpen]        = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef  = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/customers/search?q=${encodeURIComponent(q)}&limit=15`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.data ?? []);
        setOpen(true);
      }
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 320);
  }

  function handleSelect(c: CustomerForSaleLookup) {
    onSelect(c);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function handleClear() {
    onSelect(null);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const isCcf         = primaryDteTypeCode === "03";
  const noCustomer    = !selectedCustomer;
  const ccfIncomplete = selectedCustomer && isCcf && isCcfFiscalIncomplete(selectedCustomer);

  const inputCls =
    "h-7 w-full bg-zinc-800 border border-zinc-700 rounded pl-7 pr-2 text-xs text-zinc-100 " +
    "placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500";

  return (
    <div className="p-3 flex flex-col gap-2" ref={wrapperRef}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Cliente / Receptor
      </span>

      {/* Búsqueda — solo si no hay cliente seleccionado */}
      {!selectedCustomer && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-600 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nombre, código, NIT, NRC…"
            value={query}
            onChange={handleQueryChange}
            onFocus={() => { if (query.length >= 2) setOpen(true); }}
            className={inputCls}
          />
          {isSearching && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600">
              …
            </span>
          )}

          {/* Resultados */}
          {open && results.length > 0 && (
            <div className="absolute z-30 top-8 left-0 right-0 bg-zinc-800 border border-zinc-700 rounded shadow-xl max-h-48 overflow-auto">
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-zinc-700 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                      {c.customer_code}
                    </span>
                    <span className="text-xs text-zinc-200 truncate">{c.name}</span>
                    {c.taxpayer_type && (
                      <span className="ml-auto text-[9px] text-zinc-600 shrink-0">
                        {TAXPAYER_LABELS[c.taxpayer_type] ?? c.taxpayer_type}
                      </span>
                    )}
                  </div>
                  {(c.nit || c.nrc || c.dui) && (
                    <div className="flex gap-2 mt-0.5">
                      {c.nit && <span className="text-[9px] text-zinc-600">NIT: {c.nit}</span>}
                      {c.nrc && <span className="text-[9px] text-zinc-600">NRC: {c.nrc}</span>}
                      {c.dui && <span className="text-[9px] text-zinc-600">DUI: {c.dui}</span>}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {open && !isSearching && results.length === 0 && query.length >= 2 && (
            <div className="absolute z-30 top-8 left-0 right-0 bg-zinc-800 border border-zinc-700 rounded shadow-xl px-2.5 py-2 text-[11px] text-zinc-500">
              Sin resultados.
            </div>
          )}
        </div>
      )}

      {/* Cliente seleccionado */}
      {selectedCustomer && (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded p-2 flex flex-col gap-0.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                {selectedCustomer.customer_code}
              </span>
              <span className="text-xs text-zinc-100 font-medium truncate">
                {selectedCustomer.name}
              </span>
            </div>
            <button
              type="button"
              onClick={handleClear}
              aria-label="Quitar cliente"
              className="ml-2 shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {selectedCustomer.taxpayer_type && (
            <span className="text-[10px] text-zinc-500">
              {TAXPAYER_LABELS[selectedCustomer.taxpayer_type] ?? selectedCustomer.taxpayer_type}
            </span>
          )}

          <div className="flex gap-2 flex-wrap mt-0.5">
            {selectedCustomer.nit && (
              <span className="text-[10px] text-zinc-500">NIT: {selectedCustomer.nit}</span>
            )}
            {selectedCustomer.nrc && (
              <span className="text-[10px] text-zinc-500">NRC: {selectedCustomer.nrc}</span>
            )}
            {selectedCustomer.dui && (
              <span className="text-[10px] text-zinc-500">DUI: {selectedCustomer.dui}</span>
            )}
          </div>

          {selectedCustomer.activity_code && (
            <span className="text-[10px] text-zinc-600">
              Actividad: {selectedCustomer.activity_code}
            </span>
          )}
        </div>
      )}

      {/* Validaciones visuales */}
      {isCcf && noCustomer && (
        <p className="text-[10px] text-amber-500/80 leading-snug">
          CCFE requiere cliente/receptor fiscal válido.
        </p>
      )}

      {!isCcf && noCustomer && (
        <p className="text-[10px] text-zinc-600 leading-snug">
          Factura a consumidor final — cliente opcional.
        </p>
      )}

      {ccfIncomplete && (
        <p className="text-[10px] text-amber-500/80 leading-snug">
          Datos fiscales incompletos: NIT, NRC o código de actividad faltante.
        </p>
      )}

      {/* Crear cliente rápido — placeholder para fase posterior */}
      <button
        type="button"
        disabled
        className="mt-0.5 h-6 text-[10px] border border-zinc-800 rounded text-zinc-700 opacity-50 cursor-not-allowed"
      >
        Crear cliente rápido — Fase posterior
      </button>
    </div>
  );
}
