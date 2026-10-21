import Link from "next/link";
import { requireClient } from "@/lib/permissions/guards";
import {
  loadPortalBookings,
  loadPortalMembershipSummary,
  loadPortalSchedule,
} from "@/modules/client-portal/queries";
import { openPortalContext } from "@/modules/client-portal/portal-context";
import {
  addCalendarDays,
  formatCalendarDate,
  MODALITY_LABELS,
  PORTAL_STATE_LABELS,
  weekStart,
  type PortalSessionState,
} from "@/modules/client-portal/portal-schedule";
import { PortalAccessNotice } from "../portal-access-notice";
import { SessionRow, SessionTile, STATE_BADGE } from "./session-card";

// GYM-BOOKINGS 3B — calendario multimodalidad del alumno.
// Lectura autorizada (openPortalContext: runtime, gym.classes, rol LIVE,
// Client desde la sesión). Las sesiones visibles y su estado salen de
// loadPortalSchedule; reservar/cancelar siguen siendo bookClassAction /
// cancelBookingAction → GymBookingService.

type SearchParams = Promise<{ semana?: string; vista?: string }>;

const LEGEND: PortalSessionState[] = ["AVAILABLE", "FULL", "BOOKED", "NOT_ELIGIBLE", "CANCELLED", "FINISHED"];

function href(week: string, view: "semana" | "agenda") {
  return `/portal/clases?semana=${week}&vista=${view}`;
}

export default async function ClasesPage({ searchParams }: { searchParams: SearchParams }) {
  const sessionUser = await requireClient();
  const params = await searchParams;
  const view: "semana" | "agenda" = params.vista === "agenda" ? "agenda" : "semana";

  const access = await openPortalContext(sessionUser, { module: "gym.classes", optionalModules: ["gym.memberships"] });
  if (!access.ok) return <PortalAccessNotice title="Mis clases" denied={access} />;
  const { context, client, modules, dispose } = access;

  try {
    const ref = { id: client.id, branch_id: client.branch_id, modality: client.modality, status: client.status };
    const [schedule, bookings, membership] = await Promise.all([
      loadPortalSchedule({ db: context.client, tenantId: context.tenantId, client: ref, week: params.semana }),
      loadPortalBookings({ db: context.client, tenantId: context.tenantId, client: ref }),
      modules["gym.memberships"]
        ? loadPortalMembershipSummary({ db: context.client, tenantId: context.tenantId, client: ref })
        : Promise.resolve(null),
    ]);

    const { week, today } = schedule;
    const currentWeek = weekStart(today);
    const prevWeek = addCalendarDays(week.start, -7);
    const nextWeek = addCalendarDays(week.start, 7);
    const weekLabel = `${formatCalendarDate(week.start, { day: "numeric", month: "short" })} – ${formatCalendarDate(week.end, {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
    const totalSessions = schedule.days.reduce((n, d) => n + d.sessions.length, 0);
    const primary = membership?.primary ?? null;

    return (
      <div className="space-y-6">
        {/* Encabezado */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-800">Mis clases</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Sucursal: {client.branch.name} · Modalidad: {MODALITY_LABELS[client.modality]}
            </p>
          </div>
          <Link href="/portal/historial" className="text-xs text-zinc-500 hover:text-zinc-800 underline">
            Ver historial
          </Link>
        </div>

        {/* Avisos de contexto */}
        {schedule.notices.map((n) => (
          <div key={n} className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            {n}
          </div>
        ))}

        {/* Saldo de la membresía relevante */}
        {membership && (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 flex items-center justify-between gap-4 flex-wrap">
            {primary ? (
              <div className="text-sm">
                <p className="font-medium text-zinc-800">
                  {primary.planName} <span className="text-zinc-400 font-normal">· {MODALITY_LABELS[primary.modality]}</span>
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Vence el {formatCalendarDate(primary.endDate, { day: "2-digit", month: "short", year: "numeric" })}
                  {primary.sessionsTotal != null && (
                    <>
                      {" "}
                      · {primary.sessionsRemaining} de {primary.sessionsTotal} sesiones disponibles
                    </>
                  )}
                  {primary.trainerName && <> · Entrenador: {primary.trainerName}</>}
                </p>
                {primary.trainerMissing && (
                  <p className="text-xs text-amber-700 mt-0.5">Tu membresía no tiene entrenador asignado; no puedes reservar sesiones personalizadas.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-red-600">No tienes una membresía vigente hoy.</p>
            )}
            <Link href="/portal/membresias" className="text-xs text-zinc-500 hover:text-zinc-800 underline shrink-0">
              Ver membresía
            </Link>
          </div>
        )}

        {/* Navegación por semanas y vista */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-1">
            <Link href={href(prevWeek, view)} className="text-sm px-2.5 py-1.5 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50" aria-label="Semana anterior">
              ←
            </Link>
            <Link
              href={href(currentWeek, view)}
              className={`text-xs px-2.5 py-1.5 rounded-md border ${week.start === currentWeek ? "border-zinc-800 bg-zinc-800 text-white" : "border-zinc-200 bg-white hover:bg-zinc-50"}`}
            >
              Hoy
            </Link>
            <Link href={href(nextWeek, view)} className="text-sm px-2.5 py-1.5 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50" aria-label="Semana siguiente">
              →
            </Link>
            <span className="text-sm font-medium text-zinc-700 ml-2">{weekLabel}</span>
          </div>
          <div className="flex items-center rounded-md border border-zinc-200 bg-white p-0.5 text-xs">
            <Link href={href(week.start, "semana")} className={`px-2.5 py-1 rounded ${view === "semana" ? "bg-zinc-800 text-white" : "text-zinc-600"}`}>
              Semana
            </Link>
            <Link href={href(week.start, "agenda")} className={`px-2.5 py-1 rounded ${view === "agenda" ? "bg-zinc-800 text-white" : "text-zinc-600"}`}>
              Agenda
            </Link>
          </div>
        </div>

        {/* Calendario */}
        {totalSessions === 0 ? (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 text-center">
            <p className="text-zinc-500">No hay sesiones disponibles para ti en esta semana.</p>
          </div>
        ) : view === "semana" ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 xl:gap-4">
            {schedule.days.map((day) => {
              const isToday = day.date === today;
              return (
                <div key={day.date} className="space-y-2 min-w-0">
                  <p className={`text-xs font-semibold uppercase tracking-wide ${isToday ? "text-zinc-900" : "text-zinc-400"}`}>
                    {formatCalendarDate(day.date, { weekday: "short", day: "numeric" })}
                    {isToday && <span className="ml-1 normal-case font-medium text-blue-600">· hoy</span>}
                  </p>
                  {day.sessions.length === 0 ? (
                    <p className="text-[11px] text-zinc-300 md:py-2">Sin sesiones</p>
                  ) : (
                    day.sessions.map((s) => <SessionTile key={s.id} session={s} isToday={isToday} />)
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          schedule.days
            .filter((d) => d.sessions.length > 0)
            .map((day) => (
              <div key={day.date} className="space-y-2">
                <p className={`text-xs font-semibold uppercase tracking-wide ${day.date === today ? "text-zinc-900" : "text-zinc-400"}`}>
                  {formatCalendarDate(day.date, { weekday: "long", day: "2-digit", month: "short" })}
                  {day.date === today && " · hoy"}
                </p>
                <div className="bg-white rounded-xl border border-zinc-200 shadow-sm divide-y divide-zinc-100">
                  {day.sessions.map((s) => (
                    <SessionRow key={s.id} session={s} />
                  ))}
                </div>
              </div>
            ))
        )}

        {/* Leyenda */}
        <div className="flex flex-wrap gap-1.5">
          {LEGEND.map((s) => (
            <span key={s} className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATE_BADGE[s]}`}>
              {PORTAL_STATE_LABELS[s]}
            </span>
          ))}
        </div>

        {/* Mis próximas reservas */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm">
          <div className="flex items-center justify-between px-5 pt-5">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Mis próximas reservas</p>
            <Link href="/portal/historial" className="text-xs text-zinc-500 hover:text-zinc-800 underline">
              Pasadas y canceladas
            </Link>
          </div>
          {bookings.upcoming.length === 0 ? (
            <p className="text-sm text-zinc-500 px-5 py-4">No tienes reservas confirmadas próximas.</p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {bookings.upcoming.map((b) => (
                <SessionRow key={b.ownBookingId} session={b} dateLabel={formatCalendarDate(b.date, { weekday: "short", day: "2-digit", month: "short" })} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  } finally {
    await dispose();
  }
}
