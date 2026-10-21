"use client";

import { useActionState } from "react";
import type { GymClientModality } from "@prisma/client";
import {
  changeClientModalityAction,
  type ClientModalityActionState,
} from "@/modules/clients/actions";
import { GYM_CLIENT_MODALITIES, MODALITY_LABELS } from "@/modules/memberships/modality-rules";

interface Props {
  clientId: string;
  currentModality: GymClientModality;
}

/** GYM-BOOKINGS 3A — cambio de modalidad con motivo (historial append-only). */
export function ClientModalityForm({ clientId, currentModality }: Props) {
  const [state, action, isPending] = useActionState<ClientModalityActionState, FormData>(
    changeClientModalityAction,
    undefined
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="client_id" value={clientId} />

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {state.success}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">Nueva modalidad</label>
          <select
            name="to_modality"
            defaultValue=""
            className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
            required
          >
            <option value="" disabled>
              — Selecciona —
            </option>
            {GYM_CLIENT_MODALITIES.filter((m) => m !== currentModality).map((m) => (
              <option key={m} value={m}>
                {MODALITY_LABELS[m]}
              </option>
            ))}
          </select>
          {state?.errors?.to_modality && <p className="text-xs text-red-500 mt-1">{state.errors.to_modality[0]}</p>}
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-zinc-500 mb-1">Motivo del cambio</label>
          <input
            type="text"
            name="reason"
            maxLength={500}
            placeholder="Ej. Contrató plan personalizado"
            className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            required
          />
          {state?.errors?.reason && <p className="text-xs text-red-500 mt-1">{state.errors.reason[0]}</p>}
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors disabled:opacity-50"
      >
        {isPending ? "Guardando..." : "Cambiar modalidad"}
      </button>
    </form>
  );
}
