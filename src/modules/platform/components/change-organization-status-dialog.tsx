"use client";

// ─────────────────────────────────────────────────────────────────
// platform — change-organization-status-dialog.tsx
//
// Diálogo para cambiar el status de una PlatformOrganization.
// ─────────────────────────────────────────────────────────────────

import { useActionState } from "react";
import { X }             from "lucide-react";

import { changeOrganizationStatusAction } from "../actions/change-organization-status.action";
import type { PlatformOrganizationStatus } from "../types/platform.types";

interface Props {
  orgId:          string;
  currentStatus:  PlatformOrganizationStatus;
  orgName:        string;
  onClose:        () => void;
}

const STATUS_LABELS: Record<PlatformOrganizationStatus, string> = {
  PENDING:   "Pendiente",
  ACTIVE:    "Activa",
  SUSPENDED: "Suspendida",
  CANCELLED: "Cancelada",
};

export function ChangeOrganizationStatusDialog({
  orgId,
  currentStatus,
  orgName,
  onClose,
}: Props) {
  const [state, formAction, isPending] = useActionState(
    changeOrganizationStatusAction,
    undefined,
  );

  const otherStatuses = (["PENDING", "ACTIVE", "SUSPENDED", "CANCELLED"] as PlatformOrganizationStatus[])
    .filter((s) => s !== currentStatus);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-100">
          <h2 className="text-base font-bold text-zinc-800">Cambiar estado</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form action={formAction} className="p-5 space-y-4">
          <input type="hidden" name="id" value={orgId} />

          {state?.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
              {state.error}
            </div>
          )}

          <div className="bg-zinc-50 rounded-lg px-4 py-3 text-sm text-zinc-600">
            <span className="font-medium">{orgName}</span> — estado actual:{" "}
            <span className="font-semibold">{STATUS_LABELS[currentStatus]}</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              Nuevo estado <span className="text-red-500">*</span>
            </label>
            <select
              name="status"
              required
              className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
            >
              <option value="">— Seleccionar —</option>
              {otherStatuses.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            {state?.errors?.status && (
              <p className="text-xs text-red-600 mt-0.5">{state.errors.status[0]}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              Motivo (opcional)
            </label>
            <textarea
              name="reason"
              rows={2}
              placeholder="Razón del cambio de estado…"
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
            />
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
              {isPending ? "Guardando…" : "Cambiar estado"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
