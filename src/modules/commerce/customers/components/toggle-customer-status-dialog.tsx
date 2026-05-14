"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/customers — toggle-customer-status-dialog.tsx
//
// Diálogo de confirmación para activar o desactivar un cliente.
// Reutiliza updateCustomerAction con el campo status.
// ─────────────────────────────────────────────────────────────────

import { useTransition, useState } from "react";
import { X } from "lucide-react";
import { updateCustomerAction } from "../actions/update-customer.action";
import type { CustomerListItem } from "../types/customer.types";

interface ToggleCustomerStatusDialogProps {
  customer:   CustomerListItem;
  onClose:    () => void;
  onSuccess?: () => void;
}

export function ToggleCustomerStatusDialog({
  customer,
  onClose,
  onSuccess,
}: ToggleCustomerStatusDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);

  const isActive   = customer.status === "active";
  const nextStatus = isActive ? "inactive" : "active";
  const actionLabel = isActive ? "Desactivar" : "Activar";

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await updateCustomerAction(customer.id, { status: nextStatus });
      if (result.ok) {
        onSuccess?.();
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={handleBackdrop}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-100">
          <h2 className="text-base font-semibold text-zinc-900">{actionLabel} cliente</h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {/* Contenido */}
        <div className="px-5 py-4">
          {error && (
            <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <p className="text-sm text-zinc-600">
            {isActive
              ? <>¿Confirmas desactivar al cliente <strong>{customer.name}</strong>? No podrá usarse en nuevas ventas.</>
              : <>¿Confirmas activar al cliente <strong>{customer.name}</strong>?</>
            }
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            Código: <span className="font-mono">{customer.customer_code}</span>
          </p>
        </div>

        {/* Pie */}
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            type="button" onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-300 text-zinc-600
                       hover:bg-zinc-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed
              ${isActive
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
          >
            {isPending ? "Guardando…" : actionLabel}
          </button>
        </div>

      </div>
    </div>
  );
}
