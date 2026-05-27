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

// ── Columnas — mismo patrón que purchases-items-table ─────────────

interface ColDef {
  key:      string;
  label:    string;
  widthCls: string;
  align?:   "right" | "center";
}

const COLUMNS: ColDef[] = [
  { key: "product_code",  label: "Código",     widthCls: "w-24"                   },
  { key: "name",          label: "Producto",   widthCls: "w-56"                   },
  { key: "unit_symbol",   label: "Unidad",     widthCls: "w-20", align: "center"  },
  { key: "current_stock", label: "Stock",      widthCls: "w-20", align: "right"   },
  { key: "cost_price",    label: "Costo ref.", widthCls: "w-28", align: "right"   },
  { key: "tax_rate",      label: "IVA %",      widthCls: "w-16", align: "right"   },
];

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

      {/* Results grid — flex layout, igual que purchases-items-table */}
      <div className="flex-1 overflow-y-auto">

        {/* Encabezado sticky */}
        <div className="sticky top-0 z-10 flex items-center h-7 border-b border-zinc-800 bg-zinc-900 px-3">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              className={[
                "shrink-0 pr-3 select-none text-[10px] font-semibold uppercase tracking-wide text-zinc-500",
                col.widthCls,
                col.align === "right"  ? "text-right"  : "",
                col.align === "center" ? "text-center" : "",
              ].join(" ")}
            >
              {col.label}
            </div>
          ))}
        </div>

        {/* Filas */}
        {results.map((p) => (
          <div
            key={p.id}
            onClick={() => onSelect(p)}
            className="flex items-center h-7 px-3 border-b border-zinc-800/40 text-xs text-zinc-300 hover:bg-zinc-800 cursor-pointer transition-colors"
          >
            {COLUMNS.map((col) => {
              let content: React.ReactNode;
              switch (col.key) {
                case "product_code":
                  content = <span className="font-mono">{p.product_code}</span>;
                  break;
                case "name":
                  content = p.name;
                  break;
                case "unit_symbol":
                  content = <span className="text-zinc-400">{p.unit_symbol}</span>;
                  break;
                case "current_stock": {
                  if (!p.is_stockable) {
                    content = <span className="text-zinc-600">—</span>;
                  } else if (p.current_stock === null) {
                    content = <span className="text-zinc-600">Sin reg.</span>;
                  } else if (p.current_stock === 0) {
                    content = <span className="text-zinc-500 font-mono">0</span>;
                  } else {
                    content = (
                      <span className="font-mono text-zinc-300">
                        {Number.isInteger(p.current_stock)
                          ? p.current_stock
                          : p.current_stock.toFixed(2)}
                      </span>
                    );
                  }
                  break;
                }
                case "cost_price":
                  content = (
                    <span className="font-mono text-zinc-400">
                      {p.cost_price !== null ? `$${Number(p.cost_price).toFixed(2)}` : "—"}
                    </span>
                  );
                  break;
                case "tax_rate":
                  content = (
                    <span className="text-zinc-400">
                      {p.tax_rate !== null ? `${p.tax_rate}%` : "—"}
                    </span>
                  );
                  break;
                default:
                  content = "—";
              }

              return (
                <div
                  key={col.key}
                  className={[
                    "shrink-0 pr-3 truncate",
                    col.widthCls,
                    col.align === "right"  ? "text-right"  : "",
                    col.align === "center" ? "text-center" : "",
                  ].join(" ")}
                >
                  {content}
                </div>
              );
            })}
          </div>
        ))}

        {!loading && results.length === 0 && (
          <div className="py-4 text-center text-zinc-600 text-xs">
            {search ? "Sin resultados" : "No hay productos disponibles para compra"}
          </div>
        )}

      </div>
    </div>
  );
}
