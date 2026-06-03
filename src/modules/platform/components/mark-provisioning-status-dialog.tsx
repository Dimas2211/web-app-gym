"use client";

// ─────────────────────────────────────────────────────────────────
// platform — mark-provisioning-status-dialog.tsx
//
// Diálogo para marcar manualmente el estado de provisioning.
// ─────────────────────────────────────────────────────────────────

import { useActionState } from "react";
import { X } from "lucide-react";
import { markProvisioningStatusAction } from "../actions/mark-provisioning-status.action";
import type { PlatformProvisioningStatus } from "../types/platform.types";

const STATUS_OPTIONS: { value: PlatformProvisioningStatus; label: string }[] = [
  { value: "NOT_READY",   label: "No listo" },
  { value: "READY",       label: "Listo" },
  { value: "PROVISIONED", label: "Provisionado" },
  { value: "DEPLOYED",    label: "Desplegado" },
  { value: "FAILED",      label: "Fallido" },
];

interface Props {
  organizationId:       string;
  organizationName:     string;
  currentStatus:        PlatformProvisioningStatus;
  onClose:              () => void;
}

export function MarkProvisioningStatusDialog({
  organizationId,
  organizationName,
  currentStatus,
  onClose,
}: Props) {
  const [state, formAction, isPending] = useActionState(markProvisioningStatusAction, undefined);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-zinc-200 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <h2 className="text-sm font-semibold text-zinc-800">Cambiar estado de provisioning</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form action={formAction} className="p-5 space-y-4">
          <input type="hidden" name="organization_id" value={organizationId} />

          <p className="text-sm text-zinc-600">
            Organización: <strong className="text-zinc-800">{organizationName}</strong>
          </p>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1.5">
              Nuevo estado
            </label>
            <select
              name="status"
              defaultValue={currentStatus}
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {state?.errors?.status && (
              <p className="text-xs text-red-500 mt-1">{state.errors.status[0]}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1.5">
              Notas (opcional)
            </label>
            <textarea
              name="notes"
              rows={3}
              placeholder="Observaciones sobre el cambio de estado..."
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-300 resize-none"
            />
          </div>

          {state?.error && (
            <p className="text-xs text-red-500">{state.error}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-semibold text-zinc-500 hover:text-zinc-800 px-4 py-2 rounded-lg border border-zinc-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="text-sm font-semibold bg-zinc-800 hover:bg-zinc-900 disabled:bg-zinc-400 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {isPending ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
