"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-product-search-panel.tsx
//
// F3-C21D — Buscador + grilla recorrible de productos aptos para
// exportación, con navegación por teclado (mismo espíritu que
// sale-product-search.tsx): la selección se maneja desde el input
// de búsqueda (ArrowUp/ArrowDown/Enter), no por foco por fila.
// Carga todos los productos disponibles al montar (search=""), y el
// input filtra en vivo (debounce). Sin botón "Buscar".
//
// Expone focusSearch() vía ref para que el workspace pueda devolver
// el foco aquí después de agregar/eliminar una línea (Enter en
// cantidad, o tras eliminar una línea).
// ─────────────────────────────────────────────────────────────────

import {
  useState, useEffect, useRef,
  forwardRef, useImperativeHandle,
} from "react";
import { Search, Loader2, AlertTriangle, Plus } from "lucide-react";
import { searchExportProductsAction } from "../actions/export-sale.actions";
import type { ExportProductLookup } from "../queries/search-export-products";

interface Props {
  onAdd: (product: ExportProductLookup) => void;
  onConfigureUnit?: (product: ExportProductLookup) => void;
  disabled?: boolean;
  // F3-C23E — cambia cuando una unidad se configuró desde el modal de
  // MH, para forzar un refetch y reflejar el mh_unit_code recién
  // asignado sin que el usuario tenga que re-escribir el filtro.
  refreshToken?: number;
}

export interface ExportProductSearchHandle {
  focusSearch: () => void;
}

export const ExportProductSearchPanel = forwardRef<ExportProductSearchHandle, Props>(
function ExportProductSearchPanel({ onAdd, onConfigureUnit, disabled, refreshToken }, ref) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExportProductLookup[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rowRefs         = useRef<(HTMLTableRowElement | null)[]>([]);

  useImperativeHandle(ref, () => ({
    focusSearch: () => searchInputRef.current?.focus(),
  }));

  // Carga inicial (todos los productos exportables) + filtro en vivo con debounce.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = query.trim() ? 300 : 0;
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const result = await searchExportProductsAction(query);
        if (result.ok) setResults(result.items);
        else { setSearchError(result.error); setResults([]); }
      } finally {
        setSelectedIndex(-1);
        setIsSearching(false);
      }
    }, delay);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, refreshToken]);

  // Mantener la fila activa visible al navegar con flechas.
  useEffect(() => {
    if (selectedIndex >= 0) {
      rowRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  function handleAdd(p: ExportProductLookup) {
    if (disabled) return;
    onAdd(p);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const count = results.length;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (count === 0) return;
      setSelectedIndex((i) => Math.min(i + 1, count - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (count === 0) return;
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) {
        handleAdd(results[selectedIndex]!);
      } else if (count === 1) {
        handleAdd(results[0]!);
      }
    } else if (e.key === "Escape") {
      if (selectedIndex >= 0) {
        e.preventDefault();
        setSelectedIndex(-1);
      }
    }
  }

  return (
    <div className="flex-none border-t border-zinc-800 bg-zinc-900/40">
      {/* Buscador — filtra en vivo, navega la grilla, sin botón */}
      <div className="px-3 pt-2 pb-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Filtrar productos… (↑↓ para navegar, Enter para agregar)"
            value={query}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="h-7 w-full bg-zinc-800 border border-zinc-700 rounded pl-7 pr-7 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
          />
          {isSearching && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-zinc-500" />
          )}
        </div>
      </div>

      {searchError && (
        <p className="mx-3 mb-1.5 text-[11px] text-red-400">{searchError}</p>
      )}

      {/* Grilla recorrible — carga todos los productos por defecto */}
      <div
        role="listbox"
        aria-label="Productos disponibles para exportación"
        className="mx-3 mb-2 overflow-auto rounded border border-zinc-800 bg-zinc-950"
        style={{ height: 176 }}
      >
        {isSearching && results.length === 0 ? (
          <div className="flex h-full items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-zinc-600" />
            <span className="text-xs text-zinc-500">Cargando productos…</span>
          </div>
        ) : results.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-zinc-500">
              {query.trim() ? "Sin resultados para el filtro." : "No hay productos disponibles para exportación."}
            </span>
          </div>
        ) : (
          <table className="w-full table-fixed text-xs border-collapse">
            <colgroup>
              <col style={{ width: "84px" }} />
              <col />
              <col style={{ width: "64px" }} />
              <col style={{ width: "80px" }} />
              <col style={{ width: "64px" }} />
              <col style={{ width: "84px" }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-zinc-900">
              <tr className="text-[10px] text-zinc-500 uppercase tracking-wide">
                <th className="px-2 py-1 text-left font-medium">Código</th>
                <th className="px-2 py-1 text-left font-medium">Nombre</th>
                <th className="px-2 py-1 text-center font-medium">Unidad</th>
                <th className="px-2 py-1 text-right font-medium">Precio</th>
                <th className="px-2 py-1 text-right font-medium">Stock</th>
                <th className="px-2 py-1 text-center font-medium" />
              </tr>
            </thead>
            <tbody>
              {results.map((p, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <tr
                    key={p.id}
                    ref={(el) => { rowRefs.current[idx] = el; }}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={-1}
                    onClick={() => { setSelectedIndex(idx); handleAdd(p); }}
                    onDoubleClick={() => { setSelectedIndex(idx); handleAdd(p); }}
                    className={[
                      "cursor-pointer border-t border-zinc-800/60 transition-colors",
                      isSelected ? "bg-zinc-700/70" : "hover:bg-zinc-800/50",
                    ].join(" ")}
                  >
                    <td className="px-2 py-1 font-mono text-[10px] text-zinc-400 truncate">
                      {p.product_code}
                    </td>
                    <td className="px-2 py-1 text-zinc-200 overflow-hidden">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{p.name}</span>
                        {!p.mh_unit_code && (
                          <>
                            <span
                              title="Requiere unidad MH (CAT-014) para generar el DTE de exportación"
                              className="inline-flex items-center gap-0.5 rounded-full bg-amber-900/30 px-1.5 py-0.5 text-[9px] font-medium text-amber-400 border border-amber-700/50 flex-none"
                            >
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Requiere unidad MH
                            </span>
                            {onConfigureUnit && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onConfigureUnit(p); }}
                                className="flex-none rounded border border-zinc-600 px-1.5 py-0.5 text-[9px] font-medium text-zinc-300 hover:border-zinc-400 hover:text-white transition-colors"
                              >
                                Configurar
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1 text-center text-zinc-400">{p.unit_symbol ?? "—"}</td>
                    <td className="px-2 py-1 text-right font-mono text-zinc-300">
                      {p.sale_price != null ? `$${p.sale_price.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-zinc-400">
                      {p.is_stockable ? (p.current_stock ?? "—") : "—"}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2 py-0.5 text-[10px] font-medium text-white">
                        <Plus className="h-2.5 w-2.5" />
                        Agregar
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
});

ExportProductSearchPanel.displayName = "ExportProductSearchPanel";
