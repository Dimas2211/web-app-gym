"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — supplier-detail-tabs.tsx
//
// Pestañas de detalle del proveedor seleccionado.
//
// Pestañas:
//   Identificación — documentos + auditoría
//   Giro económico — actividad CAT-019
//   Dirección      — dept / municipio / país / complemento
//   Contacto       — nombre, cargo, teléfonos, email, whatsapp
//   Compras        — stub honesto (historial pendiente de S10D)
//
// Las pestañas vacías muestran estados explícitos, no arrays vacíos.
// ─────────────────────────────────────────────────────────────────

import { useActionState, useEffect, useRef, useState } from "react";
import { Building, Check, FileText, MapPin, Phone, Search, ShoppingBag } from "lucide-react";
import { updateSupplierActivityAction } from "../actions/update-supplier-activity.action";
import type { UpdateSupplierActivityState } from "../actions/update-supplier-activity.action";
import { updateSupplierAddressAction } from "../actions/update-supplier-address.action";
import type { UpdateSupplierAddressState } from "../actions/update-supplier-address.action";
import type { SupplierDetail } from "../types/supplier.types";
import type { CountryItem, EconomicActivityItem, MunicipalityItem } from "../types/supplier-catalogs.types";

// CAT-022 — mismo map que supplier-summary-panel para consistencia entre vistas
const ID_TYPE_LABELS: Record<string, string> = {
  "13": "DUI",
  "00": "NIT",
  "02": "Carné de residente",
  "03": "Pasaporte",
  "37": "Otro",
};

// ── Tipos ─────────────────────────────────────────────────────────

type TabId = "identificacion" | "giro" | "direccion" | "contacto" | "compras";

interface SupplierDetailTabsProps {
  detail:    SupplierDetail | null;
  canManage: boolean;
  onRefresh: () => void;
}

// ── Helper de campo ───────────────────────────────────────────────

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1 py-0.5">
      <span className="text-zinc-400 text-xs w-36 shrink-0 pt-0.5">{label}</span>
      <span className="text-zinc-700 text-xs flex-1 min-w-0 break-words font-medium">
        {value ?? <span className="text-zinc-300">—</span>}
      </span>
    </div>
  );
}

// ── Pestaña Identificación ────────────────────────────────────────

function IdentificacionTab({ detail }: { detail: SupplierDetail }) {
  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm">
      <div>
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
          Documentos
        </p>
        <FieldRow
          label="Tipo doc."
          value={
            detail.id_type_code
              ? `${ID_TYPE_LABELS[detail.id_type_code] ?? detail.id_type_code} (${detail.id_type_code})`
              : null
          }
        />
        <FieldRow label="DUI"            value={detail.dui  ? <span className="font-mono">{detail.dui}</span>  : null} />
        <FieldRow label="NIT"            value={detail.nit  ? <span className="font-mono">{detail.nit}</span>  : null} />
        <FieldRow label="NRC"            value={detail.nrc  ? <span className="font-mono">{detail.nrc}</span>  : null} />
        <FieldRow label="Otro documento" value={detail.other_document} />
      </div>
      <div>
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
          Auditoría
        </p>
        <FieldRow label="Creado"         value={detail.created_at_label} />
        <FieldRow label="Actualizado"    value={detail.updated_at_label} />
        <FieldRow label="Creado por"     value={detail.created_by} />
        <FieldRow label="Actualizado por" value={detail.updated_by} />
      </div>
    </div>
  );
}

// ── Pestaña Giro económico — zona de trabajo editable ────────────

function GiroTab({
  detail,
  canManage,
  onRefresh,
}: {
  detail:    SupplierDetail;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [editMode,    setEditMode]    = useState(false);
  const [selected,    setSelected]    = useState<{ code: string; name: string } | null>(null);
  const [search,      setSearch]      = useState("");
  const [results,     setResults]     = useState<EconomicActivityItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIdx,   setActiveIdx]   = useState(-1);
  const activeResultRef = useRef<HTMLButtonElement | null>(null);

  const [state, formAction, isPending] = useActionState(
    async (prev: UpdateSupplierActivityState, formData: FormData) => {
      const result = await updateSupplierActivityAction(prev, formData);
      if (result === undefined) {
        setEditMode(false);
        setSearch("");
        setResults([]);
        onRefresh();
      }
      return result;
    },
    undefined,
  );

  // Reset al cambiar de proveedor
  useEffect(() => {
    setEditMode(false);
    setSearch("");
    setResults([]);
    setSelected(null);
    setActiveIdx(-1);
  }, [detail.id]);

  // Reset activeIdx cuando cambian los resultados
  useEffect(() => { setActiveIdx(-1); }, [results]);

  // Scroll al resultado activo
  useEffect(() => {
    activeResultRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  // Búsqueda con debounce 350ms
  useEffect(() => {
    if (!editMode || !search.trim()) {
      setResults([]);
      return;
    }
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
  }, [search, editMode]);

  function enterEditMode() {
    setSelected(
      detail.activity_code
        ? { code: detail.activity_code, name: detail.activity_name ?? "" }
        : null,
    );
    setSearch("");
    setResults([]);
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
    setSearch("");
    setResults([]);
    setSelected(null);
    setActiveIdx(-1);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0 && results[activeIdx]) {
      e.preventDefault();
      setSelected({ code: results[activeIdx].code, name: results[activeIdx].name });
      setSearch("");
      setResults([]);
      setActiveIdx(-1);
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  }

  // ── Vista normal ──────────────────────────────────────────────
  if (!editMode) {
    return (
      <div className="p-4">
        {detail.activity_code || detail.activity_name ? (
          <div className="mb-3">
            <p className="text-xs font-mono text-zinc-400 mb-0.5">{detail.activity_code}</p>
            <p className="text-sm text-zinc-800">{detail.activity_name}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-zinc-300 text-sm text-center mb-3">
            <Building size={24} className="mb-2 opacity-30" />
            Sin actividad económica asignada
          </div>
        )}
        {canManage && (
          <button
            type="button"
            onClick={enterEditMode}
            className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600
                       hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
          >
            Editar giro
          </button>
        )}
      </div>
    );
  }

  // ── Modo edición ──────────────────────────────────────────────
  return (
    <div className="p-4">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
        Asignar actividad económica
      </p>

      {state?.error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          {state.error}
        </p>
      )}

      {/* Buscador + tabla de resultados */}
      <div className="border border-zinc-200 rounded-lg overflow-hidden mb-3">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-100 bg-zinc-50">
          <Search size={14} className="text-zinc-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Buscar por nombre o código (CAT-019)…"
            autoFocus
            className="flex-1 text-sm bg-transparent outline-none text-zinc-800 placeholder:text-zinc-400"
          />
        </div>
        <div className="max-h-52 overflow-y-auto">
          {isSearching && (
            <p className="text-xs text-zinc-400 text-center py-4">Buscando…</p>
          )}
          {!isSearching && search.trim() && results.length === 0 && (
            <p className="text-xs text-zinc-400 text-center py-4">Sin resultados</p>
          )}
          {!isSearching && !search.trim() && (
            <p className="text-xs text-zinc-400 text-center py-4">
              Escribe para buscar actividades económicas
            </p>
          )}
          {results.map((item, idx) => {
            const isSelected  = selected?.code === item.code;
            const isKeyActive = idx === activeIdx;
            return (
              <button
                key={item.code}
                ref={isKeyActive ? (el) => { activeResultRef.current = el; } : null}
                type="button"
                onClick={() => setSelected({ code: item.code, name: item.name })}
                className={`w-full text-left px-3 py-2 text-sm border-b border-zinc-50
                             last:border-0 transition-colors flex items-start gap-2
                             ${isKeyActive
                               ? "bg-zinc-200 ring-1 ring-inset ring-zinc-300"
                               : isSelected ? "bg-zinc-100" : "hover:bg-zinc-50"}`}
              >
                <span className="flex-1 min-w-0">
                  <span className="font-mono text-xs text-zinc-400 mr-2">{item.code}</span>
                  <span className="text-zinc-800">{item.name}</span>
                  {item.section && (
                    <span className="ml-2 text-xs text-zinc-400">· {item.section}</span>
                  )}
                </span>
                {isSelected && <Check size={13} className="text-zinc-600 shrink-0 mt-0.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selección actual */}
      {selected && (
        <div className="mb-3 px-3 py-2 bg-zinc-50 rounded-lg border border-zinc-200 text-xs">
          <span className="font-mono text-zinc-400 mr-2">{selected.code}</span>
          <span className="text-zinc-700">{selected.name}</span>
        </div>
      )}

      {/* Formulario */}
      <form action={formAction}>
        <input type="hidden" name="id"            value={detail.id} />
        <input type="hidden" name="activity_code" value={selected?.code ?? ""} />
        <input type="hidden" name="activity_name" value={selected?.name ?? ""} />

        <div className="flex gap-2">
          {/* Limpiar — solo si el proveedor ya tiene giro asignado */}
          {detail.activity_code && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-400
                         hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              Limpiar giro
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={isPending}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600
                         hover:bg-zinc-50 transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-900 text-white font-medium
                         hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── Pestaña Dirección — zona de trabajo editable ─────────────────

function DireccionTab({
  detail,
  canManage,
  onRefresh,
}: {
  detail:    SupplierDetail;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [editMode, setEditMode] = useState(false);

  // Municipio
  const [municipalitySearch,  setMunicipalitySearch]  = useState("");
  const [municipalityResults, setMunicipalityResults] = useState<MunicipalityItem[]>([]);
  const [isMuniSearching,     setIsMuniSearching]     = useState(false);
  const [selectedMunicipality, setSelectedMunicipality] = useState<{
    dept_code: string; dept_name: string; code: string; name: string;
  } | null>(null);
  const [muniActiveIdx,  setMuniActiveIdx]  = useState(-1);
  const muniActiveRef = useRef<HTMLButtonElement | null>(null);

  // País
  const [countries,          setCountries]          = useState<CountryItem[]>([]);
  const [isLoadingCountries, setIsLoadingCountries] = useState(false);
  const [selectedCountry,    setSelectedCountry]    = useState<{ code: string; name: string } | null>(null);

  // Complemento
  const [addressComplement, setAddressComplement] = useState("");

  const [state, formAction, isPending] = useActionState(
    async (prev: UpdateSupplierAddressState, formData: FormData) => {
      const result = await updateSupplierAddressAction(prev, formData);
      if (result === undefined) {
        setEditMode(false);
        setMunicipalitySearch("");
        setMunicipalityResults([]);
        onRefresh();
      }
      return result;
    },
    undefined,
  );

  // Reset al cambiar de proveedor
  useEffect(() => {
    setEditMode(false);
    setMunicipalitySearch("");
    setMunicipalityResults([]);
    setSelectedMunicipality(null);
    setSelectedCountry(null);
    setAddressComplement("");
    setMuniActiveIdx(-1);
  }, [detail.id]);

  // Reset muniActiveIdx cuando cambian los resultados
  useEffect(() => { setMuniActiveIdx(-1); }, [municipalityResults]);

  // Scroll al resultado activo de municipio
  useEffect(() => {
    muniActiveRef.current?.scrollIntoView({ block: "nearest" });
  }, [muniActiveIdx]);

  // Búsqueda de municipio con debounce 350ms
  useEffect(() => {
    if (!editMode || !municipalitySearch.trim()) {
      setMunicipalityResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setIsMuniSearching(true);
      try {
        const res = await fetch(
          `/api/catalogs/municipalities?search=${encodeURIComponent(municipalitySearch.trim())}&limit=80`,
        );
        if (res.ok) {
          const data = await res.json() as { items: MunicipalityItem[] };
          setMunicipalityResults(data.items ?? []);
        }
      } finally {
        setIsMuniSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [municipalitySearch, editMode]);

  function enterEditMode() {
    // Inicializar desde detail
    setSelectedMunicipality(
      detail.municipality_code
        ? {
            dept_code: detail.dept_code         ?? "",
            dept_name: detail.dept_name         ?? "",
            code:      detail.municipality_code,
            name:      detail.municipality_name ?? "",
          }
        : null,
    );
    setSelectedCountry(
      detail.country_code
        ? { code: detail.country_code, name: detail.country_name ?? "" }
        : null,
    );
    setAddressComplement(detail.address_complement ?? "");
    setMunicipalitySearch("");
    setMunicipalityResults([]);

    // Cargar países al entrar en modo edición
    setIsLoadingCountries(true);
    fetch("/api/catalogs/countries")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: CountryItem[] } | null) => setCountries(d?.items ?? []))
      .catch(() => setCountries([]))
      .finally(() => setIsLoadingCountries(false));

    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
    setMunicipalitySearch("");
    setMunicipalityResults([]);
    setSelectedMunicipality(null);
    setSelectedCountry(null);
    setAddressComplement("");
    setMuniActiveIdx(-1);
  }

  function handleMuniSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMuniActiveIdx((i) => Math.min(i + 1, municipalityResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMuniActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && muniActiveIdx >= 0 && municipalityResults[muniActiveIdx]) {
      e.preventDefault();
      const item = municipalityResults[muniActiveIdx];
      setSelectedMunicipality({ dept_code: item.dept_code, dept_name: item.dept_name, code: item.code, name: item.name });
      setMunicipalitySearch("");
      setMunicipalityResults([]);
      setMuniActiveIdx(-1);
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  }

  function clearAddress() {
    setSelectedMunicipality(null);
    setSelectedCountry(null);
    setAddressComplement("");
  }

  function handleCountryChange(code: string) {
    if (!code) {
      setSelectedCountry(null);
      return;
    }
    const item = countries.find((c) => c.code === code);
    setSelectedCountry(item ? { code: item.code, name: item.name } : { code, name: "" });
  }

  const hasAddress =
    detail.dept_code         ||
    detail.municipality_code ||
    detail.country_code      ||
    detail.address_complement;

  // ── Vista normal ──────────────────────────────────────────────
  if (!editMode) {
    return (
      <div className="p-4">
        {hasAddress ? (
          <div className="mb-3 text-sm">
            <FieldRow label="Departamento" value={detail.dept_name         ?? detail.dept_code} />
            <FieldRow label="Municipio"    value={detail.municipality_name ?? detail.municipality_code} />
            <FieldRow label="País"         value={detail.country_name      ?? detail.country_code} />
            <FieldRow label="Dirección"    value={detail.address_complement} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-zinc-300 text-sm text-center mb-3">
            <MapPin size={24} className="mb-2 opacity-30" />
            Sin dirección registrada
          </div>
        )}
        {canManage && (
          <button
            type="button"
            onClick={enterEditMode}
            className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600
                       hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
          >
            Editar dirección
          </button>
        )}
      </div>
    );
  }

  // ── Modo edición ──────────────────────────────────────────────
  return (
    <div className="p-4">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
        Editar dirección
      </p>

      {state?.error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          {state.error}
        </p>
      )}

      {/* ── Municipio / Departamento ──────────────────────────── */}
      <div className="mb-3">
        <p className="text-xs font-medium text-zinc-700 mb-1">Municipio / Departamento</p>

        {/* Buscador + tabla de resultados */}
        <div className="border border-zinc-200 rounded-lg overflow-hidden mb-2">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-100 bg-zinc-50">
            <Search size={14} className="text-zinc-400 shrink-0" />
            <input
              type="text"
              value={municipalitySearch}
              onChange={(e) => setMunicipalitySearch(e.target.value)}
              onKeyDown={handleMuniSearchKeyDown}
              placeholder="Buscar por municipio o departamento (CAT-013)…"
              autoFocus
              className="flex-1 text-sm bg-transparent outline-none text-zinc-800 placeholder:text-zinc-400"
            />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {isMuniSearching && (
              <p className="text-xs text-zinc-400 text-center py-4">Buscando…</p>
            )}
            {!isMuniSearching && municipalitySearch.trim() && municipalityResults.length === 0 && (
              <p className="text-xs text-zinc-400 text-center py-4">Sin resultados</p>
            )}
            {!isMuniSearching && !municipalitySearch.trim() && (
              <p className="text-xs text-zinc-400 text-center py-4">
                Escribe para buscar municipios
              </p>
            )}
            {municipalityResults.map((item, idx) => {
              const isSelected  = selectedMunicipality?.code === item.code &&
                                  selectedMunicipality?.dept_code === item.dept_code;
              const isKeyActive = idx === muniActiveIdx;
              return (
                <button
                  key={item.id}
                  ref={isKeyActive ? (el) => { muniActiveRef.current = el; } : null}
                  type="button"
                  onClick={() =>
                    setSelectedMunicipality({
                      dept_code: item.dept_code,
                      dept_name: item.dept_name,
                      code:      item.code,
                      name:      item.name,
                    })
                  }
                  className={`w-full text-left px-3 py-2 text-sm border-b border-zinc-50
                               last:border-0 transition-colors flex items-start gap-2
                               ${isKeyActive
                                 ? "bg-zinc-200 ring-1 ring-inset ring-zinc-300"
                                 : isSelected ? "bg-zinc-100" : "hover:bg-zinc-50"}`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="text-zinc-800">{item.name}</span>
                    <span className="text-zinc-400 text-xs ml-2">· {item.dept_name}</span>
                    <span className="font-mono text-xs text-zinc-300 ml-2">
                      {item.dept_code}/{item.code}
                    </span>
                  </span>
                  {isSelected && <Check size={13} className="text-zinc-600 shrink-0 mt-0.5" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Municipio seleccionado */}
        {selectedMunicipality && (
          <div className="px-3 py-2 bg-zinc-50 rounded-lg border border-zinc-200 text-xs flex items-center justify-between gap-2">
            <span>
              <span className="text-zinc-800 font-medium">{selectedMunicipality.name}</span>
              <span className="text-zinc-400 ml-2">· {selectedMunicipality.dept_name}</span>
              <span className="font-mono text-zinc-300 ml-2">
                {selectedMunicipality.dept_code}/{selectedMunicipality.code}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedMunicipality(null)}
              className="text-zinc-300 hover:text-zinc-500 shrink-0"
              aria-label="Quitar municipio"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* ── País ─────────────────────────────────────────────────── */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-zinc-700 mb-1">País</label>
        <select
          value={selectedCountry?.code ?? ""}
          onChange={(e) => handleCountryChange(e.target.value)}
          disabled={isLoadingCountries}
          className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent
                     text-zinc-800 disabled:opacity-50"
        >
          <option value="">— Sin país —</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* ── Dirección / Complemento ──────────────────────────────── */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-zinc-700 mb-1">
          Dirección / Complemento
        </label>
        <textarea
          value={addressComplement}
          onChange={(e) => setAddressComplement(e.target.value)}
          maxLength={300}
          rows={2}
          placeholder="Calle, número, colonia, referencia…"
          className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm resize-none
                     focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent
                     text-zinc-800"
        />
      </div>

      {/* Formulario — hidden inputs sincronizan el estado al submit */}
      <form action={formAction}>
        <input type="hidden" name="id"                 value={detail.id} />
        <input type="hidden" name="dept_code"          value={selectedMunicipality?.dept_code ?? ""} />
        <input type="hidden" name="dept_name"          value={selectedMunicipality?.dept_name ?? ""} />
        <input type="hidden" name="municipality_code"  value={selectedMunicipality?.code      ?? ""} />
        <input type="hidden" name="municipality_name"  value={selectedMunicipality?.name      ?? ""} />
        <input type="hidden" name="country_code"       value={selectedCountry?.code            ?? ""} />
        <input type="hidden" name="country_name"       value={selectedCountry?.name            ?? ""} />
        <input type="hidden" name="address_complement" value={addressComplement} />

        <div className="flex gap-2">
          {/* Limpiar — solo si el proveedor ya tiene algún campo de dirección */}
          {hasAddress && (
            <button
              type="button"
              onClick={clearAddress}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-400
                         hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              Limpiar dirección
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={isPending}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600
                         hover:bg-zinc-50 transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-900 text-white font-medium
                         hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── Pestaña Contacto ──────────────────────────────────────────────

function ContactoTab({ detail }: { detail: SupplierDetail }) {
  const hasContact =
    detail.contact_name ||
    detail.phone        ||
    detail.email        ||
    detail.whatsapp;

  if (!hasContact) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-zinc-300 text-sm text-center">
        <Phone size={24} className="mb-2 opacity-30" />
        Sin datos de contacto registrados
      </div>
    );
  }

  return (
    <div className="p-4 text-sm">
      <FieldRow label="Nombre"       value={detail.contact_name} />
      <FieldRow label="Cargo"        value={detail.contact_role} />
      <FieldRow label="Teléfono"     value={detail.phone} />
      <FieldRow label="Teléfono alt." value={detail.phone_alt} />
      <FieldRow label="Email"        value={detail.email} />
      <FieldRow label="WhatsApp"     value={detail.whatsapp} />
    </div>
  );
}

// ── Pestaña Compras (stub honesto) ────────────────────────────────

function ComprasStub() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center text-zinc-400">
      <ShoppingBag size={28} className="mb-2 opacity-25" />
      <p className="text-sm">El historial de compras estará disponible</p>
      <p className="text-xs mt-1 text-zinc-300">al integrar commerce/purchases</p>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────

export function SupplierDetailTabs({ detail, canManage, onRefresh }: SupplierDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("identificacion");

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "identificacion", label: "Identificación",  icon: FileText    },
    { id: "giro",           label: "Giro económico",  icon: Building    },
    { id: "direccion",      label: "Dirección",        icon: MapPin      },
    { id: "contacto",       label: "Contacto",         icon: Phone       },
    { id: "compras",        label: "Compras",          icon: ShoppingBag },
  ];

  const tabCls = (id: TabId) =>
    `flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ` +
    (activeTab === id
      ? "border-zinc-900 text-zinc-900"
      : "border-transparent text-zinc-400 hover:text-zinc-600 hover:border-zinc-300");

  if (!detail) {
    return (
      <div className="border-t border-zinc-100 flex items-center justify-center py-4 text-xs text-zinc-300">
        Selecciona un proveedor para ver el detalle
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-200 flex flex-col min-h-0">
      {/* Barra de pestañas */}
      <div className="flex overflow-x-auto border-b border-zinc-100 bg-white shrink-0 px-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={tabCls(id)}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Contenido de la pestaña activa */}
      <div className="flex-1 overflow-auto min-h-[100px]">
        {activeTab === "identificacion" && <IdentificacionTab detail={detail} />}
        {activeTab === "giro"           && <GiroTab detail={detail} canManage={canManage} onRefresh={onRefresh} />}
        {activeTab === "direccion"      && <DireccionTab detail={detail} canManage={canManage} onRefresh={onRefresh} />}
        {activeTab === "contacto"       && <ContactoTab       detail={detail} />}
        {activeTab === "compras"        && <ComprasStub />}
      </div>
    </div>
  );
}
