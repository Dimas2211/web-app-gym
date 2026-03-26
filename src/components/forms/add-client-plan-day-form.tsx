"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { WeeklyPlanActionState } from "@/modules/weekly-plans/actions";

const DAY_LABELS: Record<number, string> = {
  0: "Domingo", 1: "Lunes", 2: "Martes", 3: "Miércoles",
  4: "Jueves", 5: "Viernes", 6: "Sábado",
};
const ORDER = [1, 2, 3, 4, 5, 6, 0];

type Props = {
  planId: string;
  usedWeekdays: number[];
  action: (prev: WeeklyPlanActionState, formData: FormData) => Promise<WeeklyPlanActionState>;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-zinc-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Guardando..." : "Añadir día"}
    </button>
  );
}

const inputCls =
  "w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent";

export function AddClientPlanDayForm({ planId, usedWeekdays, action }: Props) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-4 max-w-2xl">
      <input type="hidden" name="plan_id" value={planId} />

      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1.5">
          Día de la semana <span className="text-red-500">*</span>
        </label>
        <select name="weekday" required className={inputCls + " bg-white"}>
          <option value="">Seleccionar día…</option>
          {ORDER.map((d) => {
            const disabled = usedWeekdays.includes(d);
            return (
              <option key={d} value={d} disabled={disabled}>
                {DAY_LABELS[d]}
                {disabled ? " (ya configurado)" : ""}
              </option>
            );
          })}
        </select>
        {state?.errors?.weekday?.[0] && (
          <p className="text-red-600 text-xs mt-1">{state.errors.weekday[0]}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">
            Nombre de la sesión
          </label>
          <input name="session_name" type="text" maxLength={100} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">
            Área de enfoque
          </label>
          <input name="focus_area" type="text" maxLength={200} className={inputCls} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1.5">
          Duración (minutos) <span className="text-red-500">*</span>
        </label>
        <input
          name="duration_minutes"
          type="number"
          min={1}
          required
          defaultValue={60}
          className={inputCls}
        />
        {state?.errors?.duration_minutes?.[0] && (
          <p className="text-red-600 text-xs mt-1">{state.errors.duration_minutes[0]}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1.5">
          Bloque de ejercicios
        </label>
        <textarea
          name="exercise_block"
          rows={5}
          placeholder="Describe los ejercicios, series, repeticiones..."
          className={inputCls + " resize-y font-mono text-xs"}
        />
      </div>

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <SubmitButton />
        <a
          href={`/dashboard/weekly-plans/client-plans/${planId}`}
          className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
