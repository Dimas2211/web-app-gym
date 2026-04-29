"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase-form-header.tsx
//
// Zone A: barra de cabecera compacta en 2 filas.
// Fila 1: Proveedor (2 cols) | NRC readonly | Tipo doc* | Serie* | Nº doc* | Forma pago* | Cancelación*
// Fila 2: Fecha* | Correlativo* | Notas | Botón
//
// TODOS los selects tienen name directo (sin hidden inputs intermedios).
// TODOS los inputs usan value+onChange (controlados, nunca defaultValue).
// useEffect de éxito llama onSaved en cada acción completada (create y update).
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useActionState, useCallback, useRef } from "react";
import { Loader2, Save } from "lucide-react";
import { SupplierCombobox }            from "@/modules/commerce/suppliers/components/supplier-combobox";
import { QuickCreateSupplierDialog }   from "@/modules/commerce/suppliers/components/quick-create-supplier-dialog";
import { savePurchaseHeaderAction }    from "../actions/save-purchase-header.action";
import {
  DOCUMENT_TYPE_OPTIONS,
  PAYMENT_CONDITION_OPTIONS,
  CANCELLATION_TYPE_OPTIONS,
} from "../constants/purchase-document.constants";
import type { SupplierForPurchaseLookup } from "@/modules/commerce/suppliers/types/supplier.types";

export interface PurchaseFormHeaderProps {
  purchaseId:         string | null;
  initialSupplier:    SupplierForPurchaseLookup | null;
  initialDate:        string;
  initialCode:        string;
  initialDocType:     string;
  initialDocSeries:   string;
  initialDocNumber:   string;
  initialPaymentCond: string;
  initialCancelType:  string;
  initialNotes:       string;
  onSaved:            (id: string, created: boolean) => void;
}

const selectCls =
  "h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 " +
  "focus:outline-none focus:border-zinc-500 w-full cursor-pointer";
const inputCls =
  "h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 " +
  "placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 w-full";
const labelCls = "text-[10px] text-zinc-500 block mb-0.5";
const errCls   = "text-[10px] text-red-400 mt-0.5";
const req      = <span className="text-red-400"> *</span>;

function FieldErr({ msg }: { msg?: string }) {
  return msg ? <p className={errCls}>{msg}</p> : null;
}

// Nav refs: 0=fecha, 1=correlativo, 2=docType, 3=docSeries, 4=docNumber, 5=paymentCond, 6=cancelType, 7=notes, 8=submit
const NAV_COUNT = 8;

export function PurchaseFormHeader({
  purchaseId,
  initialSupplier,
  initialDate,
  initialCode,
  initialDocType,
  initialDocSeries,
  initialDocNumber,
  initialPaymentCond,
  initialCancelType,
  initialNotes,
  onSaved,
}: PurchaseFormHeaderProps) {
  // ── Controlled state ──────────────────────────────────────────────
  const [supplier,       setSupplier]       = useState<SupplierForPurchaseLookup | null>(initialSupplier);
  const [quickOpen,      setQuickOpen]      = useState(false);
  const [prefillName,    setPrefillName]    = useState("");
  const [purchaseDate,   setPurchaseDate]   = useState(initialDate);
  const [purchaseCode,   setPurchaseCode]   = useState(initialCode);
  const [docType,        setDocType]        = useState(initialDocType);
  const [docSeries,      setDocSeries]      = useState(initialDocSeries);
  const [docNumber,      setDocNumber]      = useState(initialDocNumber);
  const [paymentCond,    setPaymentCond]    = useState(initialPaymentCond);
  const [cancelType,     setCancelType]     = useState(initialCancelType);
  const [notes,          setNotes]          = useState(initialNotes);
  const [suggestedCode,  setSuggestedCode]  = useState<number | null>(null);
  const [userEditedCode, setUserEditedCode] = useState(false);

  const [state, formAction, isPending] = useActionState(savePurchaseHeaderAction, undefined);
  const hasInitialCodeRef = useRef(initialCode.trim() !== "");

  const suggestPurchaseCode = useCallback(async (applyToField = true) => {
    if (!purchaseDate || userEditedCode) return;

    try {
      const res = await fetch(`/api/purchases/suggest-code?date=${purchaseDate}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.suggested_code != null) {
        setSuggestedCode(data.suggested_code);
        if (applyToField) setPurchaseCode(String(data.suggested_code));
      }
    } catch {}
  }, [purchaseDate, userEditedCode]);

  // Fire onSaved on every successful action completion.
  // state is a new reference on each useActionState resolution, so this fires
  // once per submission — no infinite loop risk. onSaved is stable (useCallback).
  useEffect(() => {
    if (!state?.ok) return;
    onSaved(state.id, state.created);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // ── Correlativo auto-suggest ──────────────────────────────────────
  useEffect(() => {
    const shouldApply = !hasInitialCodeRef.current || purchaseDate !== initialDate;
    suggestPurchaseCode(shouldApply);
  }, [initialDate, purchaseDate, suggestPurchaseCode]);

  // ── Keyboard navigation ───────────────────────────────────────────
  const fieldRefs = useRef<Array<HTMLElement | null>>(Array(NAV_COUNT + 1).fill(null));

  const setRef = useCallback((idx: number) => (el: HTMLElement | null) => {
    fieldRefs.current[idx] = el;
  }, []);

  const focusNext = useCallback((currentIdx: number) => {
    for (let i = currentIdx + 1; i <= NAV_COUNT; i++) {
      const el = fieldRefs.current[i];
      if (el && !(el as HTMLInputElement).disabled && !(el as HTMLInputElement).readOnly) {
        el.focus();
        return;
      }
    }
  }, []);

  const handleEnter = useCallback(
    (idx: number) => (e: React.KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); focusNext(idx); }
    },
    [focusNext],
  );

  const handleSupplierCommit = useCallback(() => {
    setTimeout(() => fieldRefs.current[0]?.focus(), 0);
  }, []);

  const fieldErr = useCallback(
    (field: string) => (state && !state.ok && state.field === field ? state.error : undefined),
    [state],
  );

  return (
    <>
      <form action={formAction} className="flex-none border-b border-zinc-800 bg-zinc-900 px-3 py-2">

        {/* Identidad: purchase_id + supplier_id vía hidden inputs (no tienen select visible) */}
        {purchaseId && <input type="hidden" name="purchase_id" value={purchaseId} />}
        <input type="hidden" name="supplier_id" value={supplier?.id ?? ""} />

        {/* Error global (campo no identificado) */}
        {state && !state.ok && !state.field && (
          <div className="mb-1.5 text-[11px] text-red-400 bg-red-900/30 border border-red-700/30 rounded px-2 py-1">
            {state.error}
          </div>
        )}

        {/* ── Fila 1: Proveedor | NRC | Tipo doc | Serie | Nº doc | Forma pago | Cancelación ── */}
        <div className="grid grid-cols-8 gap-x-2 mb-1.5">

          {/* Proveedor (2 cols) */}
          <div className="col-span-2">
            <label className={labelCls}>Proveedor{req}</label>
            <SupplierCombobox
              value={supplier}
              onChange={setSupplier}
              onCommit={handleSupplierCommit}
              onCreateRequest={(name) => { setPrefillName(name); setQuickOpen(true); }}
            />
            <FieldErr msg={fieldErr("supplier_id")} />
          </div>

          {/* NRC readonly */}
          <div>
            <label className={labelCls}>NRC</label>
            <input
              type="text"
              readOnly
              tabIndex={-1}
              value={supplier?.nrc ?? ""}
              placeholder="—"
              className={`${inputCls} text-zinc-500 cursor-default`}
            />
          </div>

          {/* Tipo documento — select con name DIRECTO, sin hidden input */}
          <div>
            <label className={labelCls}>Tipo doc.{req}</label>
            <select
              ref={setRef(2) as React.RefCallback<HTMLSelectElement>}
              name="document_type"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              onKeyDown={handleEnter(2)}
              className={selectCls}
            >
              <option value="">— Seleccionar —</option>
              {DOCUMENT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.value} — {o.label}</option>
              ))}
            </select>
            <FieldErr msg={fieldErr("document_type")} />
          </div>

          {/* Serie — controlado */}
          <div>
            <label className={labelCls}>Serie{req}</label>
            <input
              ref={setRef(3) as React.RefCallback<HTMLInputElement>}
              name="document_series"
              type="text"
              maxLength={10}
              placeholder="A"
              value={docSeries}
              onChange={(e) => setDocSeries(e.target.value)}
              onKeyDown={handleEnter(3)}
              className={inputCls}
            />
            <FieldErr msg={fieldErr("document_series")} />
          </div>

          {/* Nº documento — controlado */}
          <div>
            <label className={labelCls}>Nº doc.{req}</label>
            <input
              ref={setRef(4) as React.RefCallback<HTMLInputElement>}
              name="document_number"
              type="text"
              maxLength={20}
              placeholder="00000001"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              onKeyDown={handleEnter(4)}
              className={inputCls}
            />
            <FieldErr msg={fieldErr("document_number")} />
          </div>

          {/* Forma de pago — select con name DIRECTO */}
          <div>
            <label className={labelCls}>Forma pago{req}</label>
            <select
              ref={setRef(5) as React.RefCallback<HTMLSelectElement>}
              name="payment_condition"
              value={paymentCond}
              onChange={(e) => setPaymentCond(e.target.value)}
              onKeyDown={handleEnter(5)}
              className={selectCls}
            >
              <option value="">— Seleccionar —</option>
              {PAYMENT_CONDITION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <FieldErr msg={fieldErr("payment_condition")} />
          </div>

          {/* Tipo cancelación — select con name DIRECTO */}
          <div>
            <label className={labelCls}>Cancelación{req}</label>
            <select
              ref={setRef(6) as React.RefCallback<HTMLSelectElement>}
              name="cancellation_type"
              value={cancelType}
              onChange={(e) => setCancelType(e.target.value)}
              onKeyDown={handleEnter(6)}
              className={selectCls}
            >
              <option value="">— Seleccionar —</option>
              {CANCELLATION_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <FieldErr msg={fieldErr("cancellation_type")} />
          </div>
        </div>

        {/* ── Fila 2: Fecha | Correlativo | Notas | Botón ── */}
        <div className="grid grid-cols-8 gap-x-2 items-end">

          {/* Fecha */}
          <div>
            <label className={labelCls}>Fecha{req}</label>
            <input
              ref={setRef(0) as React.RefCallback<HTMLInputElement>}
              name="purchase_date"
              type="date"
              value={purchaseDate}
              onChange={(e) => {
                setPurchaseDate(e.target.value);
                if (!userEditedCode) setSuggestedCode(null);
              }}
              onKeyDown={handleEnter(0)}
              className={inputCls}
            />
            <FieldErr msg={fieldErr("purchase_date")} />
          </div>

          {/* Correlativo */}
          <div>
            <label className={labelCls}>
              Correlativo{req}
              {suggestedCode !== null && !userEditedCode && (
                <span className="text-zinc-600 ml-1 font-normal">(sugerido: {suggestedCode})</span>
              )}
            </label>
            <input
              ref={setRef(1) as React.RefCallback<HTMLInputElement>}
              name="purchase_code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={purchaseCode}
              onFocus={() => suggestPurchaseCode(true)}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, "");
                setPurchaseCode(v);
                setUserEditedCode(true);
              }}
              onKeyDown={handleEnter(1)}
              placeholder="Ej: 1"
              className={`${inputCls} font-mono`}
            />
            <FieldErr msg={fieldErr("purchase_code")} />
          </div>

          {/* Notas — controlado, único campo opcional */}
          <div className="col-span-4">
            <label className={labelCls}>Notas <span className="text-zinc-600">(opcional)</span></label>
            <input
              ref={setRef(7) as React.RefCallback<HTMLInputElement>}
              name="notes"
              type="text"
              maxLength={500}
              placeholder="Observaciones del documento…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={handleEnter(7)}
              className={inputCls}
            />
            <FieldErr msg={fieldErr("notes")} />
          </div>

          {/* Botón */}
          <div className="col-span-2">
            <button
              ref={setRef(8) as React.RefCallback<HTMLButtonElement>}
              type="submit"
              disabled={isPending || !supplier}
              className="w-full h-7 flex items-center justify-center gap-1 text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded disabled:opacity-40 transition-colors"
            >
              {isPending
                ? <><Loader2 className="h-3 w-3 animate-spin" />Guardando…</>
                : <><Save className="h-3 w-3" />{purchaseId ? "Actualizar" : "Crear DRAFT"}</>
              }
            </button>
          </div>
        </div>

      </form>

      <QuickCreateSupplierDialog
        open={quickOpen}
        prefillName={prefillName}
        onSuccess={(s) => setSupplier(s)}
        onClose={() => setQuickOpen(false)}
      />
    </>
  );
}
