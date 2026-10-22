"use client";

import { useActionState } from "react";
import type { ExecutionStatus } from "@prisma/client";
import { submitPlanDayAction } from "@/modules/client-portal/actions";

// GYM-5A — ejecuciones por fecha del alumno. Distingue lo que ÉL reportó de lo
// que registró su entrenador y de la asistencia confirmada en clases. No
// muestra notas privadas de clase ni datos de otras personas.

export type OccurrenceItemData = {
  dayId: string;
  date: string; // YYYY-MM-DD
  dateLabel: string;
  title: string;
  isToday: boolean;
  /** El alumno puede (re)enviar su reporte (ventana vigente y sin registro del entrenador). */
  reportable: boolean;
  clientStatus: ExecutionStatus | null;
  clientComment: string | null;
  trainerStatus: ExecutionStatus | null;
  trainerFeedback: string | null;
  attendanceClassTitle: string | null;
};

const LABELS: Record<ExecutionStatus, string> = {
  pending: "Pendiente",
  completed: "Completado",
  partial: "Parcial",
  skipped: "Omitido",
};

const BADGE: Record<ExecutionStatus, string> = {
  pending: "bg-blue-50 text-blue-600",
  completed: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  skipped: "bg-zinc-100 text-zinc-600",
};

function OccurrenceItem({ item }: { item: OccurrenceItemData }) {
  const [state, action, pending] = useActionState(submitPlanDayAction, undefined);

  return (
    <li className={`rounded-xl border p-3.5 bg-white ${item.isToday ? "ring-2 ring-blue-300 ring-offset-1" : "border-zinc-200"}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-800">
            {item.dateLabel}
            {item.isToday && <span className="ml-2 text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">Hoy</span>}
          </p>
          <p className="text-xs text-zinc-500 truncate">{item.title}</p>
        </div>
        {!item.clientStatus && !item.trainerStatus && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BADGE.pending}`}>{LABELS.pending}</span>
        )}
      </div>

      <div className="mt-2 space-y-1 text-xs">
        {item.clientStatus && (
          <p className="flex items-center gap-1.5 flex-wrap">
            <span className="text-zinc-400">Tú reportaste:</span>
            <span className={`px-2 py-0.5 rounded-full font-medium ${BADGE[item.clientStatus]}`}>{LABELS[item.clientStatus]}</span>
            <span className="text-zinc-400">(autorreporte, aún sin confirmar)</span>
          </p>
        )}
        {item.clientComment && <p className="text-zinc-500 italic">&ldquo;{item.clientComment}&rdquo;</p>}
        {item.trainerStatus && (
          <p className="flex items-center gap-1.5 flex-wrap">
            <span className="text-zinc-400">Tu entrenador registró:</span>
            <span className={`px-2 py-0.5 rounded-full font-medium ${BADGE[item.trainerStatus]}`}>{LABELS[item.trainerStatus]}</span>
          </p>
        )}
        {item.trainerFeedback && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5">
            <p className="font-semibold text-blue-700 mb-0.5">Nota del entrenador</p>
            <p className="text-blue-800">{item.trainerFeedback}</p>
          </div>
        )}
        {item.attendanceClassTitle && <p className="text-emerald-700 font-medium">Asistencia confirmada en clase: {item.attendanceClassTitle}</p>}
      </div>

      {item.reportable ? (
        <form action={action} className="mt-3 space-y-2">
          <input type="hidden" name="plan_day_id" value={item.dayId} />
          <input type="hidden" name="local_date" value={item.date} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" name="execution_status" value="completed" disabled={pending} className="text-xs px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
              Completé
            </button>
            <button type="submit" name="execution_status" value="partial" disabled={pending} className="text-xs px-3 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50">
              Parcial
            </button>
            <button type="submit" name="execution_status" value="skipped" disabled={pending} className="text-xs px-3 py-2 rounded-lg bg-zinc-300 text-zinc-700 hover:bg-zinc-400 transition-colors disabled:opacity-50">
              Omití
            </button>
          </div>
          <textarea
            name="client_feedback"
            maxLength={1000}
            defaultValue={item.clientComment ?? ""}
            placeholder="Comentario opcional (cómo te fue, cómo te sentiste...)"
            className="w-full text-xs rounded-lg border border-zinc-200 px-3 py-2 text-zinc-700 placeholder-zinc-400 resize-none focus:outline-none focus:ring-1 focus:ring-zinc-400"
            rows={2}
          />
          {state && "error" in state && <p className="text-xs text-red-600">{state.error}</p>}
          {state && "success" in state && <p className="text-xs text-emerald-600">Guardado correctamente.</p>}
        </form>
      ) : item.trainerStatus ? (
        <p className="mt-2 text-xs text-zinc-400">Tu entrenador ya revisó esta sesión.</p>
      ) : (
        <p className="mt-2 text-xs text-zinc-400">Ya no se puede reportar esta fecha desde la app; consulta a tu entrenador.</p>
      )}
    </li>
  );
}

export function PlanExecutionReport({ items }: { items: OccurrenceItemData[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">Todavía no hay entrenamientos vencidos en tu plan.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <OccurrenceItem key={`${it.dayId}-${it.date}`} item={it} />
      ))}
    </ul>
  );
}
