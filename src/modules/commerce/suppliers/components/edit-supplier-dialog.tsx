"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — edit-supplier-dialog.tsx
//
// Edición de Identidad, Documentación fiscal y Contacto.
// Giro y Dirección se gestionan desde sus pestañas (S10F / S10G).
//
// Passthrough: los campos de giro y dirección se incluyen como
// hidden inputs con el valor actual del proveedor para que
// updateSupplierAction (full-form) no los sobreescriba con null.
//
// id_type_code usa select controlado — sus opciones llegan async.
//
// Éxito: result === undefined → onSuccess?.() + onClose()
// Error: state.errors (por campo) + state.error (banner global)
// ─────────────────────────────────────────────────────────────────

import { useActionState, useEffect, useState } from "react";
import { X } from "lucide-react";
import { updateSupplierAction } from "../actions/update-supplier.action";
import type { SupplierUpdateActionState } from "../actions/update-supplier.action";
import type { SupplierDetail } from "../types/supplier.types";
import type { IdentificationTypeItem } from "../types/supplier-catalogs.types";

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

// ── Constantes ────────────────────────────────────────────────────

const TAXPAYER_OPTIONS = [
  { value: "LARGE_TAXPAYER", label: "Gran contribuyente"    },
  { value: "SMALL_TAXPAYER", label: "Pequeño contribuyente" },
  { value: "NON_TAXPAYER",   label: "No contribuyente"      },
  { value: "FOREIGN",        label: "Extranjero"             },
  { value: "EXCLUDED_SUBJECT", label: "Sujeto excluido"      },
] as const;

// Persona natural/jurídica — independiente del tipo de contribuyente.
// Solo decide automatización de Retención de Renta en compras FSE 14.
const PERSON_TYPE_OPTIONS = [
  { value: "UNKNOWN",        label: "Sin clasificar"     },
  { value: "NATURAL_PERSON", label: "Persona natural"    },
  { value: "LEGAL_ENTITY",   label: "Persona jurídica"   },
] as const;

const ID_TYPE_FALLBACK: IdentificationTypeItem[] = [
  { code: "36", name: "NIT",                description: null },
  { code: "13", name: "DUI",                description: null },
  { code: "02", name: "Carnet de residente", description: null },
  { code: "03", name: "Pasaporte",           description: null },
  { code: "37", name: "Otro",               description: null },
  { code: "00", name: "Consumidor final",   description: null },
];

// ── Props ─────────────────────────────────────────────────────────

interface EditSupplierDialogProps {
  supplier:   SupplierDetail;
  onClose:    () => void;
  onSuccess?: () => void;
}

// ── Componente ────────────────────────────────────────────────────

export function EditSupplierDialog({
  supplier,
  onClose,
  onSuccess,
}: EditSupplierDialogProps) {

  const [state, formAction, isPending] = useActionState(
    async (prev: SupplierUpdateActionState, formData: FormData) => {
      const result = await updateSupplierAction(prev, formData);
      if (result === undefined) {
        onSuccess?.();
        onClose();
      }
      return result;
    },
    undefined,
  );

  // id_type_code usa select controlado — opciones llegan async
  const [idTypes,       setIdTypes]       = useState<IdentificationTypeItem[]>([]);
  const [selectedIdType, setSelectedIdType] = useState(supplier.id_type_code ?? "");

  useEffect(() => {
    fetch("/api/catalogs/identification-types")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: IdentificationTypeItem[] } | null) =>
        setIdTypes(d?.items ?? ID_TYPE_FALLBACK),
      )
      .catch(() => setIdTypes(ID_TYPE_FALLBACK));
  }, []);

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
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Editar proveedor</h2>
            <p className="text-xs font-mono text-zinc-400 mt-0.5">{supplier.supplier_code}</p>
          </div>
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

          {/* Identidad del registro */}
          <input type="hidden" name="id" value={supplier.id} />

          {/* ── Passthrough: giro y dirección ────────────────────────
              updateSupplierAction es full-form. Sin estos inputs,
              strNullable(formData.get(...)) devuelve null y el service
              sobrescribiría los valores actuales con null.
              Giro y Dirección se editan desde sus pestañas (S10F/S10G).
          ──────────────────────────────────────────────────────────── */}
          <input type="hidden" name="activity_code"      value={supplier.activity_code      ?? ""} />
          <input type="hidden" name="activity_name"      value={supplier.activity_name      ?? ""} />
          <input type="hidden" name="dept_code"          value={supplier.dept_code          ?? ""} />
          <input type="hidden" name="dept_name"          value={supplier.dept_name          ?? ""} />
          <input type="hidden" name="municipality_code"  value={supplier.municipality_code  ?? ""} />
          <input type="hidden" name="municipality_name"  value={supplier.municipality_name  ?? ""} />
          <input type="hidden" name="country_code"       value={supplier.country_code       ?? ""} />
          <input type="hidden" name="country_name"       value={supplier.country_name       ?? ""} />
          <input type="hidden" name="address_complement" value={supplier.address_complement ?? ""} />

          {/* Error global */}
          {state?.error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {state.error}
            </div>
          )}

          {/* ── Sección 1: Identidad ──────────────────────────────── */}
          <Section title="Identidad">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">

              <div className="col-span-2">
                <label htmlFor="es-name" className={labelCls}>
                  Nombre / Razón social <span className="text-red-500">*</span>
                </label>
                <input
                  id="es-name"
                  name="name"
                  type="text"
                  maxLength={200}
                  defaultValue={supplier.name}
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.name} />
              </div>

              <div className="col-span-2">
                <label htmlFor="es-legal_name" className={labelCls}>
                  Nombre legal alternativo
                </label>
                <input
                  id="es-legal_name"
                  name="legal_name"
                  type="text"
                  maxLength={200}
                  defaultValue={supplier.legal_name ?? ""}
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.legal_name} />
              </div>

              <div>
                <label htmlFor="es-account_code" className={labelCls}>
                  Código contable
                </label>
                <input
                  id="es-account_code"
                  name="account_code"
                  type="text"
                  maxLength={50}
                  defaultValue={supplier.account_code ?? ""}
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.account_code} />
              </div>

              <div>
                <label htmlFor="es-taxpayer_type" className={labelCls}>
                  Tipo contribuyente <span className="text-red-500">*</span>
                </label>
                <select
                  id="es-taxpayer_type"
                  name="taxpayer_type"
                  defaultValue={supplier.taxpayer_type}
                  className={inputCls}
                >
                  {TAXPAYER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <FieldError errors={state?.errors?.taxpayer_type} />
              </div>

              <div>
                <label htmlFor="es-person_type" className={labelCls}>
                  Clasificación persona
                </label>
                <select
                  id="es-person_type"
                  name="person_type"
                  defaultValue={supplier.person_type}
                  className={inputCls}
                >
                  {PERSON_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <FieldError errors={state?.errors?.person_type} />
              </div>

            </div>
          </Section>

          {/* ── Sección 2: Documentación fiscal ──────────────────── */}
          <Section title="Documentación fiscal">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">

              <div>
                <label htmlFor="es-id_type_code" className={labelCls}>
                  Tipo de identificación
                </label>
                <select
                  id="es-id_type_code"
                  name="id_type_code"
                  value={selectedIdType}
                  onChange={(e) => setSelectedIdType(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Sin tipo —</option>
                  {idTypes.map((t) => (
                    <option key={t.code} value={t.code}>{t.code} — {t.name}</option>
                  ))}
                </select>
                <FieldError errors={state?.errors?.id_type_code} />
              </div>

              <div>
                <label htmlFor="es-dui" className={labelCls}>DUI</label>
                <input
                  id="es-dui"
                  name="dui"
                  type="text"
                  maxLength={20}
                  placeholder="00000000-0"
                  defaultValue={supplier.dui ?? ""}
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.dui} />
              </div>

              <div>
                <label htmlFor="es-nit" className={labelCls}>NIT</label>
                <input
                  id="es-nit"
                  name="nit"
                  type="text"
                  maxLength={20}
                  placeholder="0000-000000-000-0"
                  defaultValue={supplier.nit ?? ""}
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.nit} />
              </div>

              <div>
                <label htmlFor="es-nrc" className={labelCls}>NRC</label>
                <input
                  id="es-nrc"
                  name="nrc"
                  type="text"
                  maxLength={20}
                  defaultValue={supplier.nrc ?? ""}
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.nrc} />
              </div>

              <div className="col-span-2">
                <label htmlFor="es-other_document" className={labelCls}>
                  Otro documento
                </label>
                <input
                  id="es-other_document"
                  name="other_document"
                  type="text"
                  maxLength={100}
                  defaultValue={supplier.other_document ?? ""}
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.other_document} />
              </div>

            </div>
          </Section>

          {/* ── Sección 3: Contacto ───────────────────────────────── */}
          <Section title="Contacto">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">

              <div>
                <label htmlFor="es-contact_name" className={labelCls}>Nombre contacto</label>
                <input
                  id="es-contact_name"
                  name="contact_name"
                  type="text"
                  maxLength={150}
                  defaultValue={supplier.contact_name ?? ""}
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.contact_name} />
              </div>

              <div>
                <label htmlFor="es-contact_role" className={labelCls}>Cargo</label>
                <input
                  id="es-contact_role"
                  name="contact_role"
                  type="text"
                  maxLength={100}
                  defaultValue={supplier.contact_role ?? ""}
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.contact_role} />
              </div>

              <div>
                <label htmlFor="es-phone" className={labelCls}>Teléfono principal</label>
                <input
                  id="es-phone"
                  name="phone"
                  type="text"
                  maxLength={20}
                  defaultValue={supplier.phone ?? ""}
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.phone} />
              </div>

              <div>
                <label htmlFor="es-phone_alt" className={labelCls}>Teléfono alternativo</label>
                <input
                  id="es-phone_alt"
                  name="phone_alt"
                  type="text"
                  maxLength={20}
                  defaultValue={supplier.phone_alt ?? ""}
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.phone_alt} />
              </div>

              <div>
                <label htmlFor="es-email" className={labelCls}>Email</label>
                <input
                  id="es-email"
                  name="email"
                  type="email"
                  maxLength={200}
                  defaultValue={supplier.email ?? ""}
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.email} />
              </div>

              <div>
                <label htmlFor="es-whatsapp" className={labelCls}>WhatsApp</label>
                <input
                  id="es-whatsapp"
                  name="whatsapp"
                  type="text"
                  maxLength={20}
                  defaultValue={supplier.whatsapp ?? ""}
                  autoComplete="off"
                  className={inputCls}
                />
                <FieldError errors={state?.errors?.whatsapp} />
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
              {isPending ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
