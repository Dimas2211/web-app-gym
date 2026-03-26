"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ClassActionState } from "@/modules/classes/actions";

type ClientOption = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
};

type Props = {
  scheduledClassId: string;
  clients: ClientOption[];
  action: (prev: ClassActionState, formData: FormData) => Promise<ClassActionState>;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-zinc-900 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-colors shrink-0"
    >
      {pending ? "Reservando..." : "Reservar"}
    </button>
  );
}

export function BookingForm({ scheduledClassId, clients, action }: Props) {
  const [state, formAction] = useActionState(action, undefined);

  if (clients.length === 0) {
    return (
      <p className="text-sm text-zinc-400">
        No hay clientes disponibles para reservar en esta clase.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="scheduled_class_id" value={scheduledClassId} />

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {state.error}
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-zinc-600 mb-1">
            Cliente
          </label>
          <select
            name="client_id"
            className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
          >
            <option value="">— Selecciona cliente —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.first_name} {c.last_name}
                {c.email ? ` · ${c.email}` : ""}
              </option>
            ))}
          </select>
          {state?.errors?.client_id && (
            <p className="text-red-500 text-xs mt-1">{state.errors.client_id[0]}</p>
          )}
        </div>
        <SubmitButton />
      </div>
    </form>
  );
}
