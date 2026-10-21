// GYM-4 — "Mi agenda" del entrenador dentro de /dashboard/classes.
// Sesiones del Trainer vinculado (tres modalidades), por fecha local del
// gimnasio: hoy, próximas y anteriores. Solo lectura; la operación vive en el
// detalle de cada sesión.

import Link from "next/link";
import { CLASS_STATUS_COLORS, CLASS_STATUS_LABELS } from "@/lib/utils/labels";
import { SESSION_KIND_LABELS } from "@/modules/classes/scheduling/scheduling-rules";
import {
  TRAINER_AGENDA_LIMITS,
  type TrainerAgenda,
  type TrainerAgendaSession,
} from "@/modules/classes/trainer/trainer-queries";

export type TrainerAgendaTab = "today" | "upcoming" | "past";

const TABS: { key: TrainerAgendaTab; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "upcoming", label: "Próximas" },
  { key: "past", label: "Anteriores" },
];

const KIND_BADGE = {
  OPEN: "bg-sky-100 text-sky-800",
  PERSONALIZED: "bg-violet-100 text-violet-700",
  GROUP: "bg-teal-100 text-teal-800",
} as const;

/** class_date es DATE (medianoche UTC): se formatea en UTC para no correr el día. */
export function formatDay(d: Date) {
  const s = d.toLocaleDateString("es-MX", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function SessionCard({ s }: { s: TrainerAgendaSession }) {
  const free = Math.max(s.capacity - s.booked_count, 0);
  const pct = s.capacity > 0 ? Math.min(Math.round((s.booked_count / s.capacity) * 100), 100) : 0;
  return (
    <Link
      href={`/dashboard/classes/${s.id}`}
      className="block bg-white rounded-xl border border-zinc-200 shadow-sm p-4 hover:border-zinc-400 transition-colors min-w-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold text-zinc-800">
            {s.start_time} – {s.end_time}
          </p>
          <p className="text-sm font-semibold text-zinc-800 break-words">{s.title}</p>
          <p className="text-xs text-zinc-500 mt-0.5 break-words">
            {s.class_type.name} · {s.branch.name}
            {s.room_name ? ` · ${s.room_name}` : ""}
          </p>
        </div>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${CLASS_STATUS_COLORS[s.status]}`}>
          {CLASS_STATUS_LABELS[s.status]}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-3">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${KIND_BADGE[s.session_kind]}`}>
          {SESSION_KIND_LABELS[s.session_kind]}
        </span>
        <span className="text-xs text-zinc-500">
          Reservas {s.booked_count}/{s.capacity}
          {s.status !== "cancelled" ? ` · ${free} libres` : ""}
        </span>
        <span className="text-xs text-zinc-500">· Asistencia {s._count.attendance}</span>
      </div>
      <div className="mt-2 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 75 ? "bg-amber-400" : "bg-emerald-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  );
}

function GroupedList({ sessions, empty }: { sessions: TrainerAgendaSession[]; empty: string }) {
  if (sessions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-10 text-center">
        <p className="text-zinc-400 text-sm">{empty}</p>
      </div>
    );
  }
  const groups = new Map<string, TrainerAgendaSession[]>();
  for (const s of sessions) {
    const k = dayKey(s.class_date);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }
  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([k, list]) => (
        <div key={k} className="space-y-3">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{formatDay(list[0].class_date)}</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
            {list.map((s) => (
              <SessionCard key={s.id} s={s} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TrainerAgendaView({
  agenda,
  tab,
  trainerName,
}: {
  agenda: TrainerAgenda;
  tab: TrainerAgendaTab;
  trainerName: string;
}) {
  const todayDate = new Date(`${agenda.today}T00:00:00.000Z`);
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-zinc-800">Mi agenda</h1>
          <p className="text-sm text-zinc-500 mt-0.5 break-words">
            {trainerName} · {formatDay(todayDate)}
          </p>
        </div>
        <nav className="flex rounded-lg border border-zinc-300 overflow-hidden text-sm" aria-label="Periodo">
          {TABS.map((t, i) => (
            <Link
              key={t.key}
              href={t.key === "today" ? "/dashboard/classes" : `/dashboard/classes?tab=${t.key}`}
              aria-current={tab === t.key ? "page" : undefined}
              className={`px-3 py-1.5 transition-colors ${i > 0 ? "border-l border-zinc-300" : ""} ${
                tab === t.key ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {t.label}
              {t.key === "today" ? ` · ${agenda.todaySessions.length}` : ""}
            </Link>
          ))}
        </nav>
      </div>

      {tab === "today" && <GroupedList sessions={agenda.todaySessions} empty="No tienes clases asignadas para hoy." />}
      {tab === "upcoming" && (
        <>
          <GroupedList sessions={agenda.upcoming} empty="No tienes clases próximas asignadas." />
          {agenda.upcoming.length >= TRAINER_AGENDA_LIMITS.upcoming && (
            <p className="text-xs text-zinc-400">Se muestran las próximas {TRAINER_AGENDA_LIMITS.upcoming} clases.</p>
          )}
        </>
      )}
      {tab === "past" && (
        <>
          <GroupedList sessions={agenda.past} empty="Aún no tienes clases anteriores." />
          {agenda.past.length >= TRAINER_AGENDA_LIMITS.past && (
            <p className="text-xs text-zinc-400">Se muestran las últimas {TRAINER_AGENDA_LIMITS.past} clases.</p>
          )}
        </>
      )}
    </div>
  );
}

export function TrainerNoticeView({ title, message }: { title: string; message: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-zinc-800">{title}</h1>
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-10 text-center">
        <p className="text-zinc-500 text-sm">{message}</p>
      </div>
    </div>
  );
}
