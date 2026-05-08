"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DteCatalogItem } from "@/modules/commerce/dte/types/dte-catalog.types";
import type { CustomerForSaleLookup } from "@/modules/commerce/customers/types/customer.types";
import { SaleHeaderCard }        from "./sale-header-card";
import { SaleCustomerSection }   from "./sale-customer-section";
import { SaleDteSection }        from "./sale-dte-section";
import { SalePaymentSection }    from "./sale-payment-section";
import { SaleLinesPlaceholder }  from "./sale-lines-placeholder";
import { SaleTotalsPanel }       from "./sale-totals-panel";
import { CancelDraftSaleDialog } from "./dialogs/cancel-draft-sale-dialog";
import { ClearSaleDialog }       from "./dialogs/clear-sale-dialog";
import { createSaleDraftAction } from "../actions/create-sale-draft.action";
import { updateSaleDraftAction } from "../actions/update-sale-draft.action";
import { cancelDraftSaleAction } from "../actions/cancel-draft-sale.action";

export interface SaleNewClientProps {
  initialDate:   string;
  catalogCAT016: DteCatalogItem[];
  catalogCAT017: DteCatalogItem[];
  catalogCAT018: DteCatalogItem[];
  locationName?: string;
}

export function SaleNewClient({
  initialDate,
  catalogCAT016,
  catalogCAT017,
  catalogCAT018,
  locationName,
}: SaleNewClientProps) {
  const router = useRouter();

  // ── Identidad ─────────────────────────────────────────────────────
  const [saleId,   setSaleId]   = useState<string | null>(null);
  const [saleCode, setSaleCode] = useState<string | null>(null);

  // ── Campos del formulario ─────────────────────────────────────────
  const [saleDate,               setSaleDate]               = useState(initialDate);
  const [primaryDteTypeCode,     setPrimaryDteTypeCode]     = useState<"01" | "03">("01");
  const [selectedCustomer,       setSelectedCustomer]       = useState<CustomerForSaleLookup | null>(null);
  const [conditionOperationCode, setConditionOperationCode] = useState<"1" | "2" | "3" | null>(null);
  const [paymentMethodCode,      setPaymentMethodCode]      = useState<string | null>(null);
  const [paymentTermCode,        setPaymentTermCode]        = useState<"01" | "02" | "03" | null>(null);
  const [paymentTermValue,       setPaymentTermValue]       = useState<number | null>(null);
  const [notes,                  setNotes]                  = useState("");

  // ── UI state ──────────────────────────────────────────────────────
  const [isSaving,     startSave]   = useTransition();
  const [isCancelling, startCancel] = useTransition();
  const [errorMessage,   setError]   = useState<string | null>(null);
  const [successMessage, setSuccess] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showClearDialog,  setShowClearDialog]  = useState(false);

  // ── Helpers ───────────────────────────────────────────────────────
  function clearMessages() { setError(null); setSuccess(null); }

  function resetAll() {
    setSaleId(null);
    setSaleCode(null);
    setSaleDate(initialDate);
    setPrimaryDteTypeCode("01");
    setSelectedCustomer(null);
    setConditionOperationCode(null);
    setPaymentMethodCode(null);
    setPaymentTermCode(null);
    setPaymentTermValue(null);
    setNotes("");
    clearMessages();
  }

  // ── Guardar borrador ──────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (!saleDate) { setError("La fecha de venta es requerida."); return; }
    clearMessages();

    startSave(async () => {
      if (!saleId) {
        const result = await createSaleDraftAction({
          sale_date:                saleDate,
          customer_id:              selectedCustomer?.id ?? null,
          primary_dte_type_code:    primaryDteTypeCode,
          payment_method_code:      paymentMethodCode,
          condition_operation_code: conditionOperationCode,
          payment_term_code:        paymentTermCode,
          payment_term_value:       paymentTermValue,
          notes:                    notes || null,
        });
        if (!result.ok) { setError(result.error); return; }
        setSaleId(result.id);
        setSaleCode(result.sale_code);
        setSuccess(`Borrador creado: ${result.sale_code}`);
      } else {
        const result = await updateSaleDraftAction(saleId, {
          sale_date:                saleDate,
          customer_id:              selectedCustomer?.id ?? null,
          primary_dte_type_code:    primaryDteTypeCode,
          payment_method_code:      paymentMethodCode,
          condition_operation_code: conditionOperationCode,
          payment_term_code:        paymentTermCode,
          payment_term_value:       paymentTermValue,
          notes:                    notes || null,
        });
        if (!result.ok) { setError(result.error); return; }
        setSuccess("Borrador actualizado.");
      }
    });
  }, [
    saleDate, saleId, selectedCustomer, primaryDteTypeCode,
    paymentMethodCode, conditionOperationCode, paymentTermCode,
    paymentTermValue, notes,
  ]);

  // ── Cancelar borrador ─────────────────────────────────────────────
  function handleCancelClick() {
    if (!saleId) { router.push("/dashboard/sales"); return; }
    setShowCancelDialog(true);
  }

  function handleCancelConfirm() {
    if (!saleId) { router.push("/dashboard/sales"); return; }
    startCancel(async () => {
      const result = await cancelDraftSaleAction(saleId);
      if (!result.ok) { setError(result.error); setShowCancelDialog(false); return; }
      router.push("/dashboard/sales");
    });
  }

  // ── Limpiar pantalla ──────────────────────────────────────────────
  function handleClearClick() {
    if (!saleId) { resetAll(); return; }
    setShowClearDialog(true);
  }

  function handleClearConfirm() {
    if (!saleId) { resetAll(); setShowClearDialog(false); return; }
    startCancel(async () => {
      const result = await cancelDraftSaleAction(saleId);
      if (!result.ok) { setError(result.error); setShowClearDialog(false); return; }
      resetAll();
      setShowClearDialog(false);
    });
  }

  const hasDraft = !!saleId;
  const isBusy   = isSaving || isCancelling;

  return (
    <>
      <div className="-mx-4 sm:-mx-6 -my-8 flex flex-col bg-zinc-950 h-[calc(100vh-3.5rem)] overflow-hidden">

        {/* Zone A — Cabecera */}
        <SaleHeaderCard
          saleCode={saleCode}
          saleDate={saleDate}
          onSaleDateChange={setSaleDate}
          isSaving={isSaving}
          hasDraft={hasDraft}
          onSave={handleSave}
          onBack={() => router.push("/dashboard/sales")}
          onClear={handleClearClick}
          onCancel={handleCancelClick}
          locationName={locationName}
          errorMessage={errorMessage}
          successMessage={successMessage}
        />

        {/* Middle — columna izquierda + columna derecha */}
        <div className="flex-1 min-h-0 flex flex-row overflow-hidden">

          {/* Columna izquierda */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

            {/* Zone B — Cliente | DTE */}
            <div className="flex-none grid grid-cols-2 border-b border-zinc-800">
              <div className="border-r border-zinc-800">
                <SaleCustomerSection
                  selectedCustomer={selectedCustomer}
                  primaryDteTypeCode={primaryDteTypeCode}
                  onSelect={setSelectedCustomer}
                />
              </div>
              <SaleDteSection
                primaryDteTypeCode={primaryDteTypeCode}
                onChange={setPrimaryDteTypeCode}
              />
            </div>

            {/* Zone C — Pago y condición */}
            <div className="flex-none border-b border-zinc-800">
              <SalePaymentSection
                conditionOperationCode={conditionOperationCode}
                paymentMethodCode={paymentMethodCode}
                paymentTermCode={paymentTermCode}
                paymentTermValue={paymentTermValue}
                catalogCAT016={catalogCAT016}
                catalogCAT017={catalogCAT017}
                catalogCAT018={catalogCAT018}
                onConditionChange={setConditionOperationCode}
                onPaymentMethodChange={setPaymentMethodCode}
                onPaymentTermCodeChange={setPaymentTermCode}
                onPaymentTermValueChange={setPaymentTermValue}
              />
            </div>

            {/* Notas */}
            <div className="flex-none border-b border-zinc-800 px-3 py-2">
              <label className="text-[10px] text-zinc-500 block mb-0.5">
                Notas <span className="text-zinc-600">(opcional)</span>
              </label>
              <input
                type="text"
                maxLength={500}
                placeholder="Observaciones de la venta…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-7 w-full bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>

            {/* Zone D — Líneas placeholder */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <SaleLinesPlaceholder />
            </div>
          </div>

          {/* Columna derecha — Zone E Totales */}
          <div className="flex-none w-52">
            <SaleTotalsPanel
              isSaving={isSaving}
              hasDraft={hasDraft}
              onSave={handleSave}
              onBack={() => router.push("/dashboard/sales")}
              onClear={handleClearClick}
              onCancel={handleCancelClick}
            />
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <CancelDraftSaleDialog
        open={showCancelDialog}
        isBusy={isBusy}
        onBack={() => setShowCancelDialog(false)}
        onConfirm={handleCancelConfirm}
      />

      <ClearSaleDialog
        open={showClearDialog}
        isBusy={isBusy}
        hasDraft={hasDraft}
        onBack={() => setShowClearDialog(false)}
        onConfirm={handleClearConfirm}
      />
    </>
  );
}
