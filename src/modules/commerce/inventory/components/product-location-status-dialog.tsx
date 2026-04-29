"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/inventory — product-location-status-dialog.tsx
//
// Diálogo de confirmación para activar o desactivar un ProductLocation.
// Solo modifica el campo is_active — ningún otro campo se toca.
//
// Flujo:
//   1. Muestra el producto y el estado actual.
//   2. Confirma la acción inversa (activar si inactivo, desactivar si activo).
//   3. PATCH /api/inventory/product-locations/[id]/status con { is_active }.
//   4. Llama onSuccess() + onClose() si el servidor responde con éxito.
//
// Nota de negocio: desactivar un ProductLocation impide registrar
// movimientos sobre él hasta que se reactive. No afecta el historial
// existente ni el stock almacenado.
// ─────────────────────────────────────────────────────────────────

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import type { ProductLocationItem } from "../types/inventory.types";

// ── Props ─────────────────────────────────────────────────────────

interface ProductLocationStatusDialogProps {
  productLocation: Pick<
    ProductLocationItem,
    "id" | "product_code" | "product_name" | "is_active" | "warehouse" | "current_stock"
  >;
  onClose: () => void;
  onSuccess?: () => void;
}

// ── Componente ────────────────────────────────────────────────────

export function ProductLocationStatusDialog({
  productLocation,
  onClose,
  onSuccess,
}: ProductLocationStatusDialogProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const willActivate = !productLocation.is_active;

  async function handleConfirm() {
    setError(null);
    setIsPending(true);

    try {
      const res = await fetch(
        `/api/inventory/product-locations/${productLocation.id}/status`,
        {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ is_active: willActivate }),
        },
      );

      if (res.ok) {
        onSuccess?.();
        onClose();
        return;
      }

      const data = await res.json().catch(() => ({}));
      setError(
        (data as { error?: string }).error ??
          "No se pudo actualizar el estado. Intenta de nuevo.",
      );
    } catch {
      setError("No se pudo conectar con el servidor. Verifica tu conexión.");
    } finally {
      setIsPending(false);
    }
  }

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !isPending) onClose();
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
            <h2 className="text-base font-semibold text-zinc-900">
              {willActivate ? "Activar registro" : "Desactivar registro"}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">Inventario · estado operativo</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="text-zinc-400 hover:text-zinc-600 ml-2 disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Identidad del producto */}
        <div className="mb-4 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
          <p className="text-xs font-mono text-zinc-400 mb-0.5">{productLocation.product_code}</p>
          <p className="text-sm font-semibold text-zinc-800 leading-tight">
            {productLocation.product_name}
          </p>
          {productLocation.warehouse && (
            <p className="text-xs text-zinc-400 mt-1">
              Almacén: <span className="text-zinc-600">{productLocation.warehouse}</span>
            </p>
          )}
        </div>

        {/* Estado actual */}
        <div className="mb-4">
          <p className="text-xs text-zinc-400 mb-1.5">Estado actual</p>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                productLocation.is_active ? "bg-emerald-500" : "bg-zinc-300"
              }`}
            />
            <span className="text-sm text-zinc-700 font-medium">
              {productLocation.is_active ? "Activo" : "Inactivo"}
            </span>
          </div>
        </div>

        {/* Mensaje de consecuencia */}
        {!willActivate && (
          <div className="mb-4 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>
              Al desactivar este registro, no se podrán registrar nuevos movimientos hasta
              que se reactive. El historial y el stock actual se conservan.
            </span>
          </div>
        )}

        {/* Error de servidor */}
        {error && (
          <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
            <AlertTriangle size={13} className="text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {/* Acciones */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-300 text-zinc-600
                       hover:bg-zinc-50 disabled:opacity-40 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed
              ${willActivate
                ? "bg-emerald-700 text-white hover:bg-emerald-800"
                : "bg-zinc-900 text-white hover:bg-zinc-800"
              }`}
          >
            {isPending
              ? "Actualizando…"
              : willActivate
              ? "Confirmar activación"
              : "Confirmar desactivación"
            }
          </button>
        </div>
      </div>
    </div>
  );
}
