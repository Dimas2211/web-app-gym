"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/customers — activity-picker.tsx
//
// Widget reutilizable para seleccionar una actividad económica del
// catálogo CAT-019 mediante búsqueda con debounce.
//
// Salida: dos hidden inputs dentro del formulario padre:
//   activity_code — código CAT-019, e.g. "47110"
//   activity_name — descripción, e.g. "Venta al por menor..."
//
// Uso:
//   <ActivityPicker
//     initialCode={customer.activity_code}
//     initialName={customer.activity_name}
//     errorCode={fieldErrors.activity_code}
//     errorName={fieldErrors.activity_name}
//   />
// ─────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";

// ── Tipos locales ─────────────────────────────────────────────────

interface EconomicActivityItem {
  code:    string;
  name:    string;
  section: string | null;
}

// ── Props ─────────────────────────────────────────────────────────

interface ActivityPickerProps {
  initialCode?: string | null;
  initialName?: string | null;
  errorCode?:   string[];
  errorName?:   string[];
}

// ── Componente ────────────────────────────────────────────────────

export function ActivityPicker({
  initialCode,
  initialName,
  errorCode,
  errorName,
}: ActivityPickerProps) {
  const [search,      setSearch]      = useState("");
  const [results,     setResults]     = useState<EconomicActivityItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected,    setSelected]    = useState<{ code: string; name: string } | null>(
    initialCode ? { code: initialCode, name: initialName ?? "" } : null,
  );
  const [activeIdx, setActiveIdx] = useState(-1);

  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { setActiveIdx(-1); }, [results]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  // Búsqueda con debounce 350ms
  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/catalogs/economic-activities?search=${encodeURIComponent(search.trim())}&limit=50`,
        );
        if (res.ok) {
          const data = await res.json() as { items: EconomicActivityItem[] };
          setResults(data.items ?? []);
        }
      } finally {
        setIsSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0 && results[activeIdx]) {
      e.preventDefault();
      const item = results[activeIdx];
      setSelected({ code: item.code, name: item.name });
      setSearch("");
      setResults([]);
      setActiveIdx(-1);
    }
  }

  function selectItem(item: EconomicActivityItem) {
    setSelected({ code: item.code, name: item.name });
    setSearch("");
    setResults([]);
    setActiveIdx(-1);
  }

  const errorCls = "text-xs text-red-600 mt-1";

  return (
    <div>
      {/* Caja de búsqueda */}
      <div className="border border-zinc-200 rounded-lg overflow-hidden mb-2">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-100 bg-zinc-50">
          <Search size={13} className="text-zinc-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar actividad por nombre o código…"
            className="flex-1 text-sm bg-transparent outline-none text-zinc-800 placeholder:text-zinc-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(""); setResults([]); }}
              className="text-zinc-300 hover:text-zinc-500"
              aria-label="Limpiar búsqueda"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="max-h-44 overflow-y-auto">
          {isSearching && (
            <p className="text-xs text-zinc-400 text-center py-4">Buscando…</p>
          )}
          {!isSearching && search.trim() && results.length === 0 && (
            <p className="text-xs text-zinc-400 text-center py-4">Sin resultados</p>
          )}
          {!isSearching && !search.trim() && (
            <p className="text-xs text-zinc-400 text-center py-4">
              Escribe para buscar actividades económicas (CAT-019)
            </p>
          )}
          {results.map((item, idx) => {
            const isSel    = selected?.code === item.code;
            const isActive = idx === activeIdx;
            return (
              <button
                key={item.code}
                ref={isActive ? (el) => { activeRef.current = el; } : null}
                type="button"
                onClick={() => selectItem(item)}
                className={
                  `w-full text-left px-3 py-2 text-sm border-b border-zinc-50
                   last:border-0 transition-colors flex items-start gap-2 ` +
                  (isActive
                    ? "bg-zinc-200 ring-1 ring-inset ring-zinc-300"
                    : isSel ? "bg-zinc-100" : "hover:bg-zinc-50")
                }
              >
                <span className="flex-1 min-w-0">
                  <span className="font-mono text-xs text-zinc-400 mr-2">{item.code}</span>
                  <span className="text-zinc-800">{item.name}</span>
                  {item.section && (
                    <span className="ml-2 text-xs text-zinc-400">· {item.section}</span>
                  )}
                </span>
                {isSel && <Check size={13} className="text-zinc-600 shrink-0 mt-0.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chip de selección actual */}
      {selected && (
        <div className="px-3 py-2 bg-zinc-50 rounded-lg border border-zinc-200 text-xs
                        flex items-center justify-between gap-2 mb-1">
          <span className="min-w-0 truncate">
            <span className="font-mono text-zinc-400 mr-2">{selected.code}</span>
            <span className="text-zinc-700">{selected.name}</span>
          </span>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-zinc-300 hover:text-zinc-500 shrink-0"
            aria-label="Quitar actividad"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Hidden inputs para FormData */}
      <input type="hidden" name="activity_code" value={selected?.code ?? ""} />
      <input type="hidden" name="activity_name" value={selected?.name ?? ""} />

      {errorCode?.[0] && <p className={errorCls}>{errorCode[0]}</p>}
      {errorName?.[0] && <p className={errorCls}>{errorName[0]}</p>}
    </div>
  );
}
