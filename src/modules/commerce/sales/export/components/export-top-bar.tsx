"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-top-bar.tsx
//
// F3-C21D — Barra operativa compacta: título + estado TEST, receptor
// extranjero, fecha, condición de operación, forma de pago, notas y
// resumen fiscal FEX 11. Mismo espíritu que sale-header-card.tsx +
// sale-customer-section.tsx + sale-payment-section.tsx, condensado
// en una franja fija (sin scroll).
//
// Orden de tabulación operativo (A→F):
//   Receptor → Fecha → Condición → Forma de pago → Observaciones →
//   Datos fiscales FEX 11 (botón que abre modal).
// Enter en fecha/condición/pago/observaciones avanza al siguiente
// campo (mismo patrón de "Enter avanza" que sale-payment-section.tsx
// vía refs + onKeyDown). El botón "Datos fiscales" y el trigger de
// receptor usan id estable para que el workspace pueda devolverles
// el foco al cerrar sus modales (ver export-sale-workspace.tsx).
// ─────────────────────────────────────────────────────────────────

import { useRef } from "react";
import { ArrowLeft, Globe2, AlertTriangle, UserRound, Settings2, X } from "lucide-react";
import type { ForeignCustomerLookup } from "../queries/search-foreign-customers";
import type { DteCatalogItem } from "@/modules/commerce/dte/types/dte-catalog.types";
import type { FiscalData } from "./export-fiscal-modal";

interface Props {
  saleCode:            string | null;
  selectedCustomer:    ForeignCustomerLookup | null;
  onOpenCustomerModal: () => void;
  onClearCustomer:     () => void;

  saleDate:         string;
  onSaleDateChange: (v: string) => void;

  conditionCode:       "1" | "2" | "3";
  onConditionChange:   (v: "1" | "2" | "3") => void;
  catalogCAT016:       DteCatalogItem[];

  paymentMethodCode:      string;
  onPaymentMethodChange:  (v: string) => void;
  catalogCAT017:          DteCatalogItem[];

  catalogCAT027: DteCatalogItem[];
  catalogCAT028: DteCatalogItem[];

  notes:         string;
  onNotesChange: (v: string) => void;

  fiscalData:       FiscalData;
  onOpenFiscalModal: () => void;

  onBack:    () => void;
  readOnly?: boolean;

  errorMessage:   string | null;
  successMessage: string | null;
  contextNote?:   string | null;
}

const FALLBACK_CAT016 = [
  { item_code: "1", item_label: "Contado" },
  { item_code: "2", item_label: "Crédito" },
  { item_code: "3", item_label: "Otro" },
];
const FALLBACK_CAT017 = [
  { item_code: "01", item_label: "Billetes y monedas" },
  { item_code: "02", item_label: "Tarjeta Débito" },
  { item_code: "03", item_label: "Tarjeta Crédito" },
  { item_code: "05", item_label: "Transferencia-Depósito Bancario" },
  { item_code: "14", item_label: "Giro bancario" },
  { item_code: "99", item_label: "Otros" },
];

const selectCls =
  "h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 " +
  "focus:outline-none focus:border-zinc-500 w-full cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
const inputCls =
  "h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 " +
  "placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 w-full disabled:opacity-50";
const labelCls = "text-[10px] text-zinc-500 block mb-0.5";

export function ExportTopBar({
  saleCode,
  selectedCustomer, onOpenCustomerModal, onClearCustomer,
  saleDate, onSaleDateChange,
  conditionCode, onConditionChange, catalogCAT016,
  paymentMethodCode, onPaymentMethodChange, catalogCAT017,
  catalogCAT027, catalogCAT028,
  notes, onNotesChange,
  fiscalData, onOpenFiscalModal,
  onBack, readOnly,
  errorMessage, successMessage, contextNote,
}: Props) {
  const cat016Items = catalogCAT016.length > 0 ? catalogCAT016 : FALLBACK_CAT016;
  const cat017Items = catalogCAT017.length > 0 ? catalogCAT017 : FALLBACK_CAT017;

  const precinctLabel = catalogCAT027.find((f) => f.item_code === fiscalData.fiscalPrecinct)?.item_label ?? "—";
  const regimeLabel   = catalogCAT028.find((r) => r.item_code === fiscalData.regimeCode)?.item_label ?? "—";

  // Refs para avanzar con Enter en el orden operativo B→F (fecha → condición → pago → notas → datos fiscales).
  const conditionRef = useRef<HTMLSelectElement>(null);
  const paymentRef   = useRef<HTMLSelectElement>(null);
  const notesRef     = useRef<HTMLInputElement>(null);
  const fiscalBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="flex-none border-b border-zinc-800 bg-zinc-900">

      {/* Fila 1 — título + estado + volver */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800/60">
        <Globe2 className="h-4 w-4 text-zinc-500 flex-none" />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-zinc-100 leading-tight">Ventas de exportación</h1>
          <p className="text-[10px] text-zinc-500 leading-tight">Factura de exportación FEX 11</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded border border-amber-800/50 bg-amber-900/20 px-2 py-0.5 text-[10px] font-medium text-amber-400 flex-none">
          <AlertTriangle className="h-2.5 w-2.5" />
          TEST / controlado
        </span>

        {saleCode && (
          <span className="inline-flex items-center h-6 px-2 text-[11px] font-mono text-zinc-300 bg-zinc-800 border border-zinc-700 rounded flex-none">
            {saleCode}
          </span>
        )}

        {contextNote && (
          <span className="hidden md:inline text-[10px] text-sky-400/90 truncate max-w-xs">
            {contextNote}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {errorMessage && (
            <span className="max-w-xs truncate text-[11px] text-red-400 bg-red-900/30 border border-red-700/30 rounded px-2 py-1">
              {errorMessage}
            </span>
          )}
          {successMessage && (
            <span className="max-w-xs truncate text-[11px] text-emerald-400 bg-emerald-900/30 border border-emerald-700/30 rounded px-2 py-1">
              {successMessage}
            </span>
          )}
          <button
            type="button"
            onClick={onBack}
            className="h-7 px-2.5 flex items-center gap-1 text-xs text-zinc-400 border border-zinc-700 rounded hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Volver a ventas
          </button>
        </div>
      </div>

      {/* Fila 2 — barra operativa (orden de Tab: A receptor → B fecha → C condición → D pago → E notas → F fiscal) */}
      <div className="flex items-end gap-3 px-3 py-2 flex-wrap">

        {/* A — Cliente */}
        <div className="min-w-[220px]">
          <label className={labelCls}>Receptor extranjero</label>
          {selectedCustomer ? (
            <div className="flex h-7 items-center gap-1.5 rounded border border-emerald-800/50 bg-emerald-900/20 px-2">
              <UserRound className="h-3 w-3 text-emerald-400 flex-none" />
              <span className="truncate text-xs text-emerald-200 max-w-[160px]">{selectedCustomer.name}</span>
              {!readOnly && (
                <button
                  type="button"
                  id="export-customer-trigger"
                  onClick={onClearCustomer}
                  className="ml-auto text-emerald-400/70 hover:text-emerald-200"
                  title="Quitar receptor"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              id="export-customer-trigger"
              onClick={onOpenCustomerModal}
              disabled={readOnly}
              className="flex h-7 w-full items-center gap-1.5 rounded border border-dashed border-zinc-700 px-2 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50 transition-colors"
            >
              <UserRound className="h-3 w-3" />
              Buscar / crear cliente…
            </button>
          )}
        </div>

        {/* B — Fecha */}
        <div className="w-32">
          <label className={labelCls}>Fecha</label>
          <input
            id="export-date-input"
            type="date"
            value={saleDate}
            disabled={readOnly}
            onChange={(e) => onSaleDateChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); conditionRef.current?.focus(); }
            }}
            className={inputCls}
          />
        </div>

        {/* C — Condición de operación */}
        <div className="w-40">
          <label className={labelCls}>Condición de operación</label>
          <select
            ref={conditionRef}
            value={conditionCode}
            disabled={readOnly}
            onChange={(e) => onConditionChange(e.target.value as "1" | "2" | "3")}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); paymentRef.current?.focus(); }
            }}
            className={selectCls}
          >
            {cat016Items.map((it) => (
              <option key={it.item_code} value={it.item_code}>{it.item_label}</option>
            ))}
          </select>
        </div>

        {/* D — Forma de pago */}
        <div className="w-48">
          <label className={labelCls}>Forma de pago</label>
          <select
            ref={paymentRef}
            value={paymentMethodCode}
            disabled={readOnly}
            onChange={(e) => onPaymentMethodChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); notesRef.current?.focus(); }
            }}
            className={selectCls}
          >
            {cat017Items.map((it) => (
              <option key={it.item_code} value={it.item_code}>{it.item_label}</option>
            ))}
          </select>
        </div>

        {/* E — Notas */}
        <div className="flex-1 min-w-[160px]">
          <label className={labelCls}>Observaciones</label>
          <input
            ref={notesRef}
            type="text"
            maxLength={500}
            placeholder="Opcional…"
            value={notes}
            disabled={readOnly}
            onChange={(e) => onNotesChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); fiscalBtnRef.current?.focus(); }
            }}
            className={inputCls}
          />
        </div>

        {/* F — Datos fiscales (botón → abre modal; Enter/Space nativos ya lo activan) */}
        <div className="flex-none">
          <label className={labelCls}>Datos fiscales FEX 11</label>
          <button
            ref={fiscalBtnRef}
            type="button"
            id="export-fiscal-trigger"
            onClick={onOpenFiscalModal}
            className="flex h-7 items-center gap-2 rounded border border-zinc-700 bg-zinc-800 px-2.5 text-[10px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <Settings2 className="h-3 w-3 flex-none" />
            <span className="hidden lg:inline">
              {fiscalData.incotermDesc || "INCOTERM"} · {regimeLabel !== "—" ? regimeLabel.slice(0, 18) : "Régimen"} · {precinctLabel}
            </span>
            <span className="lg:hidden">Editar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
