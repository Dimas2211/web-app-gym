"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { WeeklyPlanActionState } from "@/modules/weekly-plans/actions";
import { DAY_OF_WEEK_LABELS, WEEK_DAYS_ORDER } from "@/lib/utils/labels";

type DefaultValues = {
  weekday?: number;
  session_name?: string | null;
  focus_area?: string | null;
  duration_minutes?: number;
  exercise_block?: string | null;
  trainer_notes?: string | null;
};

type Props = {
  templateId: string;
  action: (prev: WeeklyPlanActionState, formData: FormData) => Promise<WeeklyPlanActionState>;
  defaultValues?: DefaultValues;
  usedWeekdays?: number[];
  isEdit?: boolean;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-zinc-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Guardando..." : isEdit ? "Guardar cambios" : "Añadir día"}
    </button>
  );
}

const inputCls =
  "w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent";
const selectCls = inputCls + " bg-white";

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
    </div>
  );
}

export function WeeklyPlanTemplateDayForm({
  templateId,
  action,
  defaultValues,
  usedWeekdays = [],
  isEdit = false,
}: Props) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-4 max-w-2xl">
      <input type="hidden" name="template_id" value={templateId} />

      {/* Día de la semana */}
      <Field label="Día de la semana" required error={state?.errors?.weekday?.[0]}>
        <select
          name="weekday"
          required
          defaultValue={defaultValues?.weekday ?? ""}
          className={selectCls}
          disabled={isEdit}
        >
          <option value="">Seleccionar día…</option>
          {WEEK_DAYS_ORDER.map((d) => {
            const disabled = !isEdit && usedWeekdays.includes(d);
            return (
              <option key={d} value={d} disabled={disabled}>
                {DAY_OF_WEEK_LABELS[d]}
                {disabled ? " (ya configurado)" : ""}
              </option>
            );
          })}
        </select>
        {isEdit && (
          <input type="hidden" name="weekday" value={defaultValues?.weekday} />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Nombre de la sesión" error={state?.errors?.session_name?.[0]}>
          <input
            name="session_name"
            type="text"
            maxLength={100}
            defaultValue={defaultValues?.session_name ?? ""}
            className={inputCls}
          />
        </Field>
        <Field label="Área de enfoque" error={state?.errors?.focus_area?.[0]}>
          <input
            name="focus_area"
            type="text"
            maxLength={200}
            defaultValue={defaultValues?.focus_area ?? ""}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Duración (minutos)" required error={state?.errors?.duration_minutes?.[0]}>
        <input
          name="duration_minutes"
          type="number"
          min={1}
          required
          defaultValue={defaultValues?.duration_minutes ?? 60}
          className={inputCls}
        />
      </Field>

      <Field label="Bloque de ejercicios" error={state?.errors?.exercise_block?.[0]}>
        <textarea
          name="exercise_block"
          rows={5}
          placeholder="Describe los ejercicios, series, repeticiones..."
          defaultValue={defaultValues?.exercise_block ?? ""}
          className={inputCls + " resize-y font-mono text-xs"}
        />
      </Field>

      <Field label="Notas para el entrenador" error={state?.errors?.trainer_notes?.[0]}>
        <textarea
          name="trainer_notes"
          rows={2}
          defaultValue={defaultValues?.trainer_notes ?? ""}
          className={inputCls + " resize-none"}
        />
      </Field>

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <SubmitButton isEdit={isEdit} />
        <a
          href={`/dashboard/weekly-plans/templates/${templateId}`}
          className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
