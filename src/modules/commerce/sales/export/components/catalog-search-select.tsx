"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — catalog-search-select.tsx
//
// F3-C23B — Combobox buscable para catálogos DTE grandes (p. ej.
// CAT-020 País, 275 ítems). Un <select> nativo sigue siendo usable
// para catálogos chicos (CAT-027, CAT-028, CAT-029, CAT-031), pero
// para país se vuelve incómodo — este componente reemplaza el select
// nativo por un input con búsqueda + lista filtrable, sin depender de
// una librería de combobox externa (no hay una ya instalada en el
// proyecto). No es un input libre: solo permite elegir de la lista
// cargada desde el catálogo central (DteCatalogItem); el valor
// guardado siempre es item_code, nunca texto escrito por el usuario.
// ─────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

// Forma mínima que necesita el combobox — no acoplado a DteCatalogItem
// específicamente, así sirve tanto para catálogos DTE (item_code/item_label
// mapeados a code/label por el caller) como para catálogos genéricos como
// `Country` (code/name mapeados a code/label por el caller).
export interface CatalogSearchOption {
  code:  string;
  label: string;
}

interface Props {
  items: CatalogSearchOption[];
  value: string;
  onSelect: (item: CatalogSearchOption) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CatalogSearchSelect({ items, value, onSelect, placeholder, disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = items.find((i) => i.code === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.code.toLowerCase().includes(q) || i.label.toLowerCase().includes(q),
    );
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-full items-center justify-between gap-1.5 rounded border border-zinc-700 bg-zinc-800 px-2.5 text-xs text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="truncate">
          {selected ? `${selected.code} — ${selected.label}` : (placeholder ?? "Seleccionar…")}
        </span>
        <ChevronDown className="h-3 w-3 flex-none text-zinc-500" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[260px] rounded border border-zinc-700 bg-zinc-900 shadow-xl">
          <div className="relative border-b border-zinc-800 p-1.5">
            <Search className="absolute left-4 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por código o nombre…"
              className="w-full h-7 rounded bg-zinc-800 pl-6 pr-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
                if (e.key === "Enter" && filtered.length > 0) {
                  e.preventDefault();
                  onSelect(filtered[0]);
                  setOpen(false);
                }
              }}
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-zinc-600">Sin resultados.</p>
            ) : (
              filtered.slice(0, 200).map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => { onSelect(item); setOpen(false); }}
                  className={`block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-zinc-800 ${
                    item.code === value ? "bg-zinc-800 text-emerald-300" : "text-zinc-200"
                  }`}
                >
                  <span className="font-mono text-[10px] text-zinc-500 mr-1.5">{item.code}</span>
                  {item.label}
                </button>
              ))
            )}
            {filtered.length > 200 && (
              <p className="px-3 py-1.5 text-[10px] text-zinc-600">
                {filtered.length - 200} resultados más — sigue escribiendo para acotar.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
