"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/settings — dte-issuer-config-form-dialog.tsx
//
// Crear/editar los datos fiscales de un DteIssuerConfig (TEST o
// PRODUCTION). Al crear PRODUCTION, si se pasa `prefillFrom`, los
// campos se precargan visualmente con los datos de TEST — el usuario
// debe revisar y guardar explícitamente; nada se copia solo (ni
// credenciales, ni is_active).
// ─────────────────────────────────────────────────────────────────

import { useActionState, useEffect } from "react";
import { X, FileEdit } from "lucide-react";

import {
  createDteIssuerConfigForClientAction,
  updateDteIssuerConfigForClientAction,
} from "../../actions/upsert-dte-issuer-config-for-client.action";
import type { DteIssuerConfigDetail, DteEnvironment } from "../../types/dte.types";

interface Props {
  environment: DteEnvironment;
  /** Config existente a editar. Si es null, se crea una nueva. */
  existing: DteIssuerConfigDetail | null;
  /** Datos de otro ambiente (normalmente TEST) para precargar visualmente al crear. */
  prefillFrom: DteIssuerConfigDetail | null;
  onClose: () => void;
}

function Field({
  label, name, defaultValue, required, placeholder, maxLength,
}: {
  label: string; name: string; defaultValue?: string | null; required?: boolean; placeholder?: string; maxLength?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
      />
    </div>
  );
}

export function DteIssuerConfigFormDialog({ environment, existing, prefillFrom, onClose }: Props) {
  const isEdit = !!existing;
  const action = isEdit ? updateDteIssuerConfigForClientAction : createDteIssuerConfigForClientAction;
  const [state, formAction, isPending] = useActionState(action, undefined);

  const source = existing ?? prefillFrom;

  useEffect(() => {
    if (state && "success" in state && state.success) {
      const t = setTimeout(onClose, 1000);
      return () => clearTimeout(t);
    }
  }, [state, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-100">
          <h2 className="text-base font-bold text-zinc-800 flex items-center gap-2">
            <FileEdit size={16} className="text-zinc-400" />
            {isEdit ? "Editar" : "Configurar"} emisor — {environment === "PRODUCTION" ? "PRODUCCIÓN" : "PRUEBAS"}
          </h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form action={formAction} className="p-5 space-y-4">
          {isEdit ? (
            <input type="hidden" name="id" value={existing!.id} />
          ) : (
            <input type="hidden" name="environment" value={environment} />
          )}

          {state && "error" in state && state.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
              {state.error}
            </div>
          )}
          {state && "success" in state && state.success && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2">
              Configuración guardada.
            </div>
          )}

          {!isEdit && prefillFrom && (
            <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-lg px-4 py-2">
              Datos precargados desde la configuración de PRUEBAS como referencia. Revíselos antes de guardar
              — no se copian credenciales ni el estado activo.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="NIT" name="nit" defaultValue={source?.nit} required maxLength={20} />
            <Field label="NRC" name="nrc" defaultValue={source?.nrc} maxLength={20} />
          </div>

          <Field label="Nombre / Razón social" name="name" defaultValue={source?.name} required maxLength={200} />
          <Field label="Nombre comercial" name="legal_name" defaultValue={source?.legal_name} maxLength={200} />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Código de actividad económica" name="activity_code" defaultValue={source?.activity_code} maxLength={10} />
            <Field label="Descripción de actividad" name="activity_name" defaultValue={source?.activity_name} maxLength={200} />
          </div>

          <div className="pt-2 border-t border-zinc-100">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
              Establecimiento (CAT-009 MH)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Código establecimiento (interno)" name="establishment_code" defaultValue={source?.establishment_code} maxLength={10} />
            <Field label="Tipo de establecimiento (CAT-009)" name="establishment_type_code" defaultValue={source?.establishment_type_code} placeholder="01 Sucursal · 02 Casa Matriz · 04 Bodega · 07 Patio" maxLength={5} />
          </div>
          <Field label="Código punto de venta (interno)" name="point_of_sale_code" defaultValue={source?.point_of_sale_code} maxLength={10} />

          <div className="grid grid-cols-2 gap-3">
            <Field label="cod_estable_mh (asignado por Hacienda)" name="cod_estable_mh" defaultValue={source?.cod_estable_mh} placeholder="Ej. M001" maxLength={4} />
            <Field label="cod_punto_venta_mh (asignado por Hacienda)" name="cod_punto_venta_mh" defaultValue={source?.cod_punto_venta_mh} placeholder="Ej. P001" maxLength={4} />
          </div>

          <div className="pt-2 border-t border-zinc-100">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Dirección y contacto</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Departamento (código)" name="dept_code" defaultValue={source?.dept_code} maxLength={5} />
            <Field label="Municipio (código)" name="municipality_code" defaultValue={source?.municipality_code} maxLength={5} />
          </div>
          <Field label="Complemento de dirección" name="address_complement" defaultValue={source?.address_complement} maxLength={500} />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono" name="phone" defaultValue={source?.phone} maxLength={20} />
            <Field label="Correo" name="email" defaultValue={source?.email} maxLength={100} />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-sm text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {isPending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
