"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — supplier-combobox.tsx
//
// Combobox de selección de proveedor para el flujo de compras.
//
// Comportamiento:
//   - Búsqueda con debounce 350ms contra GET /api/suppliers/lookup
//   - Muestra supplier_code + name + tipo contribuyente en cada fila
//   - Navegación por teclado: ArrowDown/Up, Enter, Escape, Tab
//   - Botón × para limpiar la selección
//   - Opción "Crear proveedor rápido" al fondo cuando hay texto
//     y onCreateRequest está provisto
//   - Al seleccionar, sincroniza inputValue con el nombre del proveedor
//   - Cuando value cambia externamente (auto-select tras QuickCreate),
//     useEffect sincroniza inputValue con value.name
// ─────────────────────────────────────────────────────────────────

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
} from "react";
import { Search, X, Plus, Loader2 } from "lucide-react";
import type { SupplierForPurchaseLookup } from "../types/supplier.types";

// ── Props ─────────────────────────────────────────────────────────

interface SupplierComboboxProps {
  value:            SupplierForPurchaseLookup | null;
  onChange:         (supplier: SupplierForPurchaseLookup | null) => void;
  onCreateRequest?: (prefillName: string) => void;
  onCommit?:        () => void;
  disabled?:        boolean;
  placeholder?:     string;
}

// ── Componente ────────────────────────────────────────────────────

export function SupplierCombobox({
  value,
  onChange,
  onCreateRequest,
  onCommit,
  disabled = false,
  placeholder = "Buscar por nombre o NRC…",
}: SupplierComboboxProps) {
  const [inputValue,    setInputValue]    = useState(value?.name ?? "");
  const [isOpen,        setIsOpen]        = useState(false);
  const [results,       setResults]       = useState<SupplierForPurchaseLookup[]>([]);
  const [isLoading,     setIsLoading]     = useState(false);
  const [focusedIndex,  setFocusedIndex]  = useState(-1);

  const inputRef      = useRef<HTMLInputElement>(null);
  const listRef       = useRef<HTMLUListElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortCtrl     = useRef<AbortController | null>(null);

  // Número total de opciones navegables (resultados + opción crear)
  const hasCreateOption = !!onCreateRequest && inputValue.trim().length > 0;
  const totalOptions    = results.length + (hasCreateOption ? 1 : 0);

  // Sincroniza inputValue cuando value cambia externamente (auto-select tras QuickCreate)
  useEffect(() => {
    setInputValue(value?.name ?? "");
  }, [value]);

  // ── Fetch con debounce ────────────────────────────────────────────

  const fetchResults = useCallback((search: string) => {
    // Cancela fetch anterior si sigue en vuelo
    if (abortCtrl.current) abortCtrl.current.abort();
    abortCtrl.current = new AbortController();

    if (!search.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const params = new URLSearchParams({ search: search.trim() });

    fetch(`/api/suppliers/lookup?${params}`, { signal: abortCtrl.current.signal })
      .then((res) => res.json())
      .then((data: SupplierForPurchaseLookup[]) => {
        setResults(Array.isArray(data) ? data : []);
        setIsLoading(false);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") setIsLoading(false);
      });
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      setInputValue(text);
      setFocusedIndex(-1);

      // Si el usuario borra todo el texto, limpia la selección
      if (!text) {
        onChange(null);
        setResults([]);
        setIsOpen(false);
        return;
      }

      // Si había un proveedor seleccionado y el usuario modifica el texto, lo deselecciona
      if (value !== null) {
        onChange(null);
      }

      setIsOpen(true);

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => fetchResults(text), 350);
    },
    [fetchResults, onChange, value],
  );

  // ── Selección de proveedor ────────────────────────────────────────

  const selectSupplier = useCallback(
    (supplier: SupplierForPurchaseLookup) => {
      setInputValue(supplier.name);
      onChange(supplier);
      setIsOpen(false);
      setFocusedIndex(-1);
      // Allow parent to advance focus after selection (keyboard nav in header)
      setTimeout(() => onCommit?.(), 0);
    },
    [onChange, onCommit],
  );

  // ── Limpieza explícita ────────────────────────────────────────────

  const handleClear = useCallback(() => {
    setInputValue("");
    onChange(null);
    setResults([]);
    setIsOpen(false);
    setFocusedIndex(-1);
    inputRef.current?.focus();
  }, [onChange]);

  // ── Teclado ───────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen && e.key !== "ArrowDown") return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          if (!isOpen && inputValue.trim()) {
            setIsOpen(true);
            return;
          }
          setFocusedIndex((prev) =>
            prev < totalOptions - 1 ? prev + 1 : prev,
          );
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setFocusedIndex((prev) => (prev > -1 ? prev - 1 : -1));
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (focusedIndex === -1) break;

          if (focusedIndex < results.length) {
            selectSupplier(results[focusedIndex]);
          } else if (hasCreateOption && focusedIndex === results.length) {
            setIsOpen(false);
            onCreateRequest?.(inputValue.trim());
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          setIsOpen(false);
          setFocusedIndex(-1);
          // Restaura el texto al nombre del proveedor seleccionado (si había uno)
          setInputValue(value?.name ?? "");
          break;
        }
        case "Tab": {
          setIsOpen(false);
          setFocusedIndex(-1);
          break;
        }
      }
    },
    [
      isOpen,
      inputValue,
      focusedIndex,
      totalOptions,
      results,
      hasCreateOption,
      selectSupplier,
      onCreateRequest,
      value,
    ],
  );

  // Scroll automático del ítem enfocado
  useEffect(() => {
    if (focusedIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[focusedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  // Cierra el dropdown si se hace clic fuera
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const root = inputRef.current?.closest("[data-supplier-combobox]");
      if (root && !root.contains(e.target as Node)) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (abortCtrl.current) abortCtrl.current.abort();
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────

  const showClear = !disabled && (value !== null || inputValue.length > 0);

  return (
    <div
      className="relative w-full"
      data-supplier-combobox
    >
      {/* Input */}
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-zinc-400 shrink-0" />

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (inputValue.trim() && results.length > 0) setIsOpen(true);
          }}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={[
            "h-8 w-full rounded-md border bg-zinc-950 py-1 pl-8 pr-8 text-sm text-zinc-100",
            "placeholder:text-zinc-500 outline-none",
            "focus:border-zinc-500 focus:ring-1 focus:ring-zinc-600",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "border-zinc-700",
          ].join(" ")}
        />

        {/* Spinner o botón × */}
        <div className="absolute right-2 flex items-center">
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
          ) : showClear ? (
            <button
              type="button"
              onClick={handleClear}
              tabIndex={-1}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-label="Limpiar proveedor"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 shadow-lg">
          <ul
            ref={listRef}
            className="max-h-64 overflow-y-auto py-1"
            role="listbox"
          >
            {/* Filas de resultados */}
            {results.map((supplier, idx) => (
              <li
                key={supplier.id}
                role="option"
                aria-selected={idx === focusedIndex}
                onPointerDown={(e) => {
                  e.preventDefault(); // evita que el input pierda foco antes de onPointerDown
                  selectSupplier(supplier);
                }}
                className={[
                  "flex cursor-pointer items-baseline gap-3 px-3 py-1.5 text-sm select-none",
                  idx === focusedIndex
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-200 hover:bg-zinc-800",
                ].join(" ")}
              >
                <span className="flex-1 truncate">{supplier.name}</span>
                {supplier.nrc && (
                  <span className="shrink-0 font-mono text-xs text-zinc-400">
                    NRC {supplier.nrc}
                  </span>
                )}
              </li>
            ))}

            {/* Sin resultados */}
            {!isLoading && results.length === 0 && inputValue.trim() && (
              <li className="px-3 py-2 text-sm text-zinc-500 select-none">
                Sin resultados para &ldquo;{inputValue.trim()}&rdquo;
              </li>
            )}

            {/* Opción crear proveedor rápido */}
            {hasCreateOption && (
              <li
                role="option"
                aria-selected={focusedIndex === results.length}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setIsOpen(false);
                  onCreateRequest?.(inputValue.trim());
                }}
                className={[
                  "flex cursor-pointer items-center gap-2 border-t border-zinc-700/60 px-3 py-2 text-sm select-none",
                  focusedIndex === results.length
                    ? "bg-zinc-700 text-emerald-300"
                    : "text-emerald-400 hover:bg-zinc-800",
                ].join(" ")}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span>Crear proveedor rápido</span>
                <span className="ml-1 text-xs text-zinc-500 truncate">
                  &ldquo;{inputValue.trim()}&rdquo;
                </span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
