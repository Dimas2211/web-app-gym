"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — supplier-context-panel.tsx
//
// Panel de contexto visual del proveedor seleccionado en la
// cabecera de compra. Solo lectura, sin estado propio.
//
// Estados:
//   supplier === null → placeholder dashed
//   supplier !== null → nombre, badge tipo contrib., código, NIT, NRC
//
// NIT y NRC se omiten silenciosamente cuando son null.
// ─────────────────────────────────────────────────────────────────

import type { SupplierForPurchaseLookup, TaxpayerType } from "../types/supplier.types";

// ── Badge de tipo de contribuyente ────────────────────────────────

const TAXPAYER_CONFIG: Record<
  TaxpayerType,
  { label: string; cls: string }
> = {
  LARGE_TAXPAYER: {
    label: "Gran contrib.",
    cls:   "bg-emerald-900/40 text-emerald-300 border border-emerald-700/50",
  },
  SMALL_TAXPAYER: {
    label: "Pequeño contrib.",
    cls:   "bg-amber-900/40 text-amber-300 border border-amber-700/50",
  },
  NON_TAXPAYER: {
    label: "No contrib.",
    cls:   "bg-zinc-800 text-zinc-400 border border-zinc-700",
  },
  FOREIGN: {
    label: "Extranjero",
    cls:   "bg-blue-900/40 text-blue-300 border border-blue-700/50",
  },
};

// ── Props ─────────────────────────────────────────────────────────

interface SupplierContextPanelProps {
  supplier: SupplierForPurchaseLookup | null;
}

// ── Componente ────────────────────────────────────────────────────

export function SupplierContextPanel({ supplier }: SupplierContextPanelProps) {
  if (!supplier) {
    return (
      <div className="flex h-10 items-center rounded-md border border-dashed border-zinc-700/40 bg-zinc-900/30 px-3">
        <span className="text-xs text-zinc-500">
          Selecciona un proveedor para ver sus datos
        </span>
      </div>
    );
  }

  const badge = TAXPAYER_CONFIG[supplier.taxpayer_type];

  const fiscalParts: string[] = [];
  if (supplier.nit) fiscalParts.push(`NIT: ${supplier.nit}`);
  if (supplier.nrc) fiscalParts.push(`NRC: ${supplier.nrc}`);

  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">

      {/* Línea 1: nombre + badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-zinc-100">
          {supplier.name}
        </span>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${badge.cls}`}
        >
          {badge.label}
        </span>
      </div>

      {/* Línea 2: código · NIT · NRC */}
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0">
        <span className="font-mono text-xs text-zinc-400">
          {supplier.supplier_code}
        </span>
        {fiscalParts.map((part) => (
          <span key={part} className="flex items-center gap-1 text-xs text-zinc-400">
            <span className="text-zinc-600">·</span>
            {part}
          </span>
        ))}
      </div>

    </div>
  );
}
