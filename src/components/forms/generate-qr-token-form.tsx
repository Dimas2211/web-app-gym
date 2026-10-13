"use client";

import { useActionState } from "react";
import type { SettingsActionState } from "@/modules/settings/actions";

interface GenerateQrTokenFormProps {
  entityId: string;
  action: (prev: SettingsActionState, formData: FormData) => Promise<SettingsActionState>;
}

/** Genera el token QR de un registro legacy sin token. Nunca regenera uno existente. */
export function GenerateQrTokenForm({ entityId, action }: GenerateQrTokenFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="entity_id" value={entityId} />
      <p className="text-xs text-amber-600">Este cliente aún no tiene token QR.</p>
      <button
        type="submit"
        disabled={pending}
        className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-colors"
      >
        {pending ? "Generando..." : "Generar token QR"}
      </button>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
