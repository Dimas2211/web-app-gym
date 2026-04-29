"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/products — product-search-bar.tsx
//
// Buscador libre del catálogo. Sin dependencias de estado externo:
// recibe valor controlado y notifica cambios con debounce.
// ─────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

interface ProductSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

export function ProductSearchBar({
  value,
  onChange,
  placeholder = "Buscar por código, nombre, SKU o marca…",
  debounceMs = 300,
}: ProductSearchBarProps) {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincronizar cuando el padre resetea el valor externamente
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setLocalValue(next);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(next), debounceMs);
  }

  function handleClear() {
    setLocalValue("");
    onChange("");
  }

  return (
    <div className="relative flex-1 min-w-[220px]">
      <Search
        size={15}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
      />
      <input
        type="search"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2 text-sm border border-zinc-300 rounded-lg bg-white
                   focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent
                   placeholder:text-zinc-400"
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
          aria-label="Limpiar búsqueda"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
