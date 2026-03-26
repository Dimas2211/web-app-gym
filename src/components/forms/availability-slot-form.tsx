"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { TrainerActionState } from "@/modules/trainers/actions";

type Props = {
  trainerId: string;
  action: (prev: TrainerActionState, formData: FormData) => Promise<TrainerActionState>;
};

const DAY_OPTIONS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-red-500 text-xs mt-1">{errors[0]}</p>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-zinc-900 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-colors shrink-0"
    >
      {pending ? "Guardando..." : "Agregar bloque"}
    </button>
  );
}

export function AvailabilitySlotForm({ trainerId, action }: Props) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="trainer_id" value={trainerId} />

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {state.error}
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">Día</label>
          <select
            name="day_of_week"
            className="border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
          >
            {DAY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <FieldError errors={state?.errors?.day_of_week} />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">Hora inicio</label>
          <input
            type="time"
            name="start_time"
            className="border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <FieldError errors={state?.errors?.start_time} />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">Hora fin</label>
          <input
            type="time"
            name="end_time"
            className="border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <FieldError errors={state?.errors?.end_time} />
        </div>

        <SubmitButton />
      </div>

      <p className="text-xs text-zinc-400">
        Los bloques del mismo día no pueden solaparse.
      </p>
    </form>
  );
}
