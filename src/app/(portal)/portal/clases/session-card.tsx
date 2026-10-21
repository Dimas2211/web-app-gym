import { randomUUID } from "node:crypto";
import type { PortalSessionView } from "@/modules/client-portal/queries";
import {
  CANCELLATION_TYPE_LABELS,
  PORTAL_STATE_LABELS,
  SESSION_KIND_LABELS,
  type PortalSessionState,
} from "@/modules/client-portal/portal-schedule";
import { BookClassButton } from "./book-class-button";

// GYM-BOOKINGS 3B — tarjeta de sesión del portal (server component).
// Solo presenta la evaluación ya calculada en el servidor; nunca muestra
// códigos técnicos ni datos de otros alumnos (solo booked_count/capacity).

export const STATE_BADGE: Record<PortalSessionState, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-700",
  FULL: "bg-zinc-200 text-zinc-600",
  BOOKED: "bg-blue-100 text-blue-700",
  NOT_ELIGIBLE: "bg-amber-100 text-amber-700",
  CANCELLED: "bg-red-100 text-red-600",
  FINISHED: "bg-zinc-100 text-zinc-500",
};

const KIND_BADGE: Record<PortalSessionView["kind"], string> = {
  OPEN: "bg-sky-50 text-sky-700 border-sky-200",
  PERSONALIZED: "bg-violet-50 text-violet-700 border-violet-200",
  GROUP: "bg-teal-50 text-teal-700 border-teal-200",
};

export function StateBadge({ state }: { state: PortalSessionState }) {
  return (
    <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATE_BADGE[state]}`}>
      {PORTAL_STATE_LABELS[state]}
    </span>
  );
}

export function KindBadge({ kind }: { kind: PortalSessionView["kind"] }) {
  return (
    <span className={`inline-block text-[11px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap ${KIND_BADGE[kind]}`}>
      {SESSION_KIND_LABELS[kind]}
    </span>
  );
}

/** "Completo — 8/8" o "3/8 lugares ocupados" (contadores consolidados; sin lista de participantes). */
export function capacityLabel(s: Pick<PortalSessionView, "booked" | "capacity">): string {
  if (s.booked >= s.capacity) return `Completo — ${s.booked}/${s.capacity}`;
  const free = s.capacity - s.booked;
  return `${free} ${free === 1 ? "lugar disponible" : "lugares disponibles"} · ${s.booked}/${s.capacity}`;
}

function SessionActions({ session }: { session: PortalSessionView }) {
  const { evaluation } = session;
  if (!evaluation.canBook && !evaluation.canCancel) return null;
  return (
    <BookClassButton
      key={session.id}
      classId={session.id}
      bookKey={randomUUID()}
      cancelKey={randomUUID()}
      bookingId={session.ownBookingId}
      canBook={evaluation.canBook}
      canCancel={evaluation.canCancel}
      isReactivation={evaluation.isReactivation}
      cancelWarning={evaluation.cancelWarning}
    />
  );
}

function Notes({ session }: { session: PortalSessionView }) {
  const { evaluation, ownCancellation } = session;
  const showBlock = evaluation.block && evaluation.state !== "FULL";
  return (
    <>
      {ownCancellation && evaluation.state !== "BOOKED" && (
        <p className="text-[11px] text-zinc-500 mt-1">Tu reserva: {CANCELLATION_TYPE_LABELS[ownCancellation]}</p>
      )}
      {showBlock && (
        <p className={`text-[11px] mt-1 ${evaluation.state === "BOOKED" ? "text-zinc-500" : "text-amber-700"}`}>
          {evaluation.block!.message}
        </p>
      )}
    </>
  );
}

/** Variante compacta para la columna de un día en la vista semanal. */
export function SessionTile({ session, isToday }: { session: PortalSessionView; isToday: boolean }) {
  const { evaluation } = session;
  const muted = evaluation.state === "CANCELLED" || evaluation.state === "FINISHED";
  return (
    <div
      className={`rounded-lg border p-2.5 space-y-1 ${
        evaluation.state === "BOOKED" ? "border-blue-300 bg-blue-50/40" : isToday ? "border-zinc-300 bg-white" : "border-zinc-200 bg-white"
      } ${muted ? "opacity-70" : ""}`}
    >
      <div className="flex items-center justify-between gap-1">
        <p className="text-xs font-bold text-zinc-800">
          {session.start}
          <span className="font-normal text-zinc-400"> – {session.end}</span>
        </p>
        <StateBadge state={evaluation.state} />
      </div>
      <p className={`text-sm font-medium text-zinc-800 leading-tight ${evaluation.state === "CANCELLED" ? "line-through" : ""}`}>
        {session.title}
      </p>
      <div className="flex flex-wrap gap-1">
        <KindBadge kind={session.kind} />
      </div>
      <p className="text-[11px] text-zinc-500 leading-snug">
        {session.typeName} · {session.trainerName}
      </p>
      {!muted && <p className="text-[11px] text-zinc-400">{capacityLabel(session)}</p>}
      <Notes session={session} />
      <div className="pt-1">
        <SessionActions session={session} />
      </div>
    </div>
  );
}

/** Variante de fila para la agenda y las listas de reservas. */
export function SessionRow({ session, dateLabel }: { session: PortalSessionView; dateLabel?: string }) {
  const { evaluation } = session;
  const muted = evaluation.state === "CANCELLED" || evaluation.state === "FINISHED";
  return (
    <div className="p-4 flex items-start gap-4">
      <div className="text-center shrink-0 w-16">
        {dateLabel && <p className="text-[11px] text-zinc-400 mb-0.5">{dateLabel}</p>}
        <p className="text-sm font-bold text-zinc-800">{session.start}</p>
        <p className="text-xs text-zinc-400">{session.end}</p>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className={`font-medium text-zinc-800 truncate ${evaluation.state === "CANCELLED" ? "line-through" : ""}`}>{session.title}</p>
          <KindBadge kind={session.kind} />
          <StateBadge state={evaluation.state} />
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">
          {session.typeName} · {session.trainerName}
        </p>
        <p className="text-xs text-zinc-400">
          {session.branchName}
          {session.roomName ? ` · ${session.roomName}` : ""}
        </p>
        {!muted && <p className="text-xs text-zinc-400 mt-0.5">{capacityLabel(session)}</p>}
        <Notes session={session} />
      </div>
      <div className="shrink-0">
        <SessionActions session={session} />
      </div>
    </div>
  );
}
