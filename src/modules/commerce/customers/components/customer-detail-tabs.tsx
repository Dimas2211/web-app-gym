"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/customers — customer-detail-tabs.tsx
//
// Pestañas de detalle del cliente seleccionado.
//
// Pestañas:
//   Identificación     — nombre, tipo contrib., documentos (editable)
//   Actividad económica — giro CAT-019 (editable)
//   Dirección          — dept / municipio / complemento (editable)
//   Contacto           — teléfono / correo (editable)
//   Preparación DTE    — estado FE 01 / CCFE 03 (solo lectura)
//   Auditoría          — creado por / actualizado por (solo lectura)
//
// Patrón: espeja supplier-detail-tabs.tsx adaptado a clientes fiscales.
// ─────────────────────────────────────────────────────────────────

import { useActionState, useEffect, useRef, useState } from "react";
import {
  Building,
  CheckCircle,
  ClipboardList,
  FileText,
  MapPin,
  Phone,
  XCircle,
} from "lucide-react";

import { updateCustomerIdentificationAction } from "../actions/update-customer-identification.action";
import type { UpdateCustomerIdentificationState } from "../actions/update-customer-identification.action";
import { updateCustomerActivityAction } from "../actions/update-customer-activity.action";
import type { UpdateCustomerActivityState } from "../actions/update-customer-activity.action";
import { updateCustomerAddressAction } from "../actions/update-customer-address.action";
import type { UpdateCustomerAddressState } from "../actions/update-customer-address.action";
import { updateCustomerContactAction } from "../actions/update-customer-contact.action";
import type { UpdateCustomerContactState } from "../actions/update-customer-contact.action";

import type { CustomerDetail, CustomerTaxpayerType } from "../types/customer.types";

// ── Catálogos locales ─────────────────────────────────────────────

const TAXPAYER_LABELS: Record<CustomerTaxpayerType, string> = {
  FINAL_CONSUMER:      "Consumidor final",
  REGISTERED_TAXPAYER: "Contribuyente registrado",
  EXCLUDED_SUBJECT:    "Sujeto excluido",
};

const ID_TYPE_OPTIONS = [
  { code: "13", label: "DUI" },
  { code: "00", label: "NIT" },
  { code: "36", label: "NIT (36 dígitos)" },
  { code: "02", label: "Carné de residente" },
  { code: "03", label: "Pasaporte" },
  { code: "37", label: "Otro" },
] as const;

const ID_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ID_TYPE_OPTIONS.map((o) => [o.code, o.label]),
);

// ── Tipos locales ──────────────────────────────────────────────────

type TabId = "identificacion" | "actividad" | "direccion" | "contacto" | "dte" | "auditoria";

interface CustomerDetailTabsProps {
  detail:    CustomerDetail | null;
  canManage: boolean;
  onRefresh: () => void;
}

interface EconomicActivityItem {
  code:    string;
  name:    string;
  section: string | null;
}

interface MunicipalityItem {
  id:        string;
  dept_code: string;
  dept_name: string;
  code:      string;
  name:      string;
}

// ── Helper de campo lectura ───────────────────────────────────────

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

// ── Lógica de preparación DTE ─────────────────────────────────────

function checkFe01(c: CustomerDetail): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!c.name?.trim()) missing.push("Nombre");
  return { ready: missing.length === 0, missing };
}

function checkCcfe03(c: CustomerDetail): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!c.name?.trim())               missing.push("Nombre");
  if (c.taxpayer_type !== "REGISTERED_TAXPAYER") missing.push("Tipo: Contribuyente registrado");
  if (!c.nit?.trim())                missing.push("NIT");
  if (!c.nrc?.trim())                missing.push("NRC");
  if (!c.activity_code?.trim())      missing.push("Código de actividad");
  if (!c.activity_name?.trim())      missing.push("Nombre de actividad");
  if (!c.dept_code?.trim())          missing.push("Departamento");
  if (!c.municipality_code?.trim())  missing.push("Municipio");
  if (!c.address_complement?.trim()) missing.push("Dirección");
  return { ready: missing.length === 0, missing };
}

// ── Pestaña Identificación ────────────────────────────────────────

function IdentificacionTab({
  detail,
  canManage,
  onRefresh,
}: {
  detail:    CustomerDetail;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [name,          setName]          = useState(detail.name);
  const [legalName,     setLegalName]     = useState(detail.legal_name ?? "");
  const [taxpayerType,  setTaxpayerType]  = useState(detail.taxpayer_type ?? "FINAL_CONSUMER");
  const [idTypeCode,    setIdTypeCode]    = useState(detail.id_type_code ?? "");
  const [nit,           setNit]           = useState(detail.nit ?? "");
  const [nrc,           setNrc]           = useState(detail.nrc ?? "");
  const [dui,           setDui]           = useState(detail.dui ?? "");

  const [state, formAction, isPending] = useActionState(
    async (prev: UpdateCustomerIdentificationState, formData: FormData) => {
      const result = await updateCustomerIdentificationAction(prev, formData);
      if (result === undefined) {
        setEditMode(false);
        onRefresh();
      }
      return result;
    },
    undefined,
  );

  useEffect(() => {
    setEditMode(false);
    setName(detail.name);
    setLegalName(detail.legal_name ?? "");
    setTaxpayerType(detail.taxpayer_type ?? "FINAL_CONSUMER");
    setIdTypeCode(detail.id_type_code ?? "");
    setNit(detail.nit ?? "");
    setNrc(detail.nrc ?? "");
    setDui(detail.dui ?? "");
  }, [detail.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function enterEdit() {
    setName(detail.name);
    setLegalName(detail.legal_name ?? "");
    setTaxpayerType(detail.taxpayer_type ?? "FINAL_CONSUMER");
    setIdTypeCode(detail.id_type_code ?? "");
    setNit(detail.nit ?? "");
    setNrc(detail.nrc ?? "");
    setDui(detail.dui ?? "");
    setEditMode(true);
  }

  function cancelEdit() { setEditMode(false); }

  const inputCls =
    "w-full border border-zinc-300 rounded-lg px-3 py-1.5 text-sm " +
    "focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent text-zinc-800";
  const labelCls = "block text-xs font-medium text-zinc-700 mb-1";

  if (!editMode) {
    return (
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 mb-3 text-sm">
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
              Identidad
            </p>
            <FieldRow label="Código"      value={<span className="font-mono">{detail.customer_code}</span>} />
            <FieldRow label="Nombre"      value={detail.name} />
            <FieldRow label="Nombre legal" value={detail.legal_name} />
            <FieldRow label="Tipo contrib."
              value={detail.taxpayer_type ? TAXPAYER_LABELS[detail.taxpayer_type] : null}
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
              Documentos
            </p>
            <FieldRow label="Tipo doc."
              value={detail.id_type_code ? (ID_TYPE_LABELS[detail.id_type_code] ?? detail.id_type_code) : null}
            />
            <FieldRow label="DUI" value={detail.dui  ? <span className="font-mono">{detail.dui}</span>  : null} />
            <FieldRow label="NIT" value={detail.nit  ? <span className="font-mono">{detail.nit}</span>  : null} />
            <FieldRow label="NRC" value={detail.nrc  ? <span className="font-mono">{detail.nrc}</span>  : null} />
          </div>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={enterEdit}
            className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600
                       hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
          >
            Editar identificación
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="p-4">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
        Editar identificación
      </p>

      {state?.error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          {state.error}
        </p>
      )}

      <form action={formAction}>
        <input type="hidden" name="id" value={detail.id} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mb-4">
          {/* Nombre */}
          <div>
            <label className={labelCls}>Nombre *</label>
            <input
              type="text"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              required
              className={inputCls}
            />
          </div>

          {/* Nombre legal */}
          <div>
            <label className={labelCls}>Nombre legal / razón social</label>
            <input
              type="text"
              name="legal_name"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              maxLength={200}
              className={inputCls}
            />
          </div>

          {/* Tipo contribuyente */}
          <div>
            <label className={labelCls}>Tipo de contribuyente *</label>
            <select
              name="taxpayer_type"
              value={taxpayerType}
              onChange={(e) => setTaxpayerType(e.target.value as CustomerTaxpayerType)}
              className={inputCls}
            >
              <option value="FINAL_CONSUMER">Consumidor final</option>
              <option value="REGISTERED_TAXPAYER">Contribuyente registrado</option>
              <option value="EXCLUDED_SUBJECT">Sujeto excluido</option>
            </select>
          </div>

          {/* Tipo de documento */}
          <div>
            <label className={labelCls}>Tipo de documento</label>
            <select
              name="id_type_code"
              value={idTypeCode}
              onChange={(e) => setIdTypeCode(e.target.value)}
              className={inputCls}
            >
              <option value="">— Sin tipo —</option>
              {ID_TYPE_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>{o.label} ({o.code})</option>
              ))}
            </select>
          </div>

          {/* NIT */}
          <div>
            <label className={labelCls}>NIT</label>
            <input
              type="text"
              name="nit"
              value={nit}
              onChange={(e) => setNit(e.target.value)}
              maxLength={20}
              placeholder="0000-000000-000-0"
              className={`${inputCls} font-mono`}
            />
          </div>

          {/* NRC */}
          <div>
            <label className={labelCls}>NRC</label>
            <input
              type="text"
              name="nrc"
              value={nrc}
              onChange={(e) => setNrc(e.target.value)}
              maxLength={20}
              placeholder="000000-0"
              className={`${inputCls} font-mono`}
            />
          </div>

          {/* DUI */}
          <div>
            <label className={labelCls}>DUI</label>
            <input
              type="text"
              name="dui"
              value={dui}
              onChange={(e) => setDui(e.target.value)}
              maxLength={20}
              placeholder="00000000-0"
              className={`${inputCls} font-mono`}
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
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
      </form>
    </div>
  );
}

// ── Pestaña Actividad económica ────────────────────────────────────

function ActividadTab({
  detail,
  canManage,
  onRefresh,
}: {
  detail:    CustomerDetail;
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
    async (prev: UpdateCustomerActivityState, formData: FormData) => {
      const result = await updateCustomerActivityAction(prev, formData);
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

  useEffect(() => {
    setEditMode(false);
    setSearch("");
    setResults([]);
    setSelected(null);
    setActiveIdx(-1);
  }, [detail.id]);

  useEffect(() => { setActiveIdx(-1); }, [results]);

  useEffect(() => {
    activeResultRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  useEffect(() => {
    if (!editMode || !search.trim()) { setResults([]); return; }
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
      } finally { setIsSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [search, editMode]);

  function enterEdit() {
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
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  }

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
            onClick={enterEdit}
            className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600
                       hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
          >
            Editar actividad
          </button>
        )}
      </div>
    );
  }

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

      {/* Buscador */}
      <div className="border border-zinc-200 rounded-lg overflow-hidden mb-3">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-100 bg-zinc-50">
          <span className="text-zinc-400 text-xs shrink-0">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
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
            const isSel      = selected?.code === item.code;
            const isKeyActive = idx === activeIdx;
            return (
              <button
                key={item.code}
                ref={isKeyActive ? (el) => { activeResultRef.current = el; } : null}
                type="button"
                onClick={() => { setSelected({ code: item.code, name: item.name }); setSearch(""); setResults([]); }}
                className={`w-full text-left px-3 py-2 text-sm border-b border-zinc-50 last:border-0
                             transition-colors flex items-start gap-2
                             ${isKeyActive ? "bg-zinc-200 ring-1 ring-inset ring-zinc-300"
                               : isSel ? "bg-zinc-100" : "hover:bg-zinc-50"}`}
              >
                <span className="flex-1 min-w-0">
                  <span className="font-mono text-xs text-zinc-400 mr-2">{item.code}</span>
                  <span className="text-zinc-800">{item.name}</span>
                  {item.section && (
                    <span className="ml-2 text-xs text-zinc-400">· {item.section}</span>
                  )}
                </span>
                {isSel && <CheckCircle size={13} className="text-zinc-600 shrink-0 mt-0.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="mb-3 px-3 py-2 bg-zinc-50 rounded-lg border border-zinc-200 text-xs">
          <span className="font-mono text-zinc-400 mr-2">{selected.code}</span>
          <span className="text-zinc-700">{selected.name}</span>
        </div>
      )}

      <form action={formAction}>
        <input type="hidden" name="id"            value={detail.id} />
        <input type="hidden" name="activity_code" value={selected?.code ?? ""} />
        <input type="hidden" name="activity_name" value={selected?.name ?? ""} />

        <div className="flex gap-2">
          {detail.activity_code && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-400
                         hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              Limpiar actividad
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

// ── Pestaña Dirección ─────────────────────────────────────────────

function DireccionTab({
  detail,
  canManage,
  onRefresh,
}: {
  detail:    CustomerDetail;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [editMode, setEditMode] = useState(false);

  const [muniSearch,   setMuniSearch]   = useState("");
  const [muniResults,  setMuniResults]  = useState<MunicipalityItem[]>([]);
  const [isMuniSearching, setIsMuniSearching] = useState(false);
  const [selectedMuni, setSelectedMuni] = useState<{
    dept_code: string; dept_name: string; code: string; name: string;
  } | null>(null);
  const [muniActiveIdx, setMuniActiveIdx] = useState(-1);
  const muniActiveRef = useRef<HTMLButtonElement | null>(null);

  const [addressComplement, setAddressComplement] = useState("");

  const [state, formAction, isPending] = useActionState(
    async (prev: UpdateCustomerAddressState, formData: FormData) => {
      const result = await updateCustomerAddressAction(prev, formData);
      if (result === undefined) {
        setEditMode(false);
        setMuniSearch("");
        setMuniResults([]);
        onRefresh();
      }
      return result;
    },
    undefined,
  );

  useEffect(() => {
    setEditMode(false);
    setMuniSearch("");
    setMuniResults([]);
    setSelectedMuni(null);
    setAddressComplement("");
    setMuniActiveIdx(-1);
  }, [detail.id]);

  useEffect(() => { setMuniActiveIdx(-1); }, [muniResults]);

  useEffect(() => {
    muniActiveRef.current?.scrollIntoView({ block: "nearest" });
  }, [muniActiveIdx]);

  useEffect(() => {
    if (!editMode || !muniSearch.trim()) { setMuniResults([]); return; }
    const t = setTimeout(async () => {
      setIsMuniSearching(true);
      try {
        const res = await fetch(
          `/api/catalogs/municipalities?search=${encodeURIComponent(muniSearch.trim())}&limit=80`,
        );
        if (res.ok) {
          const data = await res.json() as { items: MunicipalityItem[] };
          setMuniResults(data.items ?? []);
        }
      } finally { setIsMuniSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [muniSearch, editMode]);

  function enterEdit() {
    // Inicializa municipio desde los códigos guardados (no hay nombres en CustomerDetail)
    setSelectedMuni(
      detail.municipality_code && detail.dept_code
        ? { dept_code: detail.dept_code, dept_name: "", code: detail.municipality_code, name: detail.municipality_code }
        : null,
    );
    // Resuelve nombre del municipio si hay códigos
    if (detail.municipality_code && detail.dept_code) {
      fetch(`/api/catalogs/municipalities?dept_code=${encodeURIComponent(detail.dept_code)}&limit=50`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { items?: MunicipalityItem[] } | null) => {
          const found = d?.items?.find((m) => m.code === detail.municipality_code);
          if (found) {
            setSelectedMuni({
              dept_code: found.dept_code,
              dept_name: found.dept_name,
              code:      found.code,
              name:      found.name,
            });
          }
        })
        .catch(() => undefined);
    }
    setAddressComplement(detail.address_complement ?? "");
    setMuniSearch("");
    setMuniResults([]);
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
    setMuniSearch("");
    setMuniResults([]);
    setSelectedMuni(null);
    setAddressComplement("");
    setMuniActiveIdx(-1);
  }

  function handleMuniKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMuniActiveIdx((i) => Math.min(i + 1, muniResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMuniActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && muniActiveIdx >= 0 && muniResults[muniActiveIdx]) {
      e.preventDefault();
      const item = muniResults[muniActiveIdx];
      setSelectedMuni({ dept_code: item.dept_code, dept_name: item.dept_name, code: item.code, name: item.name });
      setMuniSearch("");
      setMuniResults([]);
      setMuniActiveIdx(-1);
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  }

  const hasAddress = detail.dept_code || detail.municipality_code || detail.address_complement;

  if (!editMode) {
    return (
      <div className="p-4">
        {hasAddress ? (
          <div className="mb-3 text-sm">
            <FieldRow label="Departamento"
              value={detail.dept_code ? <span className="font-mono">{detail.dept_code}</span> : null}
            />
            <FieldRow label="Municipio"
              value={detail.municipality_code
                ? <span className="font-mono">{detail.dept_code}/{detail.municipality_code}</span>
                : null}
            />
            <FieldRow label="Dirección" value={detail.address_complement} />
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
            onClick={enterEdit}
            className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600
                       hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
          >
            Editar dirección
          </button>
        )}
      </div>
    );
  }

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

      {/* Municipio / Departamento */}
      <div className="mb-3">
        <p className="text-xs font-medium text-zinc-700 mb-1">Municipio / Departamento</p>
        <div className="border border-zinc-200 rounded-lg overflow-hidden mb-2">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-100 bg-zinc-50">
            <span className="text-zinc-400 text-xs shrink-0">🔍</span>
            <input
              type="text"
              value={muniSearch}
              onChange={(e) => setMuniSearch(e.target.value)}
              onKeyDown={handleMuniKeyDown}
              placeholder="Buscar municipio o departamento (CAT-013)…"
              autoFocus
              className="flex-1 text-sm bg-transparent outline-none text-zinc-800 placeholder:text-zinc-400"
            />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {isMuniSearching && (
              <p className="text-xs text-zinc-400 text-center py-4">Buscando…</p>
            )}
            {!isMuniSearching && muniSearch.trim() && muniResults.length === 0 && (
              <p className="text-xs text-zinc-400 text-center py-4">Sin resultados</p>
            )}
            {!isMuniSearching && !muniSearch.trim() && (
              <p className="text-xs text-zinc-400 text-center py-4">
                Escribe para buscar municipios
              </p>
            )}
            {muniResults.map((item, idx) => {
              const isSel      = selectedMuni?.code === item.code && selectedMuni?.dept_code === item.dept_code;
              const isKeyActive = idx === muniActiveIdx;
              return (
                <button
                  key={item.id}
                  ref={isKeyActive ? (el) => { muniActiveRef.current = el; } : null}
                  type="button"
                  onClick={() => {
                    setSelectedMuni({ dept_code: item.dept_code, dept_name: item.dept_name, code: item.code, name: item.name });
                    setMuniSearch("");
                    setMuniResults([]);
                    setMuniActiveIdx(-1);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm border-b border-zinc-50 last:border-0
                               transition-colors flex items-start gap-2
                               ${isKeyActive ? "bg-zinc-200 ring-1 ring-inset ring-zinc-300"
                                 : isSel ? "bg-zinc-100" : "hover:bg-zinc-50"}`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="text-zinc-800">{item.name}</span>
                    <span className="text-zinc-400 text-xs ml-2">· {item.dept_name}</span>
                    <span className="font-mono text-xs text-zinc-300 ml-2">{item.dept_code}/{item.code}</span>
                  </span>
                  {isSel && <CheckCircle size={13} className="text-zinc-600 shrink-0 mt-0.5" />}
                </button>
              );
            })}
          </div>
        </div>

        {selectedMuni && (
          <div className="px-3 py-2 bg-zinc-50 rounded-lg border border-zinc-200 text-xs
                          flex items-center justify-between gap-2">
            <span>
              <span className="text-zinc-800 font-medium">{selectedMuni.name || selectedMuni.code}</span>
              {selectedMuni.dept_name && (
                <span className="text-zinc-400 ml-2">· {selectedMuni.dept_name}</span>
              )}
              <span className="font-mono text-zinc-300 ml-2">{selectedMuni.dept_code}/{selectedMuni.code}</span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedMuni(null)}
              className="text-zinc-300 hover:text-zinc-500 shrink-0"
              aria-label="Quitar municipio"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Dirección complemento */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-zinc-700 mb-1">
          Dirección / Complemento
        </label>
        <textarea
          value={addressComplement}
          onChange={(e) => setAddressComplement(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Calle, número, colonia, referencia…"
          className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm resize-none
                     focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent
                     text-zinc-800"
        />
      </div>

      <form action={formAction}>
        <input type="hidden" name="id"                value={detail.id} />
        <input type="hidden" name="dept_code"         value={selectedMuni?.dept_code ?? ""} />
        <input type="hidden" name="municipality_code" value={selectedMuni?.code      ?? ""} />
        <input type="hidden" name="address_complement" value={addressComplement} />

        <div className="flex gap-2">
          {hasAddress && (
            <button
              type="button"
              onClick={() => { setSelectedMuni(null); setAddressComplement(""); }}
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

function ContactoTab({
  detail,
  canManage,
  onRefresh,
}: {
  detail:    CustomerDetail;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [phone,    setPhone]    = useState(detail.phone ?? "");
  const [email,    setEmail]    = useState(detail.email ?? "");

  const [state, formAction, isPending] = useActionState(
    async (prev: UpdateCustomerContactState, formData: FormData) => {
      const result = await updateCustomerContactAction(prev, formData);
      if (result === undefined) {
        setEditMode(false);
        onRefresh();
      }
      return result;
    },
    undefined,
  );

  useEffect(() => {
    setEditMode(false);
    setPhone(detail.phone ?? "");
    setEmail(detail.email ?? "");
  }, [detail.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function enterEdit() {
    setPhone(detail.phone ?? "");
    setEmail(detail.email ?? "");
    setEditMode(true);
  }

  const inputCls =
    "w-full border border-zinc-300 rounded-lg px-3 py-1.5 text-sm " +
    "focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent text-zinc-800";

  const hasContact = detail.phone || detail.email;

  if (!editMode) {
    return (
      <div className="p-4">
        {hasContact ? (
          <div className="mb-3 text-sm">
            <FieldRow label="Teléfono" value={detail.phone} />
            <FieldRow label="Correo"   value={detail.email} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-zinc-300 text-sm text-center mb-3">
            <Phone size={24} className="mb-2 opacity-30" />
            Sin datos de contacto registrados
          </div>
        )}
        {canManage && (
          <button
            type="button"
            onClick={enterEdit}
            className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600
                       hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
          >
            Editar contacto
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="p-4">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
        Editar contacto
      </p>

      {state?.error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          {state.error}
        </p>
      )}

      <form action={formAction}>
        <input type="hidden" name="id" value={detail.id} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Teléfono</label>
            <input
              type="tel"
              name="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={20}
              placeholder="0000-0000"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Correo electrónico</label>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={100}
              placeholder="correo@ejemplo.com"
              className={inputCls}
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => setEditMode(false)}
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
      </form>
    </div>
  );
}

// ── Pestaña Preparación DTE ───────────────────────────────────────

function DteTab({ detail }: { detail: CustomerDetail }) {
  const fe01   = checkFe01(detail);
  const ccfe03 = checkCcfe03(detail);

  function ReadinessBlock({
    label,
    ready,
    missing,
  }: {
    label: string; ready: boolean; missing: string[];
  }) {
    return (
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          {ready
            ? <CheckCircle size={15} className="text-emerald-500 shrink-0" />
            : <XCircle    size={15} className="text-red-400 shrink-0" />}
          <span className={`text-sm font-semibold ${ready ? "text-emerald-700" : "text-red-600"}`}>
            {label}: {ready ? "Listo" : "Incompleto"}
          </span>
        </div>
        {!ready && missing.length > 0 && (
          <ul className="ml-6 space-y-0.5">
            {missing.map((m) => (
              <li key={m} className="text-xs text-zinc-500 list-disc">{m}</li>
            ))}
          </ul>
        )}
        {ready && (
          <p className="ml-6 text-xs text-zinc-400 italic">
            Todos los datos requeridos están completos.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="p-4">
      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
        Estado de preparación
      </p>
      <ReadinessBlock label="FE 01 — Factura electrónica"     ready={fe01.ready}   missing={fe01.missing} />
      <ReadinessBlock label="CCFE 03 — Crédito fiscal"        ready={ccfe03.ready} missing={ccfe03.missing} />
      {ccfe03.ready && (
        <div className="mt-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="text-xs text-emerald-700">
            Este cliente puede usarse como receptor en un Comprobante de Crédito Fiscal Electrónico (CCFE 03).
          </p>
        </div>
      )}
      <p className="mt-4 text-xs text-zinc-400">
        Esta pantalla se actualiza al guardar cambios en las otras pestañas. No genera DTE ni JSON.
      </p>
    </div>
  );
}

// ── Pestaña Auditoría ─────────────────────────────────────────────

function AuditoriaTab({ detail }: { detail: CustomerDetail }) {
  const fmtDate = (d: Date | string | null | undefined) => {
    if (!d) return null;
    try {
      return new Date(d).toLocaleString("es-SV", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return String(d); }
  };

  const STATUS_CONFIG = {
    active:   { label: "Activo",   cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
    inactive: { label: "Inactivo", cls: "bg-zinc-100 text-zinc-500 border border-zinc-200" },
  } as const;

  const statusCfg = STATUS_CONFIG[detail.status];

  return (
    <div className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm">
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
            Creación
          </p>
          <FieldRow label="Creado por"  value={detail.created_by_name ?? detail.created_by} />
          <FieldRow label="Fecha"       value={fmtDate(detail.created_at)} />
        </div>
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
            Última modificación
          </p>
          <FieldRow label="Actualizado por" value={detail.updated_by_name ?? detail.updated_by} />
          <FieldRow label="Fecha"           value={fmtDate(detail.updated_at)} />
        </div>
      </div>
      <hr className="my-3 border-zinc-100" />
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400">Estado actual:</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.cls}`}>
          {statusCfg.label}
        </span>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────

export function CustomerDetailTabs({ detail, canManage, onRefresh }: CustomerDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("identificacion");

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "identificacion", label: "Identificación",      icon: FileText      },
    { id: "actividad",      label: "Actividad económica", icon: Building      },
    { id: "direccion",      label: "Dirección",            icon: MapPin        },
    { id: "contacto",       label: "Contacto",             icon: Phone         },
    { id: "dte",            label: "Preparación DTE",      icon: ClipboardList },
    { id: "auditoria",      label: "Auditoría",            icon: FileText      },
  ];

  const tabCls = (id: TabId) =>
    `flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ` +
    (activeTab === id
      ? "border-zinc-900 text-zinc-900"
      : "border-transparent text-zinc-400 hover:text-zinc-600 hover:border-zinc-300");

  if (!detail) {
    return (
      <div className="border-t border-zinc-100 flex items-center justify-center py-4 text-xs text-zinc-300">
        Selecciona un cliente para ver el detalle
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
        {activeTab === "identificacion" && (
          <IdentificacionTab detail={detail} canManage={canManage} onRefresh={onRefresh} />
        )}
        {activeTab === "actividad" && (
          <ActividadTab detail={detail} canManage={canManage} onRefresh={onRefresh} />
        )}
        {activeTab === "direccion" && (
          <DireccionTab detail={detail} canManage={canManage} onRefresh={onRefresh} />
        )}
        {activeTab === "contacto" && (
          <ContactoTab detail={detail} canManage={canManage} onRefresh={onRefresh} />
        )}
        {activeTab === "dte"       && <DteTab       detail={detail} />}
        {activeTab === "auditoria" && <AuditoriaTab detail={detail} />}
      </div>
    </div>
  );
}
