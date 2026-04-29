"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — edit-purchase-form.tsx
//
// Formulario de edición de cabecera de una compra en estado DRAFT.
// Pre-rellena los datos actuales: proveedor, fecha, correlativo, notas.
// En éxito → redirect a /dashboard/purchases.
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useActionState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { SupplierCombobox }   from "@/modules/commerce/suppliers/components/supplier-combobox";
import { SupplierContextPanel } from "@/modules/commerce/suppliers/components/supplier-context-panel";
import { QuickCreateSupplierDialog } from "@/modules/commerce/suppliers/components/quick-create-supplier-dialog";
import { updatePurchaseHeaderAction } from "../actions/update-purchase-header.action";
import type { SupplierForPurchaseLookup } from "@/modules/commerce/suppliers/types/supplier.types";

// ── Style helpers ─────────────────────────────────────────────────

const labelCls = "block text-xs font-medium text-zinc-700 mb-1";
const inputCls =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800 " +
  "focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent";
const errorCls = "mt-1 text-xs text-red-600";

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className={errorCls}>{msg}</p>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-5 rounded-lg border border-zinc-100 p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

// ── Props ─────────────────────────────────────────────────────────

export interface EditPurchaseFormProps {
  purchaseId:    string;
  initialSupplier: SupplierForPurchaseLookup;
  initialDate:   string;   // YYYY-MM-DD
  initialCode:   string;   // numeric string
  initialNotes:  string;
}

// ── Componente ────────────────────────────────────────────────────

export function EditPurchaseForm({
  purchaseId,
  initialSupplier,
  initialDate,
  initialCode,
  initialNotes,
}: EditPurchaseFormProps) {
  const router = useRouter();

  const [selectedSupplier, setSelectedSupplier] =
    useState<SupplierForPurchaseLookup | null>(initialSupplier);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [prefillName,     setPrefillName]     = useState("");

  const [purchaseDate, setPurchaseDate] = useState(initialDate);
  const [purchaseCode, setPurchaseCode] = useState(initialCode);
  const [suggestedCode, setSuggestedCode] = useState<number | null>(null);
  const [userEditedCode, setUserEditedCode] = useState(false);

  const boundAction = useCallback(
    updatePurchaseHeaderAction.bind(null, purchaseId),
    [purchaseId],
  );
  const [state, formAction, isPending] = useActionState(boundAction, undefined);

  // Redirect en éxito
  useEffect(() => {
    if (state?.ok) {
      router.push("/dashboard/purchases");
    }
  }, [state, router]);

  // Sugerir correlativo cuando cambia la fecha (solo si el usuario no editó el código)
  useEffect(() => {
    if (!purchaseDate) return;
    fetch(`/api/purchases/suggest-code?date=${purchaseDate}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.suggested_code) {
          setSuggestedCode(data.suggested_code);
          if (!userEditedCode) {
            setPurchaseCode(String(data.suggested_code));
          }
        }
      })
      .catch(() => {});
  }, [purchaseDate, userEditedCode]);

  return (
    <>
      <form action={formAction} noValidate>

        {/* Error global */}
        {state && !state.ok && !state.field && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {state.error}
          </div>
        )}

        {/* Proveedor */}
        <Section title="Proveedor">
          <input type="hidden" name="supplier_id" value={selectedSupplier?.id ?? ""} />
          <div className="space-y-2">
            <SupplierCombobox
              value={selectedSupplier}
              onChange={setSelectedSupplier}
              onCreateRequest={(name) => { setPrefillName(name); setQuickCreateOpen(true); }}
            />
            <FieldError msg={state && !state.ok && state.field === "supplier_id" ? state.error : undefined} />
            <SupplierContextPanel supplier={selectedSupplier} />
          </div>
        </Section>

        {/* Documento */}
        <Section title="Documento">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">

            {/* Fecha */}
            <div>
              <label htmlFor="ep-purchase_date" className={labelCls}>
                Fecha de compra <span className="text-red-500">*</span>
              </label>
              <input
                id="ep-purchase_date"
                name="purchase_date"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className={inputCls}
              />
              <FieldError msg={state && !state.ok && state.field === "purchase_date" ? state.error : undefined} />
            </div>

            {/* Correlativo */}
            <div>
              <label htmlFor="ep-purchase_code" className={labelCls}>
                Correlativo{" "}
                {suggestedCode && !userEditedCode && (
                  <span className="font-normal text-zinc-400">(sugerido: {suggestedCode})</span>
                )}
              </label>
              <input
                id="ep-purchase_code"
                name="purchase_code"
                type="number"
                min="1"
                step="1"
                value={purchaseCode}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setPurchaseCode(v);
                  setUserEditedCode(true);
                }}
                autoComplete="off"
                className={inputCls}
              />
              <FieldError msg={state && !state.ok && state.field === "purchase_code" ? state.error : undefined} />
            </div>

            {/* Notas */}
            <div className="col-span-2">
              <label htmlFor="ep-notes" className={labelCls}>Notas</label>
              <textarea
                id="ep-notes"
                name="notes"
                maxLength={500}
                rows={2}
                defaultValue={initialNotes}
                placeholder="Observaciones del documento…"
                className={`${inputCls} resize-none`}
              />
            </div>

          </div>
        </Section>

        {/* Acciones */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard/purchases")}
            disabled={isPending}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending || !selectedSupplier}
            className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>

      </form>

      <QuickCreateSupplierDialog
        open={quickCreateOpen}
        prefillName={prefillName}
        onSuccess={(s) => setSelectedSupplier(s)}
        onClose={() => setQuickCreateOpen(false)}
      />
    </>
  );
}
