"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — supplier-summary-panel.tsx
//
// Panel de tres bloques para el proveedor seleccionado:
//   Bloque 1: identidad + estado + acciones (Editar / Cambiar estado)
//   Bloque 2: identificación fiscal (id_type, DUI, NIT, NRC)
//   Bloque 3: datos de contacto
//
// Sin key guard — a diferencia de productos, los proveedores no
// tienen flujo de clave previa al formulario de edición.
// ─────────────────────────────────────────────────────────────────

import { Building2, Pencil } from "lucide-react";
import type { SupplierDetail, TaxpayerType } from "../types/supplier.types";

// ── Mapas de presentación ─────────────────────────────────────────

// CAT-022 — códigos operativos de El Salvador
const ID_TYPE_LABELS: Record<string, string> = {
  "13": "DUI",
  "00": "NIT",
  "02": "Carné de residente",
  "03": "Pasaporte",
  "37": "Otro",
};

const TAXPAYER_LABELS: Record<TaxpayerType, string> = {
  LARGE_TAXPAYER: "Gran contribuyente",
  SMALL_TAXPAYER: "Pequeño contribuyente",
  NON_TAXPAYER:   "No contribuyente",
  FOREIGN:        "Extranjero",
  EXCLUDED_SUBJECT: "Sujeto excluido",
};

const STATUS_CONFIG = {
  active:   { label: "Activo",   cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  inactive: { label: "Inactivo", cls: "bg-zinc-100 text-zinc-500 border border-zinc-200" },
} as const;

// ── Sub-componentes ───────────────────────────────────────────────

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1 py-0.5">
      <span className="text-zinc-400 text-xs w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-zinc-800 font-medium text-xs flex-1 min-w-0 break-words">
        {value ?? <span className="text-zinc-300">—</span>}
      </span>
    </div>
  );
}

function EmptyPanel() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6 text-zinc-400">
      <Building2 size={32} className="mb-2 opacity-30" />
      <p className="text-sm">Selecciona un proveedor para ver el resumen</p>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="flex items-center justify-center h-full p-6 text-zinc-400 text-sm">
      Cargando…
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────

interface SupplierSummaryPanelProps {
  detail: SupplierDetail | null;
  isLoading?: boolean;
  canManage: boolean;
  onRequestStatusChange: () => void;
  onRequestEdit: () => void;
}

// ── Panel principal ───────────────────────────────────────────────

export function SupplierSummaryPanel({
  detail,
  isLoading = false,
  canManage,
  onRequestStatusChange,
  onRequestEdit,
}: SupplierSummaryPanelProps) {
  if (isLoading) return <LoadingPanel />;
  if (!detail)   return <EmptyPanel />;

  const statusCfg = STATUS_CONFIG[detail.status];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 h-full divide-y lg:divide-y-0 lg:divide-x divide-zinc-100">

      {/* ── Bloque 1: Identidad + estado + acciones ──────────────── */}
      <div className="p-4 overflow-y-auto">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="text-xs font-mono text-zinc-400 mb-0.5">{detail.supplier_code}</p>
            <h3 className="text-sm font-semibold text-zinc-900 leading-snug">{detail.name}</h3>
            {detail.legal_name && (
              <p className="text-xs text-zinc-400 mt-0.5">{detail.legal_name}</p>
            )}
          </div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${statusCfg.cls}`}>
            {statusCfg.label}
          </span>
        </div>

        <FieldRow label="Tipo contrib." value={TAXPAYER_LABELS[detail.taxpayer_type]} />
        {detail.account_code && (
          <FieldRow
            label="Cód. contable"
            value={<span className="font-mono">{detail.account_code}</span>}
          />
        )}
        <FieldRow label="Ingresado"   value={detail.created_at_label} />
        {detail.updated_at_label !== detail.created_at_label && (
          <FieldRow label="Actualizado" value={detail.updated_at_label} />
        )}

        {canManage && (
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={onRequestStatusChange}
              className="flex-1 text-xs border border-zinc-200 rounded-lg py-1.5 text-zinc-600
                         hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
            >
              Cambiar estado
            </button>
            <button
              type="button"
              onClick={onRequestEdit}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-zinc-200
                         rounded-lg py-1.5 text-zinc-600 hover:border-zinc-900 hover:text-zinc-900
                         hover:bg-zinc-50 transition-colors"
            >
              <Pencil size={11} />
              Editar
            </button>
          </div>
        )}

        {/* Giro económico — visible si hay actividad registrada */}
        {(detail.activity_code || detail.activity_name) && (
          <>
            <hr className="my-3 border-zinc-100" />
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">
              Giro
            </p>
            {detail.activity_code && (
              <FieldRow
                label="Cód. giro"
                value={<span className="font-mono">{detail.activity_code}</span>}
              />
            )}
            <FieldRow label="Actividad" value={detail.activity_name} />
          </>
        )}
      </div>

      {/* ── Bloque 2: Identificación fiscal + Dirección ──────────── */}
      <div className="p-4 overflow-y-auto">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
          Identificación fiscal
        </p>
        <FieldRow label="Tipo doc."  value={ID_TYPE_LABELS[detail.id_type_code ?? ""] ?? detail.id_type_code} />
        <FieldRow label="DUI"        value={detail.dui  ? <span className="font-mono">{detail.dui}</span>  : null} />
        <FieldRow label="NIT"        value={detail.nit  ? <span className="font-mono">{detail.nit}</span>  : null} />
        <FieldRow label="NRC"        value={detail.nrc  ? <span className="font-mono">{detail.nrc}</span>  : null} />
        <FieldRow label="Otro doc."  value={detail.other_document} />

        {/* Dirección — visible si hay algún campo de ubicación */}
        {(detail.dept_code || detail.municipality_code || detail.country_code || detail.address_complement) && (
          <>
            <hr className="my-3 border-zinc-100" />
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">
              Dirección
            </p>
            <FieldRow label="Departamento" value={detail.dept_name         ?? detail.dept_code} />
            <FieldRow label="Municipio"    value={detail.municipality_name ?? detail.municipality_code} />
            <FieldRow label="País"         value={detail.country_name      ?? detail.country_code} />
            <FieldRow label="Domicilio"    value={detail.address_complement} />
          </>
        )}
      </div>

      {/* ── Bloque 3: Contacto ────────────────────────────────────── */}
      <div className="p-4 overflow-y-auto">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
          Contacto
        </p>
        <FieldRow label="Nombre"       value={detail.contact_name} />
        <FieldRow label="Cargo"        value={detail.contact_role} />
        <FieldRow label="Teléfono"     value={detail.phone} />
        <FieldRow label="Alt. teléf."  value={detail.phone_alt} />
        <FieldRow label="Email"        value={detail.email} />
        <FieldRow label="WhatsApp"     value={detail.whatsapp} />
      </div>

    </div>
  );
}
