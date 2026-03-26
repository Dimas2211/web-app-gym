"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ExecutionStatus } from "@prisma/client";
import type { WeeklyPlanActionState } from "@/modules/weekly-plans/actions";
import { EXECUTION_STATUS_LABELS } from "@/lib/utils/labels";

type DefaultValues = {
  session_name?: string | null;
  focus_area?: string | null;
  duration_minutes?: number;
  exercise_block?: string | null;
  trainer_feedback?: string | null;
  client_feedback?: string | null;
};

type Props = {
  dayId: string;
  planId: string;
  action: (prev: WeeklyPlanActionState, formData: FormData) => Promise<WeeklyPlanActionState>;
  defaultValues?: DefaultValues;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-zinc-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Guardando..." : "Guardar cambios"}
    </button>
  );
}

const inputCls =
  "w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent";

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

export function ClientWeeklyPlanDayForm({ dayId, planId, action, defaultValues }: Props) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-4 max-w-2xl">
      <input type="hidden" name="day_id" value={dayId} />
      <input type="hidden" name="plan_id" value={planId} />

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

      <Field label="Feedback del entrenador" error={state?.errors?.trainer_feedback?.[0]}>
        <textarea
          name="trainer_feedback"
          rows={2}
          defaultValue={defaultValues?.trainer_feedback ?? ""}
          className={inputCls + " resize-none"}
        />
      </Field>

      <Field label="Feedback del cliente" error={state?.errors?.client_feedback?.[0]}>
        <textarea
          name="client_feedback"
          rows={2}
          defaultValue={defaultValues?.client_feedback ?? ""}
          className={inputCls + " resize-none"}
        />
      </Field>

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

// ── Formulario de marcación de cumplimiento ──────────────────

type MarkDayProps = {
  dayId: string;
  planId: string;
  currentStatus: ExecutionStatus;
  markAction: (formData: FormData) => Promise<void>;
};

export function MarkDayForm({ dayId, planId, currentStatus, markAction }: MarkDayProps) {
  return (
    <form action={markAction} className="flex items-center gap-2 flex-wrap">
      <input type="hidden" name="day_id" value={dayId} />
      <input type="hidden" name="plan_id" value={planId} />
      {(["completed", "partial", "skipped", "pending"] as ExecutionStatus[]).map((s) => (
        <button
          key={s}
          type="submit"
          name="execution_status"
          value={s}
          className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
            currentStatus === s
              ? "bg-zinc-900 text-white border-zinc-900"
              : "border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900"
          }`}
        >
          {EXECUTION_STATUS_LABELS[s]}
        </button>
      ))}
    </form>
  );
}
