"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/customers — municipality-picker.tsx
//
// Widget para seleccionar municipio del catálogo CAT-013.
// Incluye departamento automáticamente al seleccionar municipio.
//
// Inicialización: si se reciben initialDeptCode + initialMuniCode,
// hace un fetch al catálogo para resolver los nombres y pre-carga
// el chip de selección con información legible.
//
// Salida: dos hidden inputs dentro del formulario padre:
//   dept_code         — código de departamento, e.g. "06"
//   municipality_code — código de municipio, e.g. "14"
//
// Uso:
//   <MunicipalityPicker
//     initialDeptCode={customer.dept_code}
//     initialMuniCode={customer.municipality_code}
//     errorDept={fieldErrors.dept_code}
//     errorMuni={fieldErrors.municipality_code}
//   />
// ─────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";

// ── Tipos locales ─────────────────────────────────────────────────

interface MunicipalityItem {
  id:        string;
  dept_code: string;
  dept_name: string;
  code:      string;
  name:      string;
}

type SelectedMunicipality = {
  dept_code: string;
  dept_name: string;
  code:      string;
  name:      string;
};

// ── Props ─────────────────────────────────────────────────────────

interface MunicipalityPickerProps {
  initialDeptCode?: string | null;
  initialMuniCode?: string | null;
  errorDept?:       string[];
  errorMuni?:       string[];
}

// ── Componente ────────────────────────────────────────────────────

export function MunicipalityPicker({
  initialDeptCode,
  initialMuniCode,
  errorDept,
  errorMuni,
}: MunicipalityPickerProps) {
  const [search,      setSearch]      = useState("");
  const [results,     setResults]     = useState<MunicipalityItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected,    setSelected]    = useState<SelectedMunicipality | null>(null);
  const [activeIdx,   setActiveIdx]   = useState(-1);

  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Inicializar desde códigos: fetch para resolver nombres
  useEffect(() => {
    if (!initialDeptCode || !initialMuniCode) return;

    fetch(`/api/catalogs/municipalities?dept_code=${encodeURIComponent(initialDeptCode)}&limit=50`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items?: MunicipalityItem[] } | null) => {
        const found = data?.items?.find((m) => m.code === initialMuniCode);
        if (found) {
          setSelected({
            dept_code: found.dept_code,
            dept_name: found.dept_name,
            code:      found.code,
            name:      found.name,
          });
        } else {
          // Fallback: mostrar solo los códigos si el fetch no encuentra coincidencia
          setSelected({
            dept_code: initialDeptCode,
            dept_name: "",
            code:      initialMuniCode,
            name:      initialMuniCode,
          });
        }
      })
      .catch(() => {
        setSelected({
          dept_code: initialDeptCode,
          dept_name: "",
          code:      initialMuniCode,
          name:      initialMuniCode,
        });
      });
  // Solo en mount — los props iniciales no cambian en uso normal
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          `/api/catalogs/municipalities?search=${encodeURIComponent(search.trim())}&limit=80`,
        );
        if (res.ok) {
          const data = await res.json() as { items: MunicipalityItem[] };
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
      setSelected({ dept_code: item.dept_code, dept_name: item.dept_name, code: item.code, name: item.name });
      setSearch("");
      setResults([]);
      setActiveIdx(-1);
    }
  }

  function selectItem(item: MunicipalityItem) {
    setSelected({ dept_code: item.dept_code, dept_name: item.dept_name, code: item.code, name: item.name });
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
            placeholder="Buscar municipio o departamento…"
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
              Escribe para buscar municipios (CAT-013)
            </p>
          )}
          {results.map((item, idx) => {
            const isSel    = selected?.code === item.code && selected?.dept_code === item.dept_code;
            const isActive = idx === activeIdx;
            return (
              <button
                key={item.id}
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
                  <span className="text-zinc-800">{item.name}</span>
                  <span className="text-zinc-400 text-xs ml-2">· {item.dept_name}</span>
                  <span className="font-mono text-xs text-zinc-300 ml-2">
                    {item.dept_code}/{item.code}
                  </span>
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
            <span className="text-zinc-800 font-medium">{selected.name}</span>
            {selected.dept_name && (
              <span className="text-zinc-400 ml-2">· {selected.dept_name}</span>
            )}
            <span className="font-mono text-zinc-300 ml-2">
              {selected.dept_code}/{selected.code}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-zinc-300 hover:text-zinc-500 shrink-0"
            aria-label="Quitar municipio"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Hidden inputs para FormData */}
      <input type="hidden" name="dept_code"         value={selected?.dept_code ?? ""} />
      <input type="hidden" name="municipality_code" value={selected?.code      ?? ""} />

      {errorDept?.[0] && <p className={errorCls}>{errorDept[0]}</p>}
      {errorMuni?.[0] && <p className={errorCls}>{errorMuni[0]}</p>}
    </div>
  );
}
