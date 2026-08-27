"use client";

// -----------------------------------------------------------------
// commerce/purchases — purchase-dte-create-supplier-dialog.tsx
//
// Modal de alta rapida de proveedor desde datos del emisor DTE.
// Se abre solo cuando el usuario presiona "Crear proveedor desde DTE".
// Prerrellena nombre, NIT y NRC del emisor detectado.
//
// Llama POST /api/suppliers/from-dte con los datos del formulario.
// Al crear correctamente llama onCreated({ id, supplier_code, name })
// para que el componente padre seleccione el proveedor automaticamente.
//
// No auto-crea: el usuario debe confirmar con "Guardar proveedor".
// -----------------------------------------------------------------

import { useState } from "react";
import { Loader2, X } from "lucide-react";

export interface CreatedSupplierData {
  id:            string;
  supplier_code: string;
  name:          string;
}

interface EmitterDetected {
  name:  string | null;
  nit:   string | null;
  nrc:   string | null;
}

interface Props {
  emitter:   EmitterDetected;
  onClose:   () => void;
  onCreated: (supplier: CreatedSupplierData) => void;
}

const TAXPAYER_TYPE_LABELS: Record<string, string> = {
  LARGE_TAXPAYER: "Gran contribuyente",
  SMALL_TAXPAYER: "Pequeno contribuyente",
  NON_TAXPAYER:   "No contribuyente",
  FOREIGN:        "Extranjero",
  EXCLUDED_SUBJECT: "Sujeto excluido",
};

const TAXPAYER_TYPE_OPTIONS = Object.entries(TAXPAYER_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

type FieldErrors = Partial<Record<"name" | "taxpayer_type" | "nit" | "nrc" | "phone" | "email", string>>;

export function PurchaseDteCreateSupplierDialog({ emitter, onClose, onCreated }: Props) {
  const [name,          setName]          = useState(emitter.name  ?? "");
  const [taxpayerType,  setTaxpayerType]  = useState("");
  const [nit,           setNit]           = useState(emitter.nit   ?? "");
  const [nrc,           setNrc]           = useState(emitter.nrc   ?? "");
  const [phone,         setPhone]         = useState("");
  const [email,         setEmail]         = useState("");

  const [saving,        setSaving]        = useState(false);
  const [globalError,   setGlobalError]   = useState<string | null>(null);
  const [fieldErrors,   setFieldErrors]   = useState<FieldErrors>({});

  function clearErrors() {
    setGlobalError(null);
    setFieldErrors({});
  }

  async function handleSave() {
    clearErrors();

    const localErrors: FieldErrors = {};
    if (!name.trim())        localErrors.name          = "El nombre es requerido.";
    if (!taxpayerType)       localErrors.taxpayer_type = "Selecciona el tipo de contribuyente.";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/suppliers/from-dte", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name:          name.trim(),
          taxpayer_type: taxpayerType,
          nit:           nit.trim()   || null,
          nrc:           nrc.trim()   || null,
          phone:         phone.trim() || null,
          email:         email.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({})) as Record<string, unknown>;

      if (!res.ok) {
        if (res.status === 400 && data.errors && typeof data.errors === "object") {
          const errs = data.errors as Record<string, string[]>;
          setFieldErrors({
            name:          errs.name?.[0],
            taxpayer_type: errs.taxpayer_type?.[0],
            nit:           errs.nit?.[0],
            nrc:           errs.nrc?.[0],
            phone:         errs.phone?.[0],
            email:         errs.email?.[0],
          });
        } else {
          const msg = typeof data.error === "string"
            ? data.error
            : "Error al crear el proveedor. Verifica los datos e intenta de nuevo.";
          setGlobalError(msg);
        }
        return;
      }

      const created = data as unknown as CreatedSupplierData;
      onCreated(created);
    } catch {
      setGlobalError("Error de red. Verifica tu conexion e intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-none">
          <h2 className="text-sm font-semibold text-zinc-100">
            Crear proveedor desde DTE
          </h2>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">
          <p className="text-xs text-zinc-500">
            Revisa los datos detectados del emisor antes de guardarlo en el maestro de proveedores.
          </p>

          {globalError && (
            <div className="text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-3 py-2">
              {globalError}
            </div>
          )}

          {/* Nombre */}
          <div className="space-y-1">
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
              Nombre / Razon social <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); clearErrors(); }}
              disabled={saving}
              maxLength={200}
              placeholder="Nombre del proveedor"
              className="w-full h-7 px-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
            />
            {fieldErrors.name && (
              <p className="text-[10px] text-red-400">{fieldErrors.name}</p>
            )}
          </div>

          {/* Tipo contribuyente */}
          <div className="space-y-1">
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
              Tipo de contribuyente <span className="text-red-400">*</span>
            </label>
            <select
              value={taxpayerType}
              onChange={(e) => { setTaxpayerType(e.target.value); clearErrors(); }}
              disabled={saving}
              className="w-full h-7 px-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
            >
              <option value="">Seleccionar...</option>
              {TAXPAYER_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {fieldErrors.taxpayer_type && (
              <p className="text-[10px] text-red-400">{fieldErrors.taxpayer_type}</p>
            )}
          </div>

          {/* NIT / NRC */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[10px] uppercase tracking-wider text-zinc-500">NIT</label>
              <input
                type="text"
                value={nit}
                onChange={(e) => { setNit(e.target.value); clearErrors(); }}
                disabled={saving}
                maxLength={20}
                placeholder="0000-000000-000-0"
                className="w-full h-7 px-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50 font-mono"
              />
              {fieldErrors.nit && (
                <p className="text-[10px] text-red-400">{fieldErrors.nit}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] uppercase tracking-wider text-zinc-500">NRC</label>
              <input
                type="text"
                value={nrc}
                onChange={(e) => { setNrc(e.target.value); clearErrors(); }}
                disabled={saving}
                maxLength={20}
                placeholder="Numero de registro"
                className="w-full h-7 px-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50 font-mono"
              />
              {fieldErrors.nrc && (
                <p className="text-[10px] text-red-400">{fieldErrors.nrc}</p>
              )}
            </div>
          </div>

          {/* Telefono / Email */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[10px] uppercase tracking-wider text-zinc-500">Telefono</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); clearErrors(); }}
                disabled={saving}
                maxLength={20}
                placeholder="Opcional"
                className="w-full h-7 px-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
              />
              {fieldErrors.phone && (
                <p className="text-[10px] text-red-400">{fieldErrors.phone}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] uppercase tracking-wider text-zinc-500">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearErrors(); }}
                disabled={saving}
                maxLength={200}
                placeholder="Opcional"
                className="w-full h-7 px-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
              />
              {fieldErrors.email && (
                <p className="text-[10px] text-red-400">{fieldErrors.email}</p>
              )}
            </div>
          </div>

          <p className="text-[10px] text-zinc-600">
            El codigo de proveedor se genera automaticamente. Puedes completar el resto de la ficha
            desde el maestro de proveedores despues de guardar.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-zinc-800 flex-none">
          <button
            onClick={onClose}
            disabled={saving}
            className="h-7 px-3 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-7 px-4 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            {saving ? "Guardando..." : "Guardar proveedor"}
          </button>
        </div>
      </div>
    </div>
  );
}
