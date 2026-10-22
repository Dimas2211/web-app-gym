// GYM-5A — día PROGRAMADO del plan (solo lectura). El registro de lo ejecutado
// en cada fecha vive en <PlanExecutionReport/>; aquí no se escribe nada.
// El estado `execution_status` de esta fila es un dato HEREDADO anterior al
// seguimiento por fecha y solo se muestra como "Registro anterior".

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

const LEGACY_LABELS: Record<string, string> = {
  completed: "Completado",
  skipped: "Omitido",
  partial: "Parcial",
};

export function PlanDayCard({ day, weekdayName, isToday }: Props) {
  const legacy = LEGACY_LABELS[day.execution_status];

  return (
    <div className={`rounded-xl border border-zinc-200 bg-white p-4 ${isToday ? "ring-2 ring-blue-300 ring-offset-1" : ""}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <p className="font-semibold text-zinc-800">{weekdayName}</p>
        {isToday && <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">Hoy</span>}
        {legacy && (
          <span className="text-xs bg-zinc-100 text-zinc-500 font-medium px-2 py-0.5 rounded-full" title="Registro anterior al seguimiento por fecha">
            Registro anterior: {legacy}
          </span>
        )}
      </div>
      {day.session_name && <p className="text-sm text-zinc-700 mt-1">{day.session_name}</p>}
      {day.focus_area && <p className="text-xs text-zinc-500">{day.focus_area}</p>}
      <p className="text-xs text-zinc-400 mt-0.5">{day.duration_minutes} min</p>

      {day.exercise_block && (
        <details className="mt-3">
          <summary className="text-xs text-zinc-500 cursor-pointer select-none hover:text-zinc-700">Ver ejercicios</summary>
          <pre className="mt-2 text-xs text-zinc-600 whitespace-pre-wrap break-words font-mono bg-zinc-50 rounded p-2 border border-zinc-100">
            {day.exercise_block}
          </pre>
        </details>
      )}

      {day.trainer_feedback && (
        <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg p-2.5">
          <p className="text-xs font-semibold text-blue-700 mb-1">Nota del entrenador</p>
          <p className="text-xs text-blue-800">{day.trainer_feedback}</p>
        </div>
      )}
    </div>
  );
}
