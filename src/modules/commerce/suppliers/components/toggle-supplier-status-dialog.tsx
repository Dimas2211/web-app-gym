"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — toggle-supplier-status-dialog.tsx
//
// Dialogo de cambio de estado activo/inactivo del proveedor.
//
// Suppliers solo tienen dos estados (active ↔ inactive), sin
// estados terminales. La transición es siempre la inversa del
// estado actual — no se necesita selector de estado.
//
// Advertencia contextual cuando el destino es "inactive":
//   un proveedor inactivo no puede seleccionarse en nuevas compras.
//
// Éxito:  result === undefined → onSuccess() + onClose()
// Error:  state.error (banner global)
// ─────────────────────────────────────────────────────────────────

import { useActionState } from "react";
import { X } from "lucide-react";
import { toggleSupplierStatusAction } from "../actions/toggle-supplier-status.action";
import type { ToggleSupplierStatusState } from "../actions/toggle-supplier-status.action";
import type { SupplierListItem } from "../types/supplier.types";

// ── Helpers de presentación ───────────────────────────────────────

const STATUS_CONFIG = {
  active:   { label: "Activo",   cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  inactive: { label: "Inactivo", cls: "bg-zinc-100 text-zinc-500 border border-zinc-200"         },
} as const;

// ── Props ─────────────────────────────────────────────────────────

interface ToggleSupplierStatusDialogProps {
  supplier:   Pick<SupplierListItem, "id" | "supplier_code" | "name" | "status">;
  onClose:    () => void;
  onSuccess?: () => void;
}

// ── Componente ────────────────────────────────────────────────────

export function ToggleSupplierStatusDialog({
  supplier,
  onClose,
  onSuccess,
}: ToggleSupplierStatusDialogProps) {
  const targetStatus = supplier.status === "active" ? "inactive" : "active";
  const currentCfg   = STATUS_CONFIG[supplier.status];
  const targetCfg    = STATUS_CONFIG[targetStatus];

  const [state, formAction, isPending] = useActionState(
    async (prev: ToggleSupplierStatusState, formData: FormData) => {
      const result = await toggleSupplierStatusAction(prev, formData);
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={handleBackdrop}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Cambiar estado</h2>
            <p className="text-xs font-mono text-zinc-400 mt-0.5">{supplier.supplier_code}</p>
            <p className="text-sm text-zinc-700 leading-snug mt-0.5 max-w-[240px] line-clamp-2">
              {supplier.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 ml-2 shrink-0"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Transición visual: estado actual → estado destino */}
        <div className="flex items-center gap-3 mb-4 py-3 px-4 bg-zinc-50 rounded-lg border border-zinc-100">
          <div className="flex flex-col items-center gap-1 flex-1">
            <p className="text-xs text-zinc-400">Actual</p>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${currentCfg.cls}`}>
              {currentCfg.label}
            </span>
          </div>
          <span className="text-zinc-300 text-lg leading-none">→</span>
          <div className="flex flex-col items-center gap-1 flex-1">
            <p className="text-xs text-zinc-400">Nuevo</p>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${targetCfg.cls}`}>
              {targetCfg.label}
            </span>
          </div>
        </div>

        {/* Advertencia cuando se inactiva */}
        {targetStatus === "inactive" && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 leading-relaxed">
            Un proveedor inactivo no puede seleccionarse en nuevas compras.
            El historial de compras existente no se altera.
          </p>
        )}

        {/* Error de action */}
        {state?.error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
            {state.error}
          </p>
        )}

        {/* Formulario */}
        <form action={formAction}>
          <input type="hidden" name="id"     value={supplier.id} />
          <input type="hidden" name="status" value={targetStatus} />

          <div className="flex justify-end gap-2">
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
              {isPending ? "Guardando…" : "Confirmar cambio"}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
