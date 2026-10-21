"use client";

import { useActionState } from "react";
import type { SeriesActionState } from "@/modules/classes/series-actions";
import type { SeriesConflictReason } from "@/modules/classes/scheduling/series-service";

type Action = (prev: SeriesActionState, formData: FormData) => Promise<SeriesActionState>;

const CONFLICT_LABELS: Record<SeriesConflictReason, string> = {
  NO_AVAILABILITY: "el entrenador no tiene disponibilidad ese día",
  OUTSIDE_AVAILABILITY: "fuera de la disponibilidad del entrenador",
  TRAINER_TIME_OFF: "ausencia del entrenador",
  TRAINER_OVERLAP: "el entrenador ya tiene otra clase a esa hora",
};

type Props = {
  seriesId: string;
  isActive: boolean;
  weeks: number;
  generateAction: Action;
  toggleAction: Action;
};

/** GYM-BOOKINGS 3A — generar próximas sesiones (idempotente) y activar/desactivar. */
export function ClassSeriesActionsPanel({ seriesId, isActive, weeks, generateAction, toggleAction }: Props) {
  const [genState, generate, generating] = useActionState(generateAction, undefined);
  const [toggleState, toggle, toggling] = useActionState(toggleAction, undefined);
  const report = genState?.report;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {isActive && (
          <form action={generate}>
            <input type="hidden" name="id" value={seriesId} />
            <button
              type="submit"
              disabled={generating}
              className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {generating ? "Generando..." : `Generar próximas ${weeks} semana(s)`}
            </button>
          </form>
        )}
        <form action={toggle}>
          <input type="hidden" name="id" value={seriesId} />
          <button
            type="submit"
            disabled={toggling}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-50 ${
              isActive ? "text-amber-700 border-amber-300 hover:bg-amber-50" : "text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            }`}
          >
            {isActive ? "Desactivar serie" : "Activar serie"}
          </button>
        </form>
      </div>

      {[genState, toggleState].map((s, i) =>
        s?.error ? (
          <p key={i} className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {s.error}
          </p>
        ) : s?.success ? (
          <p key={i} className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {s.success}
          </p>
        ) : null
      )}

      {report && (
        <div className="text-xs text-zinc-500 space-y-1">
          <p>
            Ventana: {report.window.from} → {report.window.to}
            {report.generatedUntil ? ` · generada hasta ${report.generatedUntil}` : ""}
          </p>
          {report.conflicts.length > 0 && (
            <ul className="list-disc pl-5 text-amber-700">
              {report.conflicts.map((c) => (
                <li key={c.date}>
                  {c.date}: {CONFLICT_LABELS[c.reason]} (no se generó)
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
