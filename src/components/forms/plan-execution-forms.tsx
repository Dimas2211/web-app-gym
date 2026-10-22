"use client";

import { useActionState } from "react";
import type { ExecutionStatus } from "@prisma/client";
import { recordPlanExecutionAction } from "@/modules/weekly-plans/actions";
import { EXECUTION_STATUS_COLORS, EXECUTION_STATUS_LABELS } from "@/lib/utils/labels";

// GYM-5A — fila de seguimiento por fecha (vista del entrenador/administración).
// Distingue tres fuentes: autorreporte del alumno, registro del entrenador y
// asistencia confirmada en GYM-4 (vínculo explícito). Nunca muestra notas
// privadas de clase.

export type ExecutionRowData = {
  planId: string;
  dayId: string;
  date: string; // YYYY-MM-DD
  dateLabel: string;
  title: string;
  execution: {
    revision: number;
    clientStatus: ExecutionStatus | null;
    clientComment: string | null;
    trainerStatus: ExecutionStatus | null;
    trainerFeedback: string | null;
    attendance: { attendanceId: string; stillValid: boolean; classTitle: string } | null;
  } | null;
  /** Asistencias confirmadas de esa fecha aún sin vincular (solo con gym.classes habilitado). */
  linkable: { attendanceId: string; title: string }[];
  canRecord: boolean;
};

const STATUSES: ExecutionStatus[] = ["completed", "partial", "skipped"];

function Badge({ status }: { status: ExecutionStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${EXECUTION_STATUS_COLORS[status]}`}>
      {EXECUTION_STATUS_LABELS[status]}
    </span>
  );
}

export function ExecutionRow({ row }: { row: ExecutionRowData }) {
  const [state, action, pending] = useActionState(recordPlanExecutionAction, undefined);
  const ex = row.execution;
  const reviewed = ex?.trainerStatus != null;

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-800">{row.dateLabel}</p>
          <p className="text-xs text-zinc-500 truncate">{row.title}</p>
        </div>
        {!ex && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500">Pendiente</span>}
      </div>

      {ex && (
        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <dt className="text-zinc-400">Alumno (autorreporte):</dt>
            <dd>{ex.clientStatus ? <Badge status={ex.clientStatus} /> : <span className="text-zinc-400">—</span>}</dd>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <dt className="text-zinc-400">Entrenador:</dt>
            <dd>{ex.trainerStatus ? <Badge status={ex.trainerStatus} /> : <span className="text-zinc-400">Sin registrar</span>}</dd>
          </div>
          {ex.clientComment && (
            <div className="sm:col-span-2 text-zinc-600">
              <span className="text-zinc-400">Comentario del alumno: </span>
              {ex.clientComment}
            </div>
          )}
          {ex.trainerFeedback && (
            <div className="sm:col-span-2 text-zinc-600">
              <span className="text-zinc-400">Retroalimentación: </span>
              {ex.trainerFeedback}
            </div>
          )}
          <div className="sm:col-span-2">
            {ex.attendance ? (
              <span className={`text-xs font-medium ${ex.attendance.stillValid ? "text-emerald-700" : "text-amber-700"}`}>
                {ex.attendance.stillValid ? "Asistencia confirmada" : "Vínculo desactualizado (la asistencia cambió)"}: {ex.attendance.classTitle}
              </span>
            ) : (
              <span className="text-zinc-400">Sin asistencia vinculada</span>
            )}
          </div>
        </dl>
      )}

      {row.canRecord && (
        <details className="mt-2">
          <summary className="text-xs text-zinc-600 cursor-pointer select-none hover:text-zinc-900">
            {ex?.trainerStatus ? "Corregir registro" : "Registrar entrenamiento"}
          </summary>
          <form action={action} className="mt-2 space-y-2">
            <input type="hidden" name="plan_id" value={row.planId} />
            <input type="hidden" name="day_id" value={row.dayId} />
            <input type="hidden" name="local_date" value={row.date} />
            <input type="hidden" name="expected_revision" value={ex?.revision ?? 0} />
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="submit"
                  name="execution_status"
                  value={s}
                  disabled={pending}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors disabled:opacity-50 ${
                    ex?.trainerStatus === s
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "border-zinc-300 text-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  {EXECUTION_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            <textarea
              name="trainer_feedback"
              rows={2}
              maxLength={1000}
              defaultValue={ex?.trainerFeedback ?? ""}
              placeholder="Retroalimentación para el alumno (visible para él)"
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
            {reviewed && (
              <input
                name="reason"
                type="text"
                maxLength={500}
                placeholder="Motivo si cambias el estado ya registrado"
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
            )}
            {(row.linkable.length > 0 || ex?.attendance) && (
              <div className="space-y-1">
                <label className="block text-xs text-zinc-500">Vincular asistencia de clase (opcional)</label>
                <select name="attendance_id" defaultValue="" className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-xs bg-white">
                  <option value="">{ex?.attendance ? "Mantener vínculo actual" : "Sin vincular"}</option>
                  {row.linkable.map((a) => (
                    <option key={a.attendanceId} value={a.attendanceId}>
                      {a.title}
                    </option>
                  ))}
                </select>
                {ex?.attendance && (
                  <label className="flex items-center gap-2 text-xs text-zinc-600">
                    <input type="checkbox" name="unlink_attendance" value="1" /> Quitar vínculo con la asistencia
                  </label>
                )}
              </div>
            )}
            {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
            {state?.errors && <p className="text-xs text-red-600">{Object.values(state.errors).flat()[0]}</p>}
            {state?.ok && <p className="text-xs text-emerald-600">{state.unchanged ? "Sin cambios." : "Registro guardado."}</p>}
          </form>
        </details>
      )}
    </li>
  );
}
