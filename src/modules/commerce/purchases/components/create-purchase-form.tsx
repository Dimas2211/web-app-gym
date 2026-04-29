"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — create-purchase-form.tsx
//
// Formulario de cabecera para crear una compra en estado DRAFT.
//
// Integra:
//   - SupplierCombobox   (S11A.2) — selección de proveedor
//   - QuickCreateSupplierDialog (S11A.3) — alta rápida sin salir del flujo
//   - SupplierContextPanel (S11A.4) — contexto fiscal del proveedor
//
// supplier_id viaja al action mediante hidden input.
// En éxito (state.id) → redirect a /dashboard/purchases.
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { SupplierCombobox }           from "@/modules/commerce/suppliers/components/supplier-combobox";
import { QuickCreateSupplierDialog }  from "@/modules/commerce/suppliers/components/quick-create-supplier-dialog";
import { SupplierContextPanel }       from "@/modules/commerce/suppliers/components/supplier-context-panel";
import { createPurchaseAction }       from "../actions/create-purchase.action";
import type { SupplierForPurchaseLookup } from "@/modules/commerce/suppliers/types/supplier.types";

// ── Style helpers ─────────────────────────────────────────────────

const labelCls = "block text-xs font-medium text-zinc-700 mb-1";
const inputCls =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800 " +
  "focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent";
const errorCls = "mt-1 text-xs text-red-600";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className={errorCls}>{errors[0]}</p>;
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

// ── Componente ────────────────────────────────────────────────────

export function CreatePurchaseForm() {
  const router = useRouter();

  // ── Estado de proveedor ───────────────────────────────────────
  const [selectedSupplier, setSelectedSupplier] =
    useState<SupplierForPurchaseLookup | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [prefillName,     setPrefillName]     = useState("");

  // ── Fecha por defecto: hoy ────────────────────────────────────
  const [purchaseDate,     setPurchaseDate]     = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [suggestedCode,    setSuggestedCode]    = useState<number | null>(null);
  const [purchaseCode,     setPurchaseCode]     = useState("");

  // ── Action ────────────────────────────────────────────────────
  const [state, formAction, isPending] = useActionState(
    createPurchaseAction,
    undefined,
  );

  // Redirect en éxito
  useEffect(() => {
    if (state?.id) {
      router.push("/dashboard/purchases");
    }
  }, [state?.id, router]);

  // Auto-sugerir correlativo cuando cambia la fecha
  useEffect(() => {
    if (!purchaseDate) return;
    fetch(`/api/purchases/suggest-code?date=${purchaseDate}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.suggested_code) {
          setSuggestedCode(data.suggested_code);
          // Solo auto-rellena si el usuario no ha ingresado nada manualmente
          setPurchaseCode((prev) => prev === "" ? String(data.suggested_code) : prev);
        }
      })
      .catch(() => {});
  }, [purchaseDate]);

  // ── Handlers de proveedor ─────────────────────────────────────

  function handleSupplierChange(supplier: SupplierForPurchaseLookup | null) {
    setSelectedSupplier(supplier);
  }

  function handleCreateRequest(name: string) {
    setPrefillName(name);
    setQuickCreateOpen(true);
  }

  function handleQuickCreateSuccess(supplier: SupplierForPurchaseLookup) {
    setSelectedSupplier(supplier);
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <>
      <form action={formAction} noValidate>

        {/* Error global */}
        {state?.error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {state.error}
          </div>
        )}

        {/* Proveedor — hidden input + combobox + panel */}
        <Section title="Proveedor">
          <input
            type="hidden"
            name="supplier_id"
            value={selectedSupplier?.id ?? ""}
          />

          <div className="space-y-2">
            <SupplierCombobox
              value={selectedSupplier}
              onChange={handleSupplierChange}
              onCreateRequest={handleCreateRequest}
            />
            <FieldError errors={state?.errors?.supplier_id} />
            <SupplierContextPanel supplier={selectedSupplier} />
          </div>
        </Section>

        {/* Cabecera del documento */}
        <Section title="Documento">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">

            {/* Fecha */}
            <div>
              <label htmlFor="cp-purchase_date" className={labelCls}>
                Fecha de compra <span className="text-red-500">*</span>
              </label>
              <input
                id="cp-purchase_date"
                name="purchase_date"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className={inputCls}
              />
              <FieldError errors={state?.errors?.purchase_date} />
            </div>

            {/* Correlativo numérico */}
            <div>
              <label htmlFor="cp-purchase_code" className={labelCls}>
                Correlativo{" "}
                {suggestedCode && (
                  <span className="font-normal text-zinc-400">
                    (sugerido: {suggestedCode})
                  </span>
                )}
              </label>
              <input
                id="cp-purchase_code"
                name="purchase_code"
                type="number"
                min="1"
                step="1"
                value={purchaseCode}
                onChange={(e) => {
                  // Solo permite dígitos enteros positivos
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setPurchaseCode(v);
                }}
                placeholder={suggestedCode ? String(suggestedCode) : "Auto"}
                autoComplete="off"
                className={inputCls}
              />
              <FieldError errors={state?.errors?.purchase_code} />
            </div>

            {/* Notas */}
            <div className="col-span-2">
              <label htmlFor="cp-notes" className={labelCls}>
                Notas
              </label>
              <textarea
                id="cp-notes"
                name="notes"
                maxLength={500}
                rows={2}
                placeholder="Observaciones del documento…"
                className={`${inputCls} resize-none`}
              />
              <FieldError errors={state?.errors?.notes} />
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
            {isPending ? "Creando…" : "Crear compra"}
          </button>
        </div>

      </form>

      {/* Dialog de alta rápida — fuera del form para no anidar forms */}
      <QuickCreateSupplierDialog
        open={quickCreateOpen}
        prefillName={prefillName}
        onSuccess={handleQuickCreateSuccess}
        onClose={() => setQuickCreateOpen(false)}
      />
    </>
  );
}
