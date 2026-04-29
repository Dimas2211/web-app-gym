"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase-form-product-search.tsx
//
// Zone D: grilla inferior de búsqueda de productos.
// Busca vía GET /api/purchases/products?search=…
// Al hacer click en una fila llama a onSelect(product).
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import type { ProductForPurchaseLookup } from "../types/purchase.types";

interface Props {
  onSelect: (product: ProductForPurchaseLookup) => void;
}

export function PurchaseFormProductSearch({ onSelect }: Props) {
  const [search,  setSearch]  = useState("");
  const [results, setResults] = useState<ProductForPurchaseLookup[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);

    const qs  = search ? `?search=${encodeURIComponent(search)}` : "";
    fetch(`/api/purchases/products${qs}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ProductForPurchaseLookup[]) => {
        setResults(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    return () => ctrl.abort();
  }, [search]);

  return (
    <div className="flex flex-col h-full border-t border-zinc-800 bg-zinc-950">

      {/* Search bar */}
      <div className="flex-none flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/60">
        <Search className="h-3 w-3 text-zinc-500 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto por código o nombre…"
          className="flex-1 bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
        />
        {loading && <span className="text-[10px] text-zinc-600">buscando…</span>}
      </div>

      {/* Results grid */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-zinc-900/90">
            <tr className="text-left text-[10px] text-zinc-500 uppercase tracking-wide">
              <th className="py-1 px-3 font-medium w-24">Código</th>
              <th className="py-1 px-3 font-medium">Nombre</th>
              <th className="py-1 px-3 font-medium w-14 text-center">Unidad</th>
              <th className="py-1 px-3 font-medium w-24 text-right">Costo ref.</th>
              <th className="py-1 px-3 font-medium w-16 text-right">IVA %</th>
            </tr>
          </thead>
          <tbody>
            {results.map((p) => (
              <tr
                key={p.id}
                onClick={() => onSelect(p)}
                className="border-t border-zinc-800/50 hover:bg-zinc-800 cursor-pointer transition-colors"
              >
                <td className="py-1 px-3 font-mono text-zinc-300">{p.product_code}</td>
                <td className="py-1 px-3 text-zinc-200 truncate max-w-0">{p.name}</td>
                <td className="py-1 px-3 text-center text-zinc-400">{p.unit_symbol}</td>
                <td className="py-1 px-3 text-right font-mono text-zinc-400">
                  {p.cost_price !== null ? `$${Number(p.cost_price).toFixed(2)}` : "—"}
                </td>
                <td className="py-1 px-3 text-right text-zinc-400">
                  {p.tax_rate !== null ? `${p.tax_rate}%` : "—"}
                </td>
              </tr>
            ))}
            {!loading && results.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-zinc-600 text-xs">
                  {search ? "Sin resultados" : "No hay productos disponibles para compra"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
