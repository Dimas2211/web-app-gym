// GYM-4 — detalle de una sesión para su entrenador: datos de la sesión,
// alumnos con reserva confirmada, asistencia, actividades y notas privadas.
// Sin formularios administrativos (editar clase, reservar, cancelar).

import Link from "next/link";
import { CLASS_STATUS_COLORS, CLASS_STATUS_LABELS } from "@/lib/utils/labels";
import { SESSION_KIND_LABELS } from "@/modules/classes/scheduling/scheduling-rules";
import type { SessionTrainingDetail } from "@/modules/classes/trainer/trainer-queries";
import { SessionTrainingPanel, WindowBanner, type TrainingWindow } from "./session-training-panel";
import { formatDay } from "./trainer-agenda";

export function FlashMessages({ error, notice }: { error?: string; notice?: string }) {
  return (
    <>
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg break-words">
          {error}
        </div>
      )}
      {notice && !error && (
        <div role="status" className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 rounded-lg break-words">
          {notice}
        </div>
      )}
    </>
  );
}

export function TrainerSessionView({
  detail,
  win,
  error,
  notice,
}: {
  detail: SessionTrainingDetail;
  win: TrainingWindow;
  error?: string;
  notice?: string;
}) {
  const { session, policy } = detail;
  const free = Math.max(session.capacity - session.booked_count, 0);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-zinc-500 min-w-0">
        <Link href="/dashboard/classes" className="hover:text-zinc-800 transition-colors shrink-0">
          Mi agenda
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium truncate">{session.title}</span>
      </div>

      <FlashMessages error={error} notice={notice} />

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 sm:p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${CLASS_STATUS_COLORS[session.status]}`}>
                {CLASS_STATUS_LABELS[session.status]}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 font-medium">
                {SESSION_KIND_LABELS[session.session_kind]}
              </span>
            </div>
            <h1 className="text-xl font-bold text-zinc-800 break-words">{session.title}</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{session.class_type.name}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-2xl font-bold text-zinc-800">
              {session.start_time} – {session.end_time}
            </p>
            <p className="text-sm text-zinc-500 mt-0.5">{formatDay(session.class_date)}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
          <div>
            <dt className="text-xs text-zinc-400">Sucursal</dt>
            <dd className="font-medium text-zinc-800 break-words">{session.branch.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">Sala</dt>
            <dd className="font-medium text-zinc-800 break-words">{session.room_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">Reservas</dt>
            <dd className="font-medium text-zinc-800">
              {session.booked_count}/{session.capacity}
              {session.status !== "cancelled" ? <span className="text-zinc-400 font-normal"> · {free} libres</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">Asistencia registrada</dt>
            <dd className="font-medium text-zinc-800">{session.attendance.length}</dd>
          </div>
        </dl>
      </div>

      <WindowBanner win={win} timeZone={policy.timezone} />

      <SessionTrainingPanel detail={detail} win={win} showAttendanceControls includePrivateNotes />
    </div>
  );
}
