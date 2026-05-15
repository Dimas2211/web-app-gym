"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — new-supplier-dialog.tsx
//
// Formulario de alta de proveedor en el maestro del tenant.
//
// Campos mínimos de creación (8):
//   Identidad: supplier_code*, name*, legal_name, taxpayer_type*
//   Fiscal:    id_type_code, dui, nit, nrc
//
// El resto (contacto, dirección, giro económico, account_code) se
// completa desde el formulario de edición (S10D). No se cargan
// catálogos externos en este dialog.
//
// taxpayer_type e id_type_code usan opciones hardcoded — son
// constantes de sistema (CAT-022), no requieren fetch.
//
// Éxito:  result === undefined → onSuccess() + onClose()
// Error:  state.errors (por campo) + state.error (banner global)
// ─────────────────────────────────────────────────────────────────

import { useActionState } from "react";
import { X } from "lucide-react";
import { createSupplierAction } from "../actions/create-supplier.action";
import type { SupplierActionState } from "../actions/create-supplier.action";

// ── Style helpers ─────────────────────────────────────────────────

const labelCls = "block text-xs font-medium text-zinc-700 mb-1";
const inputCls =
  "w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent text-zinc-800";
const errorCls = "text-xs text-red-600 mt-1";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className={errorCls}>{errors[0]}</p>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border border-zinc-100 rounded-lg p-4 mb-4">
      <legend className="px-1 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

// ── Catálogos hardcoded ───────────────────────────────────────────

const TAXPAYER_OPTIONS = [
  { value: "LARGE_TAXPAYER", label: "Gran contribuyente"    },
  { value: "SMALL_TAXPAYER", label: "Pequeño contribuyente" },
  { value: "NON_TAXPAYER",   label: "No contribuyente"      },
  { value: "FOREIGN",        label: "Extranjero"             },
] as const;

// CAT-022 — Tipos de identificación DTE El Salvador
const ID_TYPE_OPTIONS = [
  { value: "",   label: "— Sin tipo —"              },
  { value: "36", label: "36 — NIT"                  },
  { value: "13", label: "13 — DUI"                  },
  { value: "02", label: "02 — Carnet de residente"  },
  { value: "03", label: "03 — Pasaporte"            },
  { value: "37", label: "37 — Otro"                 },
  { value: "00", label: "00 — Consumidor final"     },
] as const;

// ── Props ─────────────────────────────────────────────────────────

interface NewSupplierDialogProps {
  onClose:    () => void;
  onSuccess?: () => void;
}

// ── Componente ────────────────────────────────────────────────────

export function NewSupplierDialog({ onClose, onSuccess }: NewSupplierDialogProps) {
  const [state, formAction, isPending] = useActionState(
    async (prev: SupplierActionState, formData: FormData) => {
      const result = await createSupplierAction(prev, formData);
      if (result === undefined) {
        onSuccess?.();
        onClose();
      }
      return result;
    },
    undefined,
  );

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4"
      onClick={handleBackdrop}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-100">
          <h2 className="text-base font-semibold text-zinc-900">Nuevo proveedor</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <form action={formAction} className="px-6 py-5">

          {/* Error global */}
          {state?.error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {state.error}
            </div>
          )}

          {/* ── Sección 1: Identidad ──────────────────────────────── */}
          <Section title="Identidad">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">

              <div>
                <label htmlFor="ns-supplier_code" className={labelCls}>
                  Código <span className="text-red-500">*</span>
                </label>
                <input
                  id="ns-supplier_code"
                  name="supplier_code"
                  type="text"
                  maxLength={30}
                  placeholder="PROV-001"
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.supplier_code} />
              </div>

              <div>
                <label htmlFor="ns-taxpayer_type" className={labelCls}>
                  Tipo contribuyente <span className="text-red-500">*</span>
                </label>
                <select
                  id="ns-taxpayer_type"
                  name="taxpayer_type"
                  defaultValue=""
                  className={inputCls}
                >
                  <option value="" disabled>Seleccionar…</option>
                  {TAXPAYER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <FieldError errors={state?.errors?.taxpayer_type} />
              </div>

              <div className="col-span-2">
                <label htmlFor="ns-name" className={labelCls}>
                  Nombre / Razón social <span className="text-red-500">*</span>
                </label>
                <input
                  id="ns-name"
                  name="name"
                  type="text"
                  maxLength={200}
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.name} />
              </div>

              <div className="col-span-2">
                <label htmlFor="ns-legal_name" className={labelCls}>
                  Nombre legal alternativo
                </label>
                <input
                  id="ns-legal_name"
                  name="legal_name"
                  type="text"
                  maxLength={200}
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.legal_name} />
              </div>

            </div>
          </Section>

          {/* ── Sección 2: Documentación fiscal ──────────────────── */}
          <Section title="Documentación fiscal">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">

              <div>
                <label htmlFor="ns-id_type_code" className={labelCls}>
                  Tipo de identificación
                </label>
                <select
                  id="ns-id_type_code"
                  name="id_type_code"
                  defaultValue=""
                  className={inputCls}
                >
                  {ID_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <FieldError errors={state?.errors?.id_type_code} />
              </div>

              <div>
                <label htmlFor="ns-dui" className={labelCls}>
                  DUI
                </label>
                <input
                  id="ns-dui"
                  name="dui"
                  type="text"
                  maxLength={20}
                  placeholder="00000000-0"
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.dui} />
              </div>

              <div>
                <label htmlFor="ns-nit" className={labelCls}>
                  NIT
                </label>
                <input
                  id="ns-nit"
                  name="nit"
                  type="text"
                  maxLength={20}
                  placeholder="0000-000000-000-0"
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.nit} />
              </div>

              <div>
                <label htmlFor="ns-nrc" className={labelCls}>
                  NRC
                </label>
                <input
                  id="ns-nrc"
                  name="nrc"
                  type="text"
                  maxLength={20}
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.nrc} />
              </div>

            </div>
          </Section>

          {/* Pie */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-zinc-300 text-zinc-600
                         hover:bg-zinc-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm rounded-lg bg-zinc-900 text-white font-medium
                         hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? "Guardando…" : "Crear proveedor"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
