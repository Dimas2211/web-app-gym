"use client";

import { useActionState } from "react";
import { submitPlanDayAction } from "@/modules/client-portal/actions";

type PlanDay = {
  id: string;
  weekday: number;
  session_name: string | null;
  focus_area: string | null;
  duration_minutes: number;
  exercise_block: string | null;
  execution_status: string;
  trainer_feedback: string | null;
  client_feedback: string | null;
};

type Props = {
  day: PlanDay;
  weekdayName: string;
  isToday: boolean;
};

const STATUS_CLASSES: Record<string, string> = {
  completed: "bg-emerald-50 border-emerald-200",
  skipped: "bg-zinc-50 border-zinc-200",
  partial: "bg-amber-50 border-amber-200",
  pending: "bg-white border-zinc-200",
};

const STATUS_LABELS: Record<string, string> = {
  completed: "Completado",
  skipped: "Omitido",
  partial: "Parcial",
  pending: "Pendiente",
};

export function PlanDayCard({ day, weekdayName, isToday }: Props) {
  const [state, action, pending] = useActionState(submitPlanDayAction, undefined);
  const isDone = day.execution_status !== "pending";

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${STATUS_CLASSES[day.execution_status]} ${
        isToday ? "ring-2 ring-blue-300 ring-offset-1" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-zinc-800">
              {weekdayName}
              {isToday && (
                <span className="ml-2 text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">
                  Hoy
                </span>
              )}
            </p>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                day.execution_status === "completed"
                  ? "bg-emerald-100 text-emerald-700"
                  : day.execution_status === "skipped"
                  ? "bg-zinc-100 text-zinc-500"
                  : day.execution_status === "partial"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-blue-50 text-blue-600"
              }`}
            >
              {STATUS_LABELS[day.execution_status]}
            </span>
          </div>
          {day.session_name && (
            <p className="text-sm text-zinc-700 mt-1">{day.session_name}</p>
          )}
          {day.focus_area && (
            <p className="text-xs text-zinc-500">{day.focus_area}</p>
          )}
          <p className="text-xs text-zinc-400 mt-0.5">{day.duration_minutes} min</p>
        </div>
      </div>

      {/* Bloque de ejercicios */}
      {day.exercise_block && (
        <details className="mt-3">
          <summary className="text-xs text-zinc-500 cursor-pointer select-none hover:text-zinc-700">
            Ver ejercicios
          </summary>
          <pre className="mt-2 text-xs text-zinc-600 whitespace-pre-wrap font-mono bg-zinc-50 rounded p-2 border border-zinc-100">
            {day.exercise_block}
          </pre>
        </details>
      )}

      {/* Feedback del entrenador */}
      {day.trainer_feedback && (
        <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg p-2.5">
          <p className="text-xs font-semibold text-blue-700 mb-1">Nota del entrenador</p>
          <p className="text-xs text-blue-800">{day.trainer_feedback}</p>
        </div>
      )}

      {/* Feedback del cliente existente */}
      {day.client_feedback && isDone && (
        <p className="mt-2 text-xs text-zinc-500 italic">&ldquo;{day.client_feedback}&rdquo;</p>
      )}

      {/* Error del action */}
      {"error" in (state ?? {}) && (
        <p className="mt-2 text-xs text-red-600">{(state as { error: string }).error}</p>
      )}
      {"success" in (state ?? {}) && (
        <p className="mt-2 text-xs text-emerald-600">Actualizado correctamente.</p>
      )}

      {/* Formulario de registro */}
      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="plan_day_id" value={day.id} />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="execution_status"
            value="completed"
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            Completé
          </button>
          <button
            type="submit"
            name="execution_status"
            value="partial"
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            Parcial
          </button>
          <button
            type="submit"
            name="execution_status"
            value="skipped"
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-lg bg-zinc-300 text-zinc-700 hover:bg-zinc-400 transition-colors disabled:opacity-50"
          >
            Omití
          </button>
        </div>
        <textarea
          name="client_feedback"
          placeholder="Comentario opcional (cómo te fue, cómo te sentiste...)"
          defaultValue={day.client_feedback ?? ""}
          className="w-full text-xs rounded-lg border border-zinc-200 px-3 py-2 text-zinc-700 placeholder-zinc-400 resize-none focus:outline-none focus:ring-1 focus:ring-zinc-400"
          rows={2}
        />
      </form>
    </div>
  );
}
