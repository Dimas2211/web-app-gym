"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — quick-create-supplier-dialog.tsx
//
// Alta rápida de proveedor desde el flujo de compras.
//
// Formulario mínimo: name + taxpayer_type.
// supplier_code generado automáticamente por el service.
//
// Al crear con éxito:
//   1. onSuccess recibe el SupplierForPurchaseLookup completo
//      construido sin fetch adicional (name/taxpayer_type del form,
//      id/supplier_code del action state, nit/nrc null, status active).
//   2. onClose cierra el dialog.
//
// Reset limpio en cada apertura: FormContent recibe key=prefillName,
// lo que garantiza que useActionState y los campos arrancan sin
// residuo de aperturas anteriores.
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useActionState } from "react";
import { X, Loader2 } from "lucide-react";
import { quickCreateSupplierAction } from "../actions/quick-create-supplier.action";
import type { SupplierForPurchaseLookup } from "../types/supplier.types";

// ── Catálogos hardcoded (mismo set que new-supplier-dialog) ───────

const TAXPAYER_OPTIONS = [
  { value: "LARGE_TAXPAYER", label: "Gran contribuyente"    },
  { value: "SMALL_TAXPAYER", label: "Pequeño contribuyente" },
  { value: "NON_TAXPAYER",   label: "No contribuyente"      },
  { value: "FOREIGN",        label: "Extranjero"             },
  { value: "EXCLUDED_SUBJECT", label: "Sujeto excluido"      },
] as const;

// ── Style helpers (mismo patrón que new-supplier-dialog) ──────────

const labelCls = "block text-xs font-medium text-zinc-700 mb-1";
const inputCls =
  "w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent text-zinc-800";
const errorCls = "text-xs text-red-600 mt-1";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className={errorCls}>{errors[0]}</p>;
}

// ── Props ─────────────────────────────────────────────────────────

interface QuickCreateSupplierDialogProps {
  open:        boolean;
  prefillName: string;
  onSuccess:   (supplier: SupplierForPurchaseLookup) => void;
  onClose:     () => void;
}

// ── FormContent — aislado para reset limpio via key ───────────────
//
// Al cambiar prefillName, el padre pasa una nueva key y este
// componente remonta con useActionState y campos en estado inicial.

interface FormContentProps {
  prefillName: string;
  onSuccess:   (supplier: SupplierForPurchaseLookup) => void;
  onClose:     () => void;
}

function FormContent({ prefillName, onSuccess, onClose }: FormContentProps) {
  const [nameValue,     setNameValue]     = useState(prefillName);
  const [taxpayerValue, setTaxpayerValue] = useState("");

  const [state, formAction, isPending] = useActionState(
    quickCreateSupplierAction,
    undefined,
  );

  // Éxito: construye el lookup completo y notifica al padre
  useEffect(() => {
    if (!state?.id || !state.supplier_code) return;

    const supplier: SupplierForPurchaseLookup = {
      id:            state.id,
      supplier_code: state.supplier_code,
      name:          nameValue.trim(),
      taxpayer_type: taxpayerValue as SupplierForPurchaseLookup["taxpayer_type"],
      nit:           null,
      nrc:           null,
      status:        "active",
    };

    onSuccess(supplier);
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.id, state?.supplier_code]);

  return (
    <form action={formAction} noValidate>

      {/* Error global */}
      {state?.error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </div>
      )}

      <div className="space-y-4">

        {/* Nombre */}
        <div>
          <label htmlFor="qc-name" className={labelCls}>
            Nombre / Razón social <span className="text-red-500">*</span>
          </label>
          <input
            id="qc-name"
            name="name"
            type="text"
            maxLength={200}
            autoComplete="off"
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            className={inputCls}
          />
          <FieldError errors={state?.errors?.name} />
        </div>

        {/* Tipo de contribuyente */}
        <div>
          <label htmlFor="qc-taxpayer_type" className={labelCls}>
            Tipo de contribuyente <span className="text-red-500">*</span>
          </label>
          <select
            id="qc-taxpayer_type"
            name="taxpayer_type"
            value={taxpayerValue}
            onChange={(e) => setTaxpayerValue(e.target.value)}
            className={inputCls}
          >
            <option value="" disabled>Seleccionar…</option>
            {TAXPAYER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <FieldError errors={state?.errors?.taxpayer_type} />
        </div>

      </div>

      {/* Pie del formulario */}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isPending ? "Creando…" : "Crear proveedor"}
        </button>
      </div>

    </form>
  );
}

// ── Dialog principal ──────────────────────────────────────────────

export function QuickCreateSupplierDialog({
  open,
  prefillName,
  onSuccess,
  onClose,
}: QuickCreateSupplierDialogProps) {
  if (!open) return null;

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={handleBackdrop}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qc-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 pb-4 pt-5">
          <h2 id="qc-dialog-title" className="text-base font-semibold text-zinc-900">
            Crear proveedor rápido
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nota operativa */}
        <p className="px-6 pt-4 text-xs text-zinc-500">
          El proveedor se creará activo. Puedes completar NIT, dirección y
          otros datos desde el maestro de proveedores.
        </p>

        {/* Formulario — key=prefillName garantiza reset limpio en cada apertura */}
        <div className="px-6 pb-6 pt-4">
          <FormContent
            key={prefillName}
            prefillName={prefillName}
            onSuccess={onSuccess}
            onClose={onClose}
          />
        </div>

      </div>
    </div>
  );
}
