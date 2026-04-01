"use client";

import { useActionState } from "react";
import type { SettingsActionState } from "@/modules/settings/actions";

interface OperationalCodeFormProps {
  entityId: string;
  currentCode: string | null;
  suggestedCode: string;
  action: (prev: SettingsActionState, formData: FormData) => Promise<SettingsActionState>;
}

export function OperationalCodeForm({
  entityId,
  currentCode,
  suggestedCode,
  action,
}: OperationalCodeFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex items-start gap-3 flex-wrap">
      <input type="hidden" name="entity_id" value={entityId} />
      <div className="flex-1 min-w-[180px]">
        <input
          type="text"
          name="operational_code"
          defaultValue={currentCode ?? ""}
          placeholder={suggestedCode}
          maxLength={20}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono text-zinc-900 focus:border-zinc-500 focus:outline-none uppercase"
        />
        {state?.errors?.operational_code && (
          <p className="mt-1 text-xs text-red-600">{state.errors.operational_code[0]}</p>
        )}
        {state?.error && (
          <p className="mt-1 text-xs text-red-600">{state.error}</p>
        )}
        <p className="mt-1 text-xs text-zinc-400">
          Sugerido: <span className="font-mono font-semibold">{suggestedCode}</span>
          {" · "}Deja vacío para quitar el código.
        </p>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-colors whitespace-nowrap"
      >
        {pending ? "Guardando..." : "Guardar código"}
      </button>
      {!state?.errors && !state?.error && state !== undefined && (
        <span className="text-xs text-emerald-600 self-center">✓ Guardado</span>
      )}
    </form>
  );
}
