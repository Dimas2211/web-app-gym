"use client";

import { useState, useCallback, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { DteCatalogItem } from "@/modules/commerce/dte/types/dte-catalog.types";
import type { CustomerForSaleLookup } from "@/modules/commerce/customers/types/customer.types";
import type { SaleDetail, SaleItemDetail } from "../types/sale.types";
import { SaleHeaderCard }        from "./sale-header-card";
import { SaleCustomerSection }   from "./sale-customer-section";
import { SaleDteSection }        from "./sale-dte-section";
import { SalePaymentSection }    from "./sale-payment-section";
import { SaleProductSearch, type SaleProductSearchHandle } from "./sale-product-search";
import { SaleLinesTable }        from "./sale-lines-table";
import { SaleTotalsPanel }       from "./sale-totals-panel";
import { CancelDraftSaleDialog } from "./dialogs/cancel-draft-sale-dialog";
import { ClearSaleDialog }       from "./dialogs/clear-sale-dialog";
import { ConfirmSaleDialog }     from "./dialogs/confirm-sale-dialog";
import { createSaleDraftAction }  from "../actions/create-sale-draft.action";
import { updateSaleDraftAction }  from "../actions/update-sale-draft.action";
import { discardDraftSaleAction } from "../actions/discard-draft-sale.action";
import { confirmSaleAction }      from "../actions/confirm-sale.action";
import { addSaleItemAction }      from "../actions/add-sale-item.action";
import { updateSaleItemAction }  from "../actions/update-sale-item.action";
import { removeSaleItemAction }  from "../actions/remove-sale-item.action";
import type { AddSaleItemInput, UpdateSaleItemInput } from "../schemas/sale.schemas";
import type { SaleStatus } from "../types/sale.types";
import { getDteShortLabel } from "../utils/dte-type-labels";

export interface SaleNewClientProps {
  initialDate:   string;
  catalogCAT016: DteCatalogItem[];
  catalogCAT017: DteCatalogItem[];
  catalogCAT018: DteCatalogItem[];
  locationName?: string;
  initialDraft?: SaleDetail;
}

interface SaleTotalsState {
  subtotal:        number;
  discount_amount: number;
  tax_amount:      number;
  total_amount:    number;
}

// Convierte la fecha de un SaleDetail (puede llegar como string ISO o Date) a YYYY-MM-DD
function toDateString(value: Date | string | undefined, fallback: string): string {
  if (!value) return fallback;
  const s = typeof value === "string" ? value : value.toISOString();
  return s.slice(0, 10);
}

// Construye un CustomerForSaleLookup mínimo desde los campos del detalle de venta
function buildDraftCustomer(
  id:   string | null | undefined,
  name: string | null | undefined,
): CustomerForSaleLookup | null {
  if (!id || !name) return null;
  return {
    id,
    customer_code: "",
    name,
    taxpayer_type: null,
    nit:           null,
    nrc:           null,
    dui:           null,
    activity_code: null,
  };
}

export function SaleNewClient({
  initialDate,
  catalogCAT016,
  catalogCAT017,
  catalogCAT018,
  locationName,
  initialDraft,
}: SaleNewClientProps) {
  const router = useRouter();

  // ── Refs de foco para navegación con teclado ──────────────────────
  const conditionOpRef     = useRef<HTMLSelectElement>(null);
  const paymentMethodRef   = useRef<HTMLSelectElement>(null);
  const paymentTermCodeRef = useRef<HTMLSelectElement>(null);
  const paymentTermValRef  = useRef<HTMLInputElement>(null);
  const notesRef           = useRef<HTMLInputElement>(null);
  const productSearchRef   = useRef<SaleProductSearchHandle>(null);

  // ── Identidad y estado de la venta ───────────────────────────────
  const [saleId,         setSaleId]         = useState<string | null>(initialDraft?.id ?? null);
  const [saleCode,       setSaleCode]       = useState<string | null>(initialDraft?.sale_code ?? null);
  const [saleStatus,     setSaleStatus]     = useState<SaleStatus>(
    (initialDraft?.status as SaleStatus | undefined) ?? "DRAFT",
  );
  const [inventoryMoved, setInventoryMoved] = useState<boolean>(
    initialDraft?.inventory_moved ?? false,
  );

  // ── Campos del formulario ─────────────────────────────────────────
  const [saleDate,               setSaleDate]               = useState(
    initialDraft ? toDateString(initialDraft.sale_date, initialDate) : initialDate,
  );
  const [primaryDteTypeCode,     setPrimaryDteTypeCode]     = useState<"01" | "03">(
    (initialDraft?.primary_dte_type_code as "01" | "03" | undefined) ?? "01",
  );
  const [selectedCustomer,       setSelectedCustomer]       = useState<CustomerForSaleLookup | null>(
    initialDraft ? buildDraftCustomer(initialDraft.customer_id, initialDraft.customer_name) : null,
  );
  const [conditionOperationCode, setConditionOperationCode] = useState<"1" | "2" | "3" | null>(
    (initialDraft?.condition_operation_code as "1" | "2" | "3" | null | undefined) ?? null,
  );
  const [paymentMethodCode,      setPaymentMethodCode]      = useState<string | null>(
    initialDraft?.payment_method_code ?? null,
  );
  const [paymentTermCode,        setPaymentTermCode]        = useState<"01" | "02" | "03" | null>(
    (initialDraft?.payment_term_code as "01" | "02" | "03" | null | undefined) ?? null,
  );
  const [paymentTermValue,       setPaymentTermValue]       = useState<number | null>(
    initialDraft?.payment_term_value ?? null,
  );
  const [notes,                  setNotes]                  = useState(
    initialDraft?.notes ?? "",
  );

  // ── Estado de líneas y totales ────────────────────────────────────
  const [saleItems,  setSaleItems]  = useState<SaleItemDetail[]>(
    (initialDraft?.items as SaleItemDetail[] | undefined) ?? [],
  );
  const [saleTotals, setSaleTotals] = useState<SaleTotalsState | null>(
    initialDraft
      ? {
          subtotal:        Number(initialDraft.subtotal),
          discount_amount: Number(initialDraft.discount_amount),
          tax_amount:      Number(initialDraft.tax_amount),
          total_amount:    Number(initialDraft.total_amount),
        }
      : null,
  );

  // ── UI state ──────────────────────────────────────────────────────
  const [isSaving,             startSave]           = useTransition();
  const [isCancelling,         startCancel]         = useTransition();
  const [isConfirming,         startConfirm]        = useTransition();
  const [isApplyingInventory,  startApplyInventory] = useTransition();
  const [isAddingLine, setIsAddingLine] = useState(false);
  const [errorMessage,   setError]   = useState<string | null>(null);
  const [successMessage, setSuccess] = useState<string | null>(null);
  const [lineError,      setLineError] = useState<string | null>(null);
  const [showCancelDialog,  setShowCancelDialog]  = useState(false);
  const [showClearDialog,   setShowClearDialog]   = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isCaptureMode, setIsCaptureMode] = useState(false);

  // ── Navegación por teclado ────────────────────────────────────────
  function focusAfterCondition() {
    paymentMethodRef.current?.focus();
  }
  function focusAfterPaymentMethod() {
    if (conditionOperationCode === "2") {
      paymentTermCodeRef.current?.focus();
    } else {
      notesRef.current?.focus();
    }
  }
  function focusAfterPaymentTermCode() {
    paymentTermValRef.current?.focus();
  }
  function focusAfterPaymentTermVal() {
    notesRef.current?.focus();
  }
  function focusAfterNotes() {
    productSearchRef.current?.focus();
  }

  // Al entrar en modo captura, llevar el foco directo al buscador de productos
  useEffect(() => {
    if (isCaptureMode) {
      const t = setTimeout(() => productSearchRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [isCaptureMode]);

  // ── Helpers ───────────────────────────────────────────────────────
  function clearMessages() { setError(null); setSuccess(null); setLineError(null); }

  function resetAll() {
    setSaleId(null);
    setSaleCode(null);
    setSaleItems([]);
    setSaleTotals(null);
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

  // ── Refrescar detalle de venta ────────────────────────────────────
  const refreshDetail = useCallback(async (id: string) => {
    try {
      const res  = await fetch(`/api/sales/${id}`, { cache: "no-store" });
      const json = await res.json() as {
        ok: boolean;
        data?: {
          items:           SaleItemDetail[];
          subtotal:        number;
          discount_amount: number;
          tax_amount:      number;
          total_amount:    number;
        };
      };
      if (json.ok && json.data) {
        setSaleItems(json.data.items ?? []);
        setSaleTotals({
          subtotal:        Number(json.data.subtotal),
          discount_amount: Number(json.data.discount_amount),
          tax_amount:      Number(json.data.tax_amount),
          total_amount:    Number(json.data.total_amount),
        });
      }
    } catch {
      // silencioso — los totales ya en estado son suficiente
    }
  }, []);

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

  // ── Agregar línea ─────────────────────────────────────────────────
  // Si no hay borrador, lo crea primero con la cabecera actual; luego agrega la línea.
  const handleAddLine = useCallback(async (
    data: AddSaleItemInput,
  ): Promise<{ ok: boolean; error?: string }> => {
    setLineError(null);
    setIsAddingLine(true);

    try {
      let currentSaleId = saleId;

      // Crear borrador si no existe
      if (!currentSaleId) {
        const createResult = await createSaleDraftAction({
          sale_date:                saleDate,
          customer_id:              selectedCustomer?.id ?? null,
          primary_dte_type_code:    primaryDteTypeCode,
          payment_method_code:      paymentMethodCode,
          condition_operation_code: conditionOperationCode,
          payment_term_code:        paymentTermCode,
          payment_term_value:       paymentTermValue,
          notes:                    notes || null,
        });
        if (!createResult.ok) {
          const msg = `No se pudo crear el borrador: ${createResult.error}`;
          setLineError(msg);
          return { ok: false, error: msg };
        }
        currentSaleId = createResult.id;
        setSaleId(createResult.id);
        setSaleCode(createResult.sale_code);
      }

      // Agregar línea
      const addResult = await addSaleItemAction(currentSaleId, data);
      if (!addResult.ok) {
        const msg = addResult.error ?? "No se pudo agregar la línea.";
        setLineError(msg);
        return { ok: false, error: msg };
      }

      await refreshDetail(currentSaleId);
      return { ok: true };
    } finally {
      setIsAddingLine(false);
    }
  }, [
    saleId, saleDate, selectedCustomer, primaryDteTypeCode,
    paymentMethodCode, conditionOperationCode, paymentTermCode,
    paymentTermValue, notes, refreshDetail,
  ]);

  // ── Editar línea ──────────────────────────────────────────────────
  const handleUpdateLine = useCallback(async (
    item_id: string,
    data:    UpdateSaleItemInput,
  ): Promise<void> => {
    if (!saleId) return;
    setLineError(null);
    const result = await updateSaleItemAction(item_id, saleId, data);
    if (!result.ok) {
      setLineError(`No se pudo actualizar la línea: ${result.error}`);
      return;
    }
    await refreshDetail(saleId);
  }, [saleId, refreshDetail]);

  // ── Eliminar línea ────────────────────────────────────────────────
  const handleRemoveLine = useCallback(async (item_id: string): Promise<void> => {
    if (!saleId) return;
    setLineError(null);
    const result = await removeSaleItemAction(item_id, saleId);
    if (!result.ok) {
      setLineError(`No se pudo eliminar la línea: ${result.error}`);
      return;
    }
    await refreshDetail(saleId);
  }, [saleId, refreshDetail]);

  // ── Cancelar borrador ─────────────────────────────────────────────
  function handleCancelClick() {
    if (!saleId) { router.push("/dashboard/sales"); return; }
    setShowCancelDialog(true);
  }

  function handleCancelConfirm() {
    if (!saleId) { router.push("/dashboard/sales"); return; }
    startCancel(async () => {
      const result = await discardDraftSaleAction(saleId);
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
      const result = await discardDraftSaleAction(saleId);
      if (!result.ok) { setError(result.error); setShowClearDialog(false); return; }
      resetAll();
      setShowClearDialog(false);
    });
  }

  const hasDraft   = !!saleId;
  const isReadOnly = saleStatus !== "DRAFT";
  const isBusy     = isSaving || isCancelling || isAddingLine || isConfirming || isApplyingInventory;
  const canConfirm = !!saleId && !isReadOnly && saleItems.length > 0 && !isBusy;

  // ── Confirmar venta ───────────────────────────────────────────────
  function handleConfirmClick() {
    if (!saleId || isReadOnly) return;
    setShowConfirmDialog(true);
  }

  function handleConfirmConfirm() {
    if (!saleId) return;
    startConfirm(async () => {
      const result = await confirmSaleAction(saleId);
      setShowConfirmDialog(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaleStatus("CONFIRMED");
      setInventoryMoved(true);
      setSuccess("Venta confirmada e inventario aplicado.");
    });
  }

  function handleApplyInventoryPending() {
    if (!saleId) return;
    startApplyInventory(async () => {
      const result = await confirmSaleAction(saleId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInventoryMoved(true);
      setSuccess("Inventario pendiente aplicado correctamente.");
    });
  }

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
          saleStatus={saleStatus}
          isReadOnly={isReadOnly}
          onSave={handleSave}
          onBack={() => router.push("/dashboard/sales")}
          onClear={handleClearClick}
          onCancel={handleCancelClick}
          locationName={locationName}
          errorMessage={errorMessage}
          successMessage={successMessage}
          isCaptureMode={isCaptureMode}
          onToggleCaptureMode={isReadOnly ? undefined : () => setIsCaptureMode((v) => !v)}
        />

        {/* Middle — columna izquierda + columna derecha */}
        <div className="flex-1 min-h-0 flex flex-row overflow-hidden">

          {/* Columna izquierda */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

            {/* Modo normal — Zonas B, C y Notas */}
            {!isCaptureMode && (
              <>
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
                    conditionOperationRef={conditionOpRef}
                    paymentMethodRef={paymentMethodRef}
                    paymentTermCodeRef={paymentTermCodeRef}
                    paymentTermValueRef={paymentTermValRef}
                    onConditionEnter={focusAfterCondition}
                    onPaymentMethodEnter={focusAfterPaymentMethod}
                    onPaymentTermCodeEnter={focusAfterPaymentTermCode}
                    onPaymentTermValueEnter={focusAfterPaymentTermVal}
                  />
                </div>

                {/* Notas */}
                <div className="flex-none border-b border-zinc-800 px-3 py-2">
                  <label className="text-[10px] text-zinc-500 block mb-0.5">
                    Notas <span className="text-zinc-600">(opcional)</span>
                  </label>
                  <input
                    ref={notesRef}
                    type="text"
                    maxLength={500}
                    placeholder="Observaciones de la venta…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); focusAfterNotes(); }
                    }}
                    className="h-7 w-full bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </>
            )}

            {/* Modo captura — barra resumen compacta */}
            {isCaptureMode && (
              <div className="flex-none border-b border-zinc-800 bg-zinc-900/60 px-3 py-1.5 flex items-center gap-3 flex-wrap">
                {/* Código */}
                <span className="font-mono text-xs text-zinc-300">
                  {saleCode ?? "VTA-NUEVO"}
                </span>

                {/* Estado */}
                {saleStatus === "CONFIRMED" ? (
                  <span className="text-[10px] text-emerald-400 bg-emerald-900/20 border border-emerald-800/40 rounded px-1.5 py-0.5">
                    CONFIRMADA
                  </span>
                ) : (
                  <span className="text-[10px] text-amber-400 bg-amber-900/20 border border-amber-800/40 rounded px-1.5 py-0.5">
                    DRAFT
                  </span>
                )}

                {/* Separador */}
                <span className="text-zinc-700">|</span>

                {/* Cliente */}
                <span className="text-[11px] text-zinc-300 truncate max-w-[160px]">
                  {selectedCustomer ? selectedCustomer.name : "Consumidor final"}
                </span>

                {/* DTE */}
                <span className="text-[10px] text-zinc-500 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5">
                  {getDteShortLabel(primaryDteTypeCode)}
                </span>

                {/* Condición */}
                {conditionOperationCode && (
                  <span className="text-[10px] text-zinc-500">
                    {conditionOperationCode === "1"
                      ? "Contado"
                      : conditionOperationCode === "2"
                      ? "Crédito"
                      : "Otro"}
                  </span>
                )}

                {/* Notas mini — solo si tiene valor */}
                {notes && (
                  <span className="text-[10px] text-zinc-600 italic truncate max-w-[140px]" title={notes}>
                    {notes}
                  </span>
                )}

                {/* Total — extremo derecho */}
                <span className="ml-auto text-sm font-semibold text-zinc-100">
                  ${saleTotals ? saleTotals.total_amount.toFixed(2) : "0.00"}
                </span>
              </div>
            )}

            {/* Zone D — Líneas (central) + Búsqueda de productos (inferior) */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

              {/* Error de líneas */}
              {lineError && (
                <div className="flex-none px-3 py-1.5 border-b border-zinc-800">
                  <p className="text-[11px] text-red-400">{lineError}</p>
                </div>
              )}

              {/* Banner de solo lectura */}
              {isReadOnly && (
                <div className="flex-none px-3 py-1.5 border-b border-zinc-800 bg-emerald-950/30">
                  <p className="text-[11px] text-emerald-400">
                    Esta venta está confirmada y ya no puede editarse como borrador.
                  </p>
                </div>
              )}

              {/* Tabla de líneas — zona central/principal */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <SaleLinesTable
                  items={saleItems}
                  onUpdate={handleUpdateLine}
                  onRemove={handleRemoveLine}
                  disabled={isBusy || isReadOnly}
                />
              </div>

              {/* Buscador de productos — solo en modo edición */}
              {!isReadOnly && (
                <SaleProductSearch
                  ref={productSearchRef}
                  onAdd={handleAddLine}
                  isAdding={isAddingLine}
                  disabled={isBusy}
                />
              )}
            </div>
          </div>

          {/* Columna derecha — Zone E Totales */}
          <div className="flex-none w-52">
            <SaleTotalsPanel
              isSaving={isSaving}
              hasDraft={hasDraft}
              totals={saleTotals}
              onSave={handleSave}
              onBack={() => router.push("/dashboard/sales")}
              onClear={handleClearClick}
              onCancel={handleCancelClick}
              canConfirm={canConfirm}
              isConfirming={isConfirming}
              isReadOnly={isReadOnly}
              onConfirm={handleConfirmClick}
              inventoryMoved={inventoryMoved}
              isApplyingInventory={isApplyingInventory}
              onApplyInventoryPending={handleApplyInventoryPending}
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

      <ConfirmSaleDialog
        open={showConfirmDialog}
        isBusy={isConfirming}
        saleCode={saleCode}
        onBack={() => setShowConfirmDialog(false)}
        onConfirm={handleConfirmConfirm}
      />
    </>
  );
}
