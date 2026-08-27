"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-customer-modal.tsx
//
// F3-C21B — Modal de receptor extranjero: buscar/seleccionar cliente
// existente o crear uno nuevo. Captura extensa vive en el modal, no
// en la pantalla principal (regla F3-C21B).
// ─────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Loader2, Search, X, Plus, ArrowLeft } from "lucide-react";
import {
  searchForeignCustomersAction,
  createForeignCustomerAction,
} from "../actions/export-sale.actions";
import type { ForeignCustomerLookup } from "../queries/search-foreign-customers";
import type { CreateForeignCustomerInput } from "../schemas/export-sale.schemas";
import type { DteCatalogItem } from "@/modules/commerce/dte/types/dte-catalog.types";
import { CatalogSearchSelect } from "./catalog-search-select";

interface Props {
  onClose: () => void;
  onSelect: (customer: ForeignCustomerLookup) => void;
  // País (F3-C23D): catálogo de compatibilidad FEX v1 para receptor.codPais
  // (catalog_code "FEX-11-V1-CODPAIS", códigos numéricos legados) — NO
  // CAT-020 (ISO alpha-2, modelo `Country`). Mientras FEX 11 siga sobre el
  // schema v1 local, este campo debe guardar un código de este catálogo
  // (ej. "9540"), nunca un código ISO como "US". Ver
  // docs/dte-official/extracts/fex11-catalogs-operational.md.
  catalogFexCountries: DteCatalogItem[];
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

function emptyDraft(catalogFexCountries: DteCatalogItem[]): CreateForeignCustomerInput {
  return {
    name: "", legal_name: "", id_type_code: "03", document_number: "",
    country_code: catalogFexCountries[0]?.item_code ?? "", country_name: catalogFexCountries[0]?.item_label ?? "",
    customer_person_type: "2", activity_name: "", address_complement: "", phone: "", email: "",
  };
}

export function ExportCustomerModal({ onClose, onSelect, catalogFexCountries, catalogCAT022, catalogCAT029 }: Props) {
  const [mode, setMode] = useState<"search" | "create">("search");
  const idTypes = receiverIdTypes(catalogCAT022);

  // Búsqueda
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ForeignCustomerLookup[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Alta rápida
  const [draft, setDraft] = useState<CreateForeignCustomerInput>(() => emptyDraft(catalogFexCountries));
  const [isCreating, setIsCreating] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    setIsSearching(true);
    setError(null);
    try {
      const result = await searchForeignCustomersAction(query);
      if (result.ok) setResults(result.items);
      else { setError(result.error); setResults([]); }
    } finally {
      setHasSearched(true);
      setIsSearching(false);
    }
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
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                <input
                  className={`${inputCls} pl-8`}
                  placeholder="Buscar por nombre, NIT, DUI…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={runSearch}
                disabled={isSearching}
                className="h-8 px-3 flex items-center gap-1 text-xs text-zinc-300 border border-zinc-700 rounded hover:border-zinc-500 disabled:opacity-40 transition-colors"
              >
                {isSearching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                Buscar
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto rounded border border-zinc-800 divide-y divide-zinc-800">
              {!hasSearched ? (
                <p className="px-3 py-3 text-xs text-zinc-600">Busca un cliente extranjero existente.</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-3 text-xs text-zinc-500">Sin resultados para “{query}”.</p>
              ) : (
                results.map((c) => (
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
                <input className={inputCls} value={draft.document_number}
                  onChange={(e) => setDraft((s) => ({ ...s, document_number: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>País (FEX v1)</label>
                <CatalogSearchSelect
                  items={catalogFexCountries.map((c) => ({ code: c.item_code, label: c.item_label }))}
                  value={draft.country_code}
                  placeholder="Buscar país…"
                  onSelect={(country) =>
                    setDraft((s) => ({ ...s, country_code: country.code, country_name: country.label }))
                  }
                />
                <p className="mt-1 text-[10px] text-zinc-600">
                  Catálogo de compatibilidad FEX v1 (no CAT-020 ISO) — código numérico. Países confirmados
                  aparecen primero (ej. Estados Unidos = 9540); el resto muestra &quot;nombre no
                  confirmado&quot; porque el repo no tiene una fuente oficial con nombres reales para esos
                  códigos legados — verifique el código correcto con el catálogo del MH antes de transmitir.
                </p>
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
                <input className={inputCls} value={draft.activity_name}
                  onChange={(e) => setDraft((s) => ({ ...s, activity_name: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Dirección / complemento</label>
                <input className={inputCls} value={draft.address_complement}
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
