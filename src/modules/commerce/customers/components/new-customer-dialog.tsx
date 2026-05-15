"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/customers — new-customer-dialog.tsx
//
// Formulario completo de alta de cliente en el maestro del tenant.
//
// Secciones:
//   1. Identidad:   customer_code (opcional), name*, legal_name,
//                   taxpayer_type*, id_type_code (desde API CAT-022)
//   2. Fiscal:      nit, nrc, dui,
//                   ActivityPicker → activity_code + activity_name
//   3. Dirección:   MunicipalityPicker → dept_code + municipality_code,
//                   address_complement
//   4. Contacto:    phone, email
//
// id_type_code carga desde /api/catalogs/identification-types con
// fallback estático si el endpoint falla.
// ─────────────────────────────────────────────────────────────────

import { useEffect, useTransition, useState, useRef } from "react";
import { X } from "lucide-react";
import { createCustomerAction } from "../actions/create-customer.action";
import type { CreateCustomerInput } from "../schemas/customer.schemas";
import { ActivityPicker }     from "./activity-picker";
import { MunicipalityPicker } from "./municipality-picker";

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
      <legend className="px-1 text-xs font-semibold text-zinc-400 uppercase tracking-wide">{title}</legend>
      {children}
    </fieldset>
  );
}

// ── Catálogos ─────────────────────────────────────────────────────

const TAXPAYER_OPTIONS = [
  { value: "FINAL_CONSUMER",      label: "Consumidor final"         },
  { value: "REGISTERED_TAXPAYER", label: "Contribuyente registrado" },
  { value: "EXCLUDED_SUBJECT",    label: "Sujeto excluido"          },
] as const;

// Fallback CAT-022 — se usa si el endpoint falla
const ID_TYPE_FALLBACK = [
  { code: "36", name: "NIT"               },
  { code: "13", name: "DUI"               },
  { code: "02", name: "Carnet de residente" },
  { code: "03", name: "Pasaporte"          },
  { code: "37", name: "Otro"              },
  { code: "00", name: "Consumidor final"  },
];

// ── Helpers ───────────────────────────────────────────────────────

function strVal(fd: FormData, key: string): string | null {
  const v = (fd.get(key) as string | null)?.trim();
  return v || null;
}

// ── Props ─────────────────────────────────────────────────────────

interface NewCustomerDialogProps {
  onClose:    () => void;
  onSuccess?: () => void;
}

// ── Componente ────────────────────────────────────────────────────

export function NewCustomerDialog({ onClose, onSuccess }: NewCustomerDialogProps) {
  const formRef    = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error,       setError]      = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // id_type_code — cargado desde API CAT-022
  const [idTypes,       setIdTypes]       = useState(ID_TYPE_FALLBACK);
  const [selectedIdType, setSelectedIdType] = useState("");

  useEffect(() => {
    fetch("/api/catalogs/identification-types")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: { code: string; name: string }[] } | null) => {
        if (d?.items?.length) setIdTypes(d.items);
      })
      .catch(() => { /* mantiene fallback */ });
  }, []);

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const input: CreateCustomerInput = {
      customer_code:      strVal(fd, "customer_code") ?? undefined,
      name:               strVal(fd, "name") ?? "",
      legal_name:         strVal(fd, "legal_name"),
      taxpayer_type:      (strVal(fd, "taxpayer_type") ?? "FINAL_CONSUMER") as CreateCustomerInput["taxpayer_type"],
      id_type_code:       strVal(fd, "id_type_code"),
      nit:                strVal(fd, "nit"),
      nrc:                strVal(fd, "nrc"),
      dui:                strVal(fd, "dui"),
      activity_code:      strVal(fd, "activity_code"),
      activity_name:      strVal(fd, "activity_name"),
      dept_code:          strVal(fd, "dept_code"),
      municipality_code:  strVal(fd, "municipality_code"),
      address_complement: strVal(fd, "address_complement"),
      phone:              strVal(fd, "phone"),
      email:              strVal(fd, "email"),
    };

    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await createCustomerAction(input);
      if (result.ok) {
        onSuccess?.();
        onClose();
      } else {
        setError(result.error);
        setFieldErrors(result.errors ?? {});
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4"
      onClick={handleBackdrop}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-100">
          <h2 className="text-base font-semibold text-zinc-900">Nuevo cliente</h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <form ref={formRef} onSubmit={handleSubmit} className="px-6 py-5">

          {/* Error global */}
          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* ── Sección 1: Identidad ──────────────────────────────── */}
          <Section title="Identidad">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">

              <div>
                <label htmlFor="nc-customer_code" className={labelCls}>
                  Código <span className="text-zinc-400 font-normal">(auto si vacío)</span>
                </label>
                <input
                  id="nc-customer_code" name="customer_code"
                  type="text" maxLength={30} placeholder="CLI-001"
                  autoComplete="off" className={inputCls}
                />
                <FieldError errors={fieldErrors.customer_code} />
              </div>

              <div>
                <label htmlFor="nc-taxpayer_type" className={labelCls}>
                  Tipo contribuyente <span className="text-red-500">*</span>
                </label>
                <select id="nc-taxpayer_type" name="taxpayer_type" defaultValue="FINAL_CONSUMER" className={inputCls}>
                  {TAXPAYER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <FieldError errors={fieldErrors.taxpayer_type} />
              </div>

              <div className="col-span-2">
                <label htmlFor="nc-name" className={labelCls}>
                  Nombre comercial <span className="text-red-500">*</span>
                </label>
                <input
                  id="nc-name" name="name"
                  type="text" maxLength={200}
                  autoComplete="off" className={inputCls}
                />
                <FieldError errors={fieldErrors.name} />
              </div>

              <div className="col-span-2">
                <label htmlFor="nc-legal_name" className={labelCls}>Razón social</label>
                <input
                  id="nc-legal_name" name="legal_name"
                  type="text" maxLength={200}
                  autoComplete="off" className={inputCls}
                />
                <FieldError errors={fieldErrors.legal_name} />
              </div>

              {/* Tipo de identificación — cargado desde CAT-022 */}
              <div>
                <label htmlFor="nc-id_type_code" className={labelCls}>Tipo de identificación</label>
                <select
                  id="nc-id_type_code"
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
                <FieldError errors={fieldErrors.id_type_code} />
              </div>

            </div>
          </Section>

          {/* ── Sección 2: Documentación fiscal ──────────────────── */}
          <Section title="Documentación fiscal">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">

              <div>
                <label htmlFor="nc-nit" className={labelCls}>NIT</label>
                <input
                  id="nc-nit" name="nit"
                  type="text" maxLength={20} placeholder="0000-000000-000-0"
                  autoComplete="off" className={inputCls}
                />
                <FieldError errors={fieldErrors.nit} />
              </div>

              <div>
                <label htmlFor="nc-nrc" className={labelCls}>NRC</label>
                <input
                  id="nc-nrc" name="nrc"
                  type="text" maxLength={20}
                  autoComplete="off" className={inputCls}
                />
                <FieldError errors={fieldErrors.nrc} />
              </div>

              <div>
                <label htmlFor="nc-dui" className={labelCls}>DUI</label>
                <input
                  id="nc-dui" name="dui"
                  type="text" maxLength={20} placeholder="00000000-0"
                  autoComplete="off" className={inputCls}
                />
                <FieldError errors={fieldErrors.dui} />
              </div>

              {/* Actividad económica — selector CAT-019 */}
              <div className="col-span-2">
                <label className={labelCls}>Actividad económica</label>
                <ActivityPicker
                  errorCode={fieldErrors.activity_code}
                  errorName={fieldErrors.activity_name}
                />
              </div>

            </div>
          </Section>

          {/* ── Sección 3: Dirección ─────────────────────────────── */}
          <Section title="Dirección">
            <div className="grid grid-cols-1 gap-y-3">

              {/* Municipio / Departamento — selector CAT-013 */}
              <div>
                <label className={labelCls}>Municipio / Departamento</label>
                <MunicipalityPicker
                  errorDept={fieldErrors.dept_code}
                  errorMuni={fieldErrors.municipality_code}
                />
              </div>

              <div>
                <label htmlFor="nc-address_complement" className={labelCls}>
                  Dirección / domicilio
                </label>
                <textarea
                  id="nc-address_complement" name="address_complement"
                  maxLength={500} rows={2}
                  autoComplete="off"
                  className={`${inputCls} resize-none`}
                />
                <FieldError errors={fieldErrors.address_complement} />
              </div>

            </div>
          </Section>

          {/* ── Sección 4: Contacto ───────────────────────────────── */}
          <Section title="Contacto">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">

              <div>
                <label htmlFor="nc-phone" className={labelCls}>Teléfono</label>
                <input
                  id="nc-phone" name="phone"
                  type="text" maxLength={20}
                  autoComplete="off" className={inputCls}
                />
                <FieldError errors={fieldErrors.phone} />
              </div>

              <div>
                <label htmlFor="nc-email" className={labelCls}>Correo electrónico</label>
                <input
                  id="nc-email" name="email"
                  type="email" maxLength={100}
                  autoComplete="off" className={inputCls}
                />
                <FieldError errors={fieldErrors.email} />
              </div>

            </div>
          </Section>

          {/* Pie */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button" onClick={onClose}
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
              {isPending ? "Guardando…" : "Crear cliente"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
