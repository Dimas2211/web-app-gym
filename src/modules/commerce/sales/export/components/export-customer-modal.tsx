"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-customer-modal.tsx
//
// F3-C21B — Modal de receptor extranjero: buscar/seleccionar cliente
// existente o crear uno nuevo. Captura extensa vive en el modal, no
// en la pantalla principal (regla F3-C21B).
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import { Loader2, Search, X, Plus, ArrowLeft } from "lucide-react";
import {
  searchForeignCustomersAction,
  createForeignCustomerAction,
  updateForeignCustomerCountryAction,
} from "../actions/export-sale.actions";
import type { ForeignCustomerLookup } from "../queries/search-foreign-customers";
import type { CreateForeignCustomerInput } from "../schemas/export-sale.schemas";
import type { DteCatalogItem } from "@/modules/commerce/dte/types/dte-catalog.types";
import type { CountryItem } from "@/modules/commerce/suppliers/types/supplier-catalogs.types";
import { CatalogSearchSelect } from "./catalog-search-select";
import { createLiveSearch, LIVE_SEARCH_MIN_CHARS, type LiveSearchState } from "../utils/live-search";

interface Props {
  onClose: () => void;
  onSelect: (customer: ForeignCustomerLookup) => void;
  // País: CAT-020 vigente (modelo `Country`, ISO alpha-2 — ej. "US"),
  // usado por receptor.codPais de la Factura de Exportación (FEX-PROD-0B).
  catalogCountries: CountryItem[];
  catalogCAT022: DteCatalogItem[]; // Tipo de documento de identificación
  catalogCAT029: DteCatalogItem[]; // Tipo de persona
}

const inputCls =
  "w-full h-8 rounded border border-zinc-700 bg-zinc-800 px-2.5 text-xs text-zinc-100 " +
  "placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500";
const labelCls = "block text-[10px] text-zinc-500 mb-1";

// FEX 11 no admite "00" Consumidor final — el receptor extranjero siempre
// debe traer un tipo de documento de identificación real.
function receiverIdTypes(catalogCAT022: DteCatalogItem[]): DteCatalogItem[] {
  return catalogCAT022.filter((t) => t.item_code !== "00");
}

// País sin valor por defecto: el usuario debe elegirlo explícitamente.
function emptyDraft(): CreateForeignCustomerInput {
  return {
    name: "", legal_name: "", id_type_code: "03", document_number: "",
    country_code: "", country_name: "",
    customer_person_type: "2", activity_name: "", address_complement: "", phone: "", email: "",
  };
}

export function ExportCustomerModal({ onClose, onSelect, catalogCountries, catalogCAT022, catalogCAT029 }: Props) {
  const [mode, setMode] = useState<"search" | "create">("search");
  const idTypes = receiverIdTypes(catalogCAT022);
  const countryItems = catalogCountries.map((c) => ({ code: c.code, label: c.name }));
  const validCountryCodes = new Set(catalogCountries.map((c) => c.code));

  // Búsqueda en vivo (mín. 2 caracteres + debounce, igual que SaleCustomerSection)
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ForeignCustomerLookup[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);

  // Alta rápida
  const [draft, setDraft] = useState<CreateForeignCustomerInput>(() => emptyDraft());
  const [isCreating, setIsCreating] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const liveSearchRef = useRef<ReturnType<typeof createLiveSearch<ForeignCustomerLookup>> | null>(null);
  useEffect(() => {
    const live = createLiveSearch<ForeignCustomerLookup>({
      run: searchForeignCustomersAction,
      onChange: (state: LiveSearchState<ForeignCustomerLookup>) => {
        setIsSearching(state.status === "searching");
        if (state.status === "idle") {
          setResults([]); setSearchedQuery(null); setError(null);
        } else if (state.status === "done") {
          setResults(state.items); setSearchedQuery(state.query); setError(null);
        } else if (state.status === "error") {
          setResults([]); setSearchedQuery(state.query); setError(state.error);
        }
      },
    });
    liveSearchRef.current = live;
    return () => live.cancel();
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    liveSearchRef.current?.update(value);
  }

  // Enter: selecciona solo si hay un único resultado seleccionable
  // (país CAT-020 vigente) — los de país legado requieren corrección explícita.
  function handleSearchEnter() {
    if (isSearching || results.length !== 1) return;
    const only = results[0]!;
    if (validCountryCodes.has(only.country_code ?? "")) onSelect(only);
  }

  async function handleCreate() {
    setError(null);
    setIsCreating(true);
    try {
      const result = await createForeignCustomerAction(draft);
      if (!result.ok) { setError(result.error); return; }
      onSelect({
        id: result.id,
        customer_code: result.customer_code,
        name: draft.name,
        legal_name: draft.legal_name || null,
        id_type_code: draft.id_type_code,
        nit: draft.id_type_code === "36" ? draft.document_number : null,
        dui: draft.id_type_code !== "36" ? draft.document_number : null,
        country_code: draft.country_code,
        country_name: draft.country_name,
        customer_person_type: draft.customer_person_type,
        address_complement: draft.address_complement,
        activity_name: draft.activity_name,
        email: draft.email || null,
        phone: draft.phone || null,
      });
    } finally {
      setIsCreating(false);
    }
  }

  // Cliente con país legado (versión anterior de la Factura de
  // Exportación): se corrige explícitamente con CAT-020, nunca en automático.
  function handleCountryFixed(customerId: string, country: { country_code: string; country_name: string }) {
    setResults((rs) => rs.map((r) => (r.id === customerId ? { ...r, ...country } : r)));
  }

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8"
      onClick={handleBackdrop}
      onKeyDown={handleKeyDown}
    >
      <div className="w-full max-w-xl rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            {mode === "create" && (
              <button type="button" onClick={() => setMode("search")} className="text-zinc-500 hover:text-zinc-300">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-sm font-semibold text-zinc-100">
              {mode === "search" ? "Receptor extranjero" : "Nuevo cliente extranjero"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 rounded border border-red-700/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {mode === "search" ? (
          <div className="px-4 py-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                className={`${inputCls} pl-8 pr-8`}
                placeholder="Buscar por nombre, código, NIT, DUI…"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearchEnter(); } }}
                autoFocus
              />
              {isSearching && (
                <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-zinc-500" />
              )}
            </div>

            <div className="max-h-56 overflow-y-auto rounded border border-zinc-800 divide-y divide-zinc-800">
              {searchedQuery === null ? (
                <p className="px-3 py-3 text-xs text-zinc-600">
                  {query.trim().length > 0 && query.trim().length < LIVE_SEARCH_MIN_CHARS
                    ? `Escribe al menos ${LIVE_SEARCH_MIN_CHARS} caracteres.`
                    : "Busca un cliente extranjero existente."}
                </p>
              ) : results.length === 0 ? (
                <p className="px-3 py-3 text-xs text-zinc-500">Sin resultados para “{searchedQuery}”.</p>
              ) : (
                results.map((c) => !validCountryCodes.has(c.country_code ?? "") ? (
                  <LegacyCountryFix
                    key={c.id}
                    customer={c}
                    countryItems={countryItems}
                    onFixed={handleCountryFixed}
                    onError={setError}
                  />
                ) : (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelect(c)}
                    className="w-full text-left px-3 py-2 hover:bg-zinc-800 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-zinc-500">{c.customer_code}</span>
                      <span className="text-xs font-medium text-zinc-200 truncate">{c.name}</span>
                      {c.country_name && (
                        <span className="ml-auto text-[10px] text-zinc-500 flex-none">{c.country_name}</span>
                      )}
                    </div>
                    {(c.nit || c.dui) && (
                      <div className="mt-0.5 text-[10px] text-zinc-600">
                        {c.nit ? `NIT: ${c.nit}` : `DUI: ${c.dui}`}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => setMode("create")}
              className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-zinc-700 py-2 text-xs font-medium text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Crear cliente nuevo
            </button>
          </div>
        ) : (
          <div className="px-4 py-4">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 max-h-[60vh] overflow-y-auto pr-1">
              <div className="col-span-2">
                <label className={labelCls}>Nombre / razón social</label>
                <input className={inputCls} value={draft.name}
                  onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Nombre comercial (opcional)</label>
                <input className={inputCls} value={draft.legal_name ?? ""}
                  onChange={(e) => setDraft((s) => ({ ...s, legal_name: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Tipo de documento</label>
                <select className={inputCls} value={draft.id_type_code}
                  onChange={(e) => setDraft((s) => ({ ...s, id_type_code: e.target.value as CreateForeignCustomerInput["id_type_code"] }))}>
                  {idTypes.map((t) => <option key={t.item_code} value={t.item_code}>{t.item_label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Número de documento</label>
                <input className={inputCls} value={draft.document_number} maxLength={20}
                  onChange={(e) => setDraft((s) => ({ ...s, document_number: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>País destino</label>
                <CatalogSearchSelect
                  items={countryItems}
                  value={draft.country_code}
                  placeholder="Buscar país…"
                  onSelect={(country) =>
                    setDraft((s) => ({ ...s, country_code: country.code, country_name: country.label }))
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Tipo de persona (CAT-029)</label>
                <select className={inputCls} value={draft.customer_person_type}
                  onChange={(e) => setDraft((s) => ({ ...s, customer_person_type: e.target.value as CreateForeignCustomerInput["customer_person_type"] }))}>
                  {catalogCAT029.map((p) => <option key={p.item_code} value={p.item_code}>{p.item_label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Actividad económica</label>
                <input className={inputCls} value={draft.activity_name} maxLength={150}
                  onChange={(e) => setDraft((s) => ({ ...s, activity_name: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Dirección / complemento</label>
                <input className={inputCls} value={draft.address_complement} maxLength={200}
                  onChange={(e) => setDraft((s) => ({ ...s, address_complement: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Correo (oblig. si total ≥ $10,000)</label>
                <input className={inputCls} value={draft.email ?? ""}
                  onChange={(e) => setDraft((s) => ({ ...s, email: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Teléfono (opcional)</label>
                <input className={inputCls} value={draft.phone ?? ""}
                  onChange={(e) => setDraft((s) => ({ ...s, phone: e.target.value }))} />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                type="button"
                onClick={() => setMode("search")}
                className="h-8 px-3 text-xs text-zinc-400 border border-zinc-700 rounded hover:text-zinc-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating}
                className="h-8 px-4 flex items-center gap-1.5 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded disabled:opacity-50 transition-colors"
              >
                {isCreating && <Loader2 className="h-3 w-3 animate-spin" />}
                Guardar cliente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LegacyCountryFix({
  customer,
  countryItems,
  onFixed,
  onError,
}: {
  customer: ForeignCustomerLookup;
  countryItems: { code: string; label: string }[];
  onFixed: (customerId: string, country: { country_code: string; country_name: string }) => void;
  onError: (message: string | null) => void;
}) {
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!code) return;
    setSaving(true);
    onError(null);
    try {
      const result = await updateForeignCustomerCountryAction(customer.id, code);
      if (!result.ok) { onError(result.error); return; }
      onFixed(customer.id, { country_code: result.country_code, country_name: result.country_name });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-3 py-2 bg-amber-950/20">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-zinc-500">{customer.customer_code}</span>
        <span className="text-xs font-medium text-zinc-200 truncate">{customer.name}</span>
      </div>
      <p className="mt-1 text-[10px] text-amber-400">
        El país guardado ({customer.country_name ?? "sin nombre"} · {customer.country_code ?? "sin código"}) no
        pertenece al catálogo de países vigente. Seleccione el país correcto para poder facturar.
      </p>
      <div className="mt-1.5 flex gap-2">
        <div className="flex-1">
          <CatalogSearchSelect
            items={countryItems}
            value={code}
            placeholder="Buscar país…"
            onSelect={(country) => setCode(country.code)}
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!code || saving}
          className="h-8 px-3 flex items-center gap-1 text-xs text-zinc-200 border border-zinc-600 rounded hover:border-zinc-400 disabled:opacity-40 transition-colors"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Guardar país
        </button>
      </div>
    </div>
  );
}
