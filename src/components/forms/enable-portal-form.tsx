"use client";

import { useActionState } from "react";
import {
  enableClientPortalAction,
  type ClientActionState,
} from "@/modules/clients/actions";

interface Props {
  clientId: string;
  defaultEmail?: string | null;
}

export function EnablePortalForm({ clientId, defaultEmail }: Props) {
  const [state, action, isPending] = useActionState<ClientActionState, FormData>(
    enableClientPortalAction,
    undefined
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="client_id" value={clientId} />

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}

      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">
          Correo de acceso al portal
        </label>
        <input
          type="email"
          name="portal_email"
          defaultValue={defaultEmail ?? ""}
          placeholder="correo@ejemplo.com"
          className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:border-transparent"
          required
        />
        {state?.errors?.portal_email && (
          <p className="text-xs text-red-500 mt-1">{state.errors.portal_email[0]}</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">
          Contraseña inicial{" "}
          <span className="text-zinc-400 font-normal">(mínimo 8 caracteres)</span>
        </label>
        <input
          type="password"
          name="portal_password"
          placeholder="••••••••"
          className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:border-transparent"
          required
        />
        {state?.errors?.portal_password && (
          <p className="text-xs text-red-500 mt-1">{state.errors.portal_password[0]}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors disabled:opacity-50"
      >
        {isPending ? "Habilitando..." : "Habilitar acceso al portal"}
      </button>
    </form>
  );
}
