"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/products — product-status-dialog.tsx
//
// Diálogo de cambio de estado de un producto del catálogo.
// Muestra solo las transiciones válidas desde el estado actual.
// Usa VALID_TRANSITIONS de product-status.utils (fuente única).
// ─────────────────────────────────────────────────────────────────

import { useActionState, useState } from "react";
import { X } from "lucide-react";
import {
  VALID_TRANSITIONS,
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUS_COLORS,
} from "../utils/product-status.utils";
import { updateProductStatusAction } from "../actions/update-product-status.action";
import type { ProductStatus } from "../types/product.types";
import type { ProductListItem } from "../types/product.types";

interface ProductStatusDialogProps {
  product: Pick<ProductListItem, "id" | "product_code" | "name" | "status">;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ProductStatusDialog({
  product,
  onClose,
  onSuccess,
}: ProductStatusDialogProps) {
  const currentStatus = product.status;
  const availableTransitions = VALID_TRANSITIONS[currentStatus] ?? [];

  const [selectedStatus, setSelectedStatus] = useState<ProductStatus | "">(
    availableTransitions[0] ?? ""
  );

  const [state, formAction, isPending] = useActionState(
    async (prev: { error?: string } | undefined, formData: FormData) => {
      const result = await updateProductStatusAction(prev, formData);
      if (!result?.error) {
        onSuccess?.();
        onClose();
      }
      return result;
    },
    undefined
  );

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleBackdrop}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Cambiar estado</h2>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono">{product.product_code}</p>
            <p className="text-sm text-zinc-700 leading-tight">{product.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 ml-2"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Estado actual */}
        <div className="mb-4">
          <p className="text-xs text-zinc-400 mb-1">Estado actual</p>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
              ${PRODUCT_STATUS_COLORS[currentStatus]}`}
          >
            {PRODUCT_STATUS_LABELS[currentStatus]}
          </span>
        </div>

        {/* Estado sin transiciones posibles */}
        {availableTransitions.length === 0 && (
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 text-sm text-zinc-500 text-center">
            <p className="text-xs mt-1 text-zinc-400">
              Este estado no permite transiciones configuradas.
            </p>
          </div>
        )}

        {/* Formulario de transición */}
        {availableTransitions.length > 0 && (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="id" value={product.id} />
            <input type="hidden" name="status" value={selectedStatus} />

            <div>
              <p className="text-xs text-zinc-400 mb-2">Cambiar a</p>
              <div className="space-y-2">
                {availableTransitions.map((status) => (
                  <label
                    key={status}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors
                      ${selectedStatus === status
                        ? "border-zinc-900 bg-zinc-50"
                        : "border-zinc-200 hover:border-zinc-300"
                      }`}
                  >
                    <input
                      type="radio"
                      name="status_choice"
                      value={status}
                      checked={selectedStatus === status}
                      onChange={() => setSelectedStatus(status)}
                      className="shrink-0"
                    />
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                        ${PRODUCT_STATUS_COLORS[status]}`}
                    >
                      {PRODUCT_STATUS_LABELS[status]}
                    </span>
                    {status === "DISCONTINUED" && (
                      <span className="text-xs text-red-400 ml-auto">terminal</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {state?.error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {state.error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!selectedStatus || isPending}
                className="px-4 py-2 text-sm rounded-lg bg-zinc-900 text-white font-medium
                           hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? "Guardando…" : "Confirmar cambio"}
              </button>
            </div>
          </form>
        )}

        {availableTransitions.length === 0 && (
          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
