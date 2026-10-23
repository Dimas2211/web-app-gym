// GYM-5C — secciones de "Seguimiento de mis alumnos" (solo lectura, componentes de servidor).
// Hechos, no juicios: se muestran conteos y estados; nunca etiquetas sobre el alumno.
// Conceptos separados en pantalla: alumno, plan, ocurrencia programada,
// ejecución (registro por fecha) y asistencia a clases (GYM-4).

import Link from "next/link";
import { COMPLIANCE_FORMULA } from "@/modules/weekly-plans/training-tracking-rules";
import { formatCalendarDate } from "@/modules/client-portal/portal-schedule";
import type { PlanPhase } from "@/modules/client-portal/progress-rules";
import {
  FOLLOW_UP_SCOPES,
  type FilteredRows,
  type FollowUpFilters,
  type FollowUpRow,
  type FollowUpSummary,
  type QueueItem,
} from "@/modules/weekly-plans/trainer-follow-up-rules";
import type { TrainerFollowUp } from "@/modules/weekly-plans/trainer-follow-up-queries";

export const NOT_ENOUGH_DATA = "Sin datos suficientes";
export const INCOMPLETE = "Datos incompletos";
export const QUEUE_LIMIT = 15;
const BASE = "/dashboard/weekly-plans/seguimiento";

const long = (d: string) => formatCalendarDate(d, { day: "2-digit", month: "short", year: "numeric" });
const weekdayShort = (d: string) => formatCalendarDate(d, { weekday: "short", day: "2-digit", month: "short" });
const planHref = (id: string) => `/dashboard/weekly-plans/client-plans/${id}`;

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 sm:p-5 space-y-4 min-w-0">
      <div>
        <h2 className="text-base font-semibold text-zinc-800">{title}</h2>
        {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function Notice({ children, tone = "zinc" }: { children: React.ReactNode; tone?: "zinc" | "amber" }) {
  const cls = tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-zinc-50 border-zinc-200 text-zinc-600";
  return <div className={`text-sm border rounded-lg p-3 ${cls}`}>{children}</div>;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 min-w-0">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-xl font-bold text-zinc-800 mt-0.5 break-words">{value}</p>
      <p className="text-[11px] text-zinc-400 mt-0.5">{hint}</p>
    </div>
  );
}

const PHASE_LABEL: Record<PlanPhase, string> = {
  CURRENT: "Vigente",
  UPCOMING: "Próximo",
  FINISHED: "Finalizado",
  INACTIVE: "Desactivado",
};
const PHASE_CLS: Record<PlanPhase, string> = {
  CURRENT: "bg-emerald-50 text-emerald-700",
  UPCOMING: "bg-sky-50 text-sky-700",
  FINISHED: "bg-zinc-100 text-zinc-600",
  INACTIVE: "bg-amber-50 text-amber-800",
};

function PhaseBadge({ phase }: { phase: PlanPhase }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${PHASE_CLS[phase]}`}>{PHASE_LABEL[phase]}</span>;
}

// ── A. Indicadores ───────────────────────────────────────────────

export function SummarySection({ data }: { data: TrainerFollowUp }) {
  const s = data.summary;
  return (
    <Card title="Indicadores de mis planes vigentes" subtitle={`Planes activos cuyo período incluye hoy (${long(data.today)}), desde el inicio de cada plan hasta hoy.`}>
      {!s ? (
        <Notice tone="amber">
          {data.trackingUnavailable
            ? "El seguimiento por fecha aún no está disponible en este gimnasio: no se calculan indicadores."
            : `${INCOMPLETE}: hay más planes o registros de los que se pueden leer en una consulta. No se muestran cifras para no presentar totales parciales.`}
        </Notice>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Stat label="Alumnos con plan vigente" value={s.students} hint="alumnos distintos, hoy" />
            <Stat label="Planes vigentes" value={s.currentPlans} hint="asignados a ti, hoy" />
            <Stat label="Vencidos sin registro" value={s.counts.pending} hint="sin autorreporte ni registro" />
            <Stat label="Autorreportes por revisar" value={s.review.length} hint="sin registro del entrenador" />
            <Stat label="Con registro del entrenador" value={s.trainerRecorded} hint="entrenamientos revisados" />
            <Stat label="Cumplimiento" value={s.pct != null ? `${s.pct}%` : NOT_ENOUGH_DATA} hint={`${s.counts.scheduled} programados vencidos`} />
          </div>
          {data.attendance && (
            <p className="text-xs text-zinc-500">
              Asistencias a clases confirmadas (asistió o llegó tarde) en el período de tus planes vigentes:{" "}
              <span className="font-semibold text-zinc-700">{data.attendance.incomplete ? INCOMPLETE : data.attendance.currentPlans}</span>. La
              asistencia es un dato aparte: no suma al cumplimiento y un autorreporte no es asistencia.
            </p>
          )}
          <p className="text-xs text-zinc-500">
            {COMPLIANCE_FORMULA}. El cumplimiento agregado suma los conteos de todos los planes vigentes (no promedia
            porcentajes). Se muestra solo si hay entrenamientos vencidos con algún registro.
            {s.overlap && " Algunos planes vigentes de un mismo alumno se solapan: cada fecha cuenta una sola vez, en el plan más reciente."}
          </p>
        </>
      )}
    </Card>
  );
}

// ── D. Pendientes ────────────────────────────────────────────────

function QueueList({ items, empty, badge }: { items: QueueItem[]; empty: string; badge: { label: string; cls: string } }) {
  if (items.length === 0) return <p className="text-sm text-zinc-400">{empty}</p>;
  return (
    <>
      <ul className="divide-y divide-zinc-100">
        {items.slice(0, QUEUE_LIMIT).map((i) => (
          <li key={`${i.dayId}-${i.date}`} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
            <span className="text-sm font-medium text-zinc-800 w-28 shrink-0">{weekdayShort(i.date)}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-zinc-800 break-words">{i.clientName}</span>
              <span className="block text-xs text-zinc-500 break-words">
                {i.planName}
                {i.sessionName ? ` · ${i.sessionName}` : ""}
              </span>
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
            <Link href={planHref(i.planId)} className="text-xs font-semibold text-zinc-700 border border-zinc-300 rounded-lg px-2.5 py-1 hover:bg-zinc-50">
              Ver seguimiento
            </Link>
          </li>
        ))}
      </ul>
      {items.length > QUEUE_LIMIT && (
        <p className="text-xs text-zinc-500">
          Se muestran los {QUEUE_LIMIT} más antiguos de {items.length}. Usa los filtros del listado para ver cada alumno.
        </p>
      )}
    </>
  );
}

export function QueueSection({ summary }: { summary: FollowUpSummary }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card
        title="Autorreportes por revisar"
        subtitle="El alumno reportó la sesión y aún no tiene tu registro. Un autorreporte no equivale a asistencia confirmada."
      >
        <QueueList items={summary.review} empty="No hay autorreportes por revisar en tus planes vigentes." badge={{ label: "Por revisar", cls: "bg-sky-50 text-sky-700" }} />
      </Card>
      <Card title="Pendientes sin registro" subtitle="Sesiones programadas ya vencidas sin autorreporte ni registro. Las sesiones futuras no se cuentan.">
        <QueueList items={summary.pending} empty="No hay sesiones vencidas sin registro en tus planes vigentes." badge={{ label: "Sin registro", cls: "bg-zinc-100 text-zinc-600" }} />
      </Card>
    </div>
  );
}

// ── C. Filtros ───────────────────────────────────────────────────

export function FiltersForm({ filters, metrics }: { filters: FollowUpFilters; metrics: boolean }) {
  return (
    <form method="GET" action={BASE} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-zinc-500 w-full sm:w-56">
        Alumno
        <input
          name="q"
          type="search"
          maxLength={100}
          placeholder="Buscar por nombre…"
          defaultValue={filters.q}
          className="border border-zinc-300 rounded-lg px-3.5 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Planes
        <select
          name="estado"
          defaultValue={filters.scope}
          className="border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-800 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          {Object.entries(FOLLOW_UP_SCOPES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {metrics && (
        <>
          <label className="flex items-center gap-2 text-sm text-zinc-700 py-2">
            <input type="checkbox" name="pendientes" value="1" defaultChecked={filters.pending} className="h-4 w-4 rounded border-zinc-300" />
            Con pendientes
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 py-2">
            <input type="checkbox" name="revisar" value="1" defaultChecked={filters.review} className="h-4 w-4 rounded border-zinc-300" />
            Con autorreportes por revisar
          </label>
        </>
      )}
      <button type="submit" className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-800 transition-colors">
        Filtrar
      </button>
      <Link href={BASE} className="text-sm text-zinc-500 hover:text-zinc-800 py-2">
        Limpiar
      </Link>
    </form>
  );
}

// ── B. Listado ───────────────────────────────────────────────────

function pctLabel(r: FollowUpRow): string {
  if (!r.counts) return "—";
  return r.pct != null ? `${r.pct}%` : NOT_ENOUGH_DATA;
}

function Counts({ r }: { r: FollowUpRow }) {
  if (!r.counts) return <span className="text-zinc-400">—</span>;
  const c = r.counts;
  return (
    <span className="text-xs text-zinc-600 whitespace-nowrap">
      {c.completed} compl. · {c.partial} parc. · {c.skipped} omit. · <span className={c.pending > 0 ? "font-semibold text-zinc-800" : ""}>{c.pending} pend.</span>
    </span>
  );
}

function ReviewBadge({ n }: { n: number }) {
  if (n === 0) return <span className="text-xs text-zinc-400">0</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700">{n} por revisar</span>;
}

function filterQuery(f: FollowUpFilters, page: number): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  p.set("estado", f.scope);
  if (f.pending) p.set("pendientes", "1");
  if (f.review) p.set("revisar", "1");
  if (page > 1) p.set("pagina", String(page));
  return `${BASE}?${p.toString()}`;
}

export function StudentsSection({
  result,
  filters,
  showAttendance,
}: {
  result: FilteredRows;
  filters: FollowUpFilters;
  showAttendance: boolean;
}) {
  const th = "text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap";
  return (
    <Card
      title="Mis alumnos y sus planes"
      subtitle="Una fila por plan asignado a ti. Orden: autorreportes por revisar, pendiente más antiguo, registro más reciente y nombre."
    >
      {result.total === 0 ? (
        <p className="text-sm text-zinc-400">No hay planes que coincidan con los filtros.</p>
      ) : (
        <>
          {/* Escritorio */}
          <div className="hidden md:block overflow-x-auto -mx-4 sm:-mx-5">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-y border-zinc-200">
                <tr>
                  <th className={th}>Alumno</th>
                  <th className={th}>Plan</th>
                  <th className={th}>Estado</th>
                  <th className={th}>Cumplimiento</th>
                  <th className={th}>Registros</th>
                  <th className={th}>Autorreportes</th>
                  <th className={th}>Último registro</th>
                  {showAttendance && <th className={th}>Asistencias</th>}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {result.rows.map((r) => (
                  <tr key={r.planId} className="hover:bg-zinc-50 align-top">
                    <td className="px-4 py-3 font-medium text-zinc-800 min-w-40">{r.clientName}</td>
                    <td className="px-4 py-3 text-zinc-600 min-w-44">
                      <p>{r.planName}</p>
                      <p className="text-xs text-zinc-400 whitespace-nowrap">
                        {long(r.start)} → {long(r.end)}
                      </p>
                      <p className="text-xs text-zinc-400">{r.branchName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <PhaseBadge phase={r.phase} />
                    </td>
                    <td className="px-4 py-3 text-zinc-800 font-semibold whitespace-nowrap">{pctLabel(r)}</td>
                    <td className="px-4 py-3">
                      <Counts r={r} />
                    </td>
                    <td className="px-4 py-3">{r.counts ? <ReviewBadge n={r.toReview} /> : <span className="text-zinc-400">—</span>}</td>
                    <td className="px-4 py-3 text-xs text-zinc-600 whitespace-nowrap">{r.lastRecord ? long(r.lastRecord) : "Sin registros"}</td>
                    {showAttendance && <td className="px-4 py-3 text-zinc-600">{r.attendance ?? INCOMPLETE}</td>}
                    <td className="px-4 py-3 text-right">
                      <Link href={planHref(r.planId)} className="text-xs font-semibold text-zinc-700 border border-zinc-300 rounded-lg px-2.5 py-1 hover:bg-white whitespace-nowrap">
                        Ver seguimiento
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Móvil */}
          <ul className="md:hidden space-y-3">
            {result.rows.map((r) => (
              <li key={r.planId} className="rounded-lg border border-zinc-200 p-3 space-y-2 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-800 break-words">{r.clientName}</p>
                    <p className="text-xs text-zinc-500 break-words">{r.planName}</p>
                  </div>
                  <PhaseBadge phase={r.phase} />
                </div>
                <p className="text-xs text-zinc-400">
                  {long(r.start)} → {long(r.end)} · {r.branchName}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-zinc-400">Cumplimiento</p>
                    <p className="font-semibold text-zinc-800">{pctLabel(r)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-400">Último registro</p>
                    <p className="text-zinc-700">{r.lastRecord ? long(r.lastRecord) : "Sin registros"}</p>
                  </div>
                </div>
                <Counts r={r} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.counts && <ReviewBadge n={r.toReview} />}
                    {showAttendance && <span className="text-xs text-zinc-500">Asistencias: {r.attendance ?? INCOMPLETE}</span>}
                  </div>
                  <Link href={planHref(r.planId)} className="text-xs font-semibold text-zinc-700 border border-zinc-300 rounded-lg px-2.5 py-1">
                    Ver seguimiento
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
            <span>
              {result.total} plan(es) · página {result.page} de {result.pages}
            </span>
            {result.pages > 1 && (
              <span className="flex gap-2">
                {result.page > 1 && (
                  <Link href={filterQuery(filters, result.page - 1)} className="border border-zinc-300 rounded-lg px-2.5 py-1 hover:bg-zinc-50">
                    Anterior
                  </Link>
                )}
                {result.page < result.pages && (
                  <Link href={filterQuery(filters, result.page + 1)} className="border border-zinc-300 rounded-lg px-2.5 py-1 hover:bg-zinc-50">
                    Siguiente
                  </Link>
                )}
              </span>
            )}
          </div>
        </>
      )}
      <p className="text-xs text-zinc-400">
        Cumplimiento por plan: mismo cálculo que el detalle del plan, sobre todo su período hasta hoy. Pendiente = sesión vencida
        sin estado registrado.{showAttendance && " Asistencias = clases confirmadas (asistió o llegó tarde) dentro del período del plan."}
      </p>
    </Card>
  );
}
