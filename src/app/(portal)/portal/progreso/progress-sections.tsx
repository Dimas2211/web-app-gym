// GYM-5B — secciones de "Mi progreso" (solo lectura, componentes de servidor).
// Tres conceptos que nunca se mezclan en pantalla:
//  - cumplimiento del PLAN (ejecuciones por fecha, fórmula de GYM-5A);
//  - ASISTENCIA confirmada a clases (GYM-4, conteos sin porcentaje);
//  - OBJETIVO de entrenamiento (cualitativo; Zolvi no registra medidas físicas).

import Link from "next/link";
import { COMPLIANCE_FORMULA } from "@/modules/weekly-plans/training-tracking-rules";
import { formatCalendarDate } from "@/modules/client-portal/portal-schedule";
import {
  displayablePct,
  PROGRESS_RANGES,
  type AttendanceFrequency,
  type ComplianceCounts,
  type PlanPhase,
  type ProgressBucket,
  type ProgressRange,
} from "@/modules/client-portal/progress-rules";
import type { ProgressClassView, ProgressFeedbackView, ProgressPlanView } from "@/modules/client-portal/progress-queries";

export const NOT_ENOUGH_DATA = "Sin datos suficientes";
export const INCOMPLETE = "Datos incompletos";

const short = (d: string) => formatCalendarDate(d, { day: "2-digit", month: "short" });
const long = (d: string) => formatCalendarDate(d, { day: "2-digit", month: "short", year: "numeric" });

export function bucketLabel(b: ProgressBucket): string {
  return b.granularity === "week" ? short(b.start) : formatCalendarDate(b.start, { month: "short", year: "2-digit" });
}

function bucketTitle(b: ProgressBucket): string {
  return b.granularity === "week" ? `Semana del ${long(b.start)} al ${long(b.end)}` : formatCalendarDate(b.start, { month: "long", year: "numeric" });
}

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

function Notice({ children, tone = "zinc" }: { children: React.ReactNode; tone?: "zinc" | "amber" }) {
  const cls = tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-zinc-50 border-zinc-200 text-zinc-600";
  return <p className={`text-sm border rounded-lg p-3 ${cls}`}>{children}</p>;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 min-w-0">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-xl font-bold text-zinc-800 mt-0.5 break-words">{value}</p>
      {hint && <p className="text-[11px] text-zinc-400 mt-0.5">{hint}</p>}
    </div>
  );
}

// ── Selector de período ──────────────────────────────────────────

export function RangeSelector({ current }: { current: ProgressRange }) {
  return (
    <nav aria-label="Período de consulta" className="flex flex-wrap gap-1.5">
      {(Object.keys(PROGRESS_RANGES) as ProgressRange[]).map((r) => (
        <Link
          key={r}
          href={`/portal/progreso?periodo=${r}`}
          aria-current={r === current ? "page" : undefined}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            r === current ? "bg-brand-navy text-white border-brand-navy" : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
          }`}
        >
          {PROGRESS_RANGES[r].label}
        </Link>
      ))}
    </nav>
  );
}

// ── 1. Resumen personal ──────────────────────────────────────────

export function SummarySection({
  summary,
  rangeLabel,
  trackingStart,
  incomplete,
}: {
  summary: ComplianceCounts;
  rangeLabel: string;
  trackingStart: string | null;
  incomplete: boolean;
}) {
  const pct = displayablePct(summary);
  if (incomplete) {
    return (
      <Card title="Resumen personal" subtitle={`Entrenamientos de tus planes · período: ${rangeLabel}, hasta hoy.`}>
        <Notice tone="amber">
          {INCOMPLETE}: tienes más planes en este período de los que se pueden leer de una vez, así que no se calculan el
          cumplimiento, los totales ni la evolución del período. Cada plan del historial conserva su propio cálculo.
        </Notice>
      </Card>
    );
  }
  return (
    <Card title="Resumen personal" subtitle={`Entrenamientos de tus planes · período: ${rangeLabel}, hasta hoy.`}>
      {summary.sufficiency === "NONE_SCHEDULED" ? (
        <Notice>{NOT_ENOUGH_DATA}: no tienes entrenamientos programados vencidos en este período.</Notice>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Cumplimiento" value={pct === null ? NOT_ENOUGH_DATA : `${pct}%`} />
            <Stat label="Programados vencidos" value={summary.scheduled} />
            <Stat label="Completados" value={summary.completed} />
            <Stat label="Parciales" value={summary.partial} hint="cuentan 0,5" />
            <Stat label="Omitidos" value={summary.skipped} />
            <Stat label="Pendientes" value={summary.pending} hint="sin registro" />
            <Stat label="Solo autorreportados" value={summary.selfReportedOnly} hint="sin confirmar por tu entrenador" />
          </div>
          {summary.sufficiency === "NO_RECORDS" && (
            <Notice>
              Aún no hay registros de tus entrenamientos en este período: no se calcula un porcentaje para no mostrar un 0%
              engañoso.
            </Notice>
          )}
        </>
      )}
      {summary.pendingBeforeTracking > 0 && (
        <p className="text-xs text-zinc-500">
          {summary.pendingBeforeTracking} de los pendientes son anteriores al inicio del seguimiento por fecha en tu gimnasio
          {trackingStart ? ` (${long(trackingStart)})` : " (aún sin registros)"}: no se pudieron registrar con este sistema y
          cuentan como pendientes, igual que en tu plan semanal.
        </p>
      )}
      <p className="text-[11px] text-zinc-400">
        {COMPLIANCE_FORMULA}. Si tu entrenador registró un entrenamiento, su registro prevalece sobre tu autorreporte. Los
        entrenamientos futuros no cuentan.
      </p>
    </Card>
  );
}

// ── 2. Evolución ─────────────────────────────────────────────────

export function EvolutionSection({
  buckets,
  perBucket,
  trackingStart,
}: {
  buckets: ProgressBucket[];
  perBucket: ComplianceCounts[];
  trackingStart: string | null;
}) {
  const anyData = perBucket.some((c) => c.sufficiency === "OK");
  // Intervalo entero anterior al seguimiento y sin registros: no verificable (no es "0 %" ni un dato del alumno).
  const beforeTracking = (b: ProgressBucket, c: ComplianceCounts) =>
    c.sufficiency === "NO_RECORDS" && (trackingStart === null || b.end < trackingStart);
  const granularity = buckets[0]?.granularity === "week" ? "semana" : "mes";
  return (
    <Card title="Evolución" subtitle={`Cumplimiento por ${granularity} (entrenamientos vencidos con registro).`}>
      {!anyData ? (
        <Notice>{NOT_ENOUGH_DATA} para mostrar una tendencia en este período.</Notice>
      ) : (
        <div className="space-y-3">
          <div className="flex items-end gap-1 h-40 border-b border-zinc-200" role="img" aria-label={`Cumplimiento por ${granularity}`}>
            {buckets.map((b, i) => {
              const c = perBucket[i];
              const pct = displayablePct(c);
              const title =
                pct === null
                  ? `${bucketTitle(b)}: ${
                      c.scheduled === 0
                        ? "sin entrenamientos programados"
                        : beforeTracking(b, c)
                          ? "anterior al inicio del seguimiento (no verificable)"
                          : `sin registros (${c.pending} pendientes)`
                    }`
                  : `${bucketTitle(b)}: ${pct}% · completados ${c.completed}, parciales ${c.partial}, omitidos ${c.skipped}, pendientes ${c.pending}`;
              return (
                <div key={b.start} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center" title={title}>
                  {pct === null ? (
                    <div className="w-full max-w-8 h-1 rounded-t border-t-2 border-dashed border-zinc-300" />
                  ) : (
                    <>
                      <span className="text-[10px] text-zinc-500 mb-0.5">{pct}%</span>
                      <div
                        className={`w-full max-w-8 rounded-t ${b.isCurrent ? "bg-brand-blue/70" : "bg-brand-blue"}`}
                        style={{ height: `${Math.max(pct, 2)}%` }}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-1">
            {buckets.map((b) => (
              <span key={b.start} className="flex-1 min-w-0 text-center text-[10px] text-zinc-400 truncate">
                {bucketLabel(b)}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-zinc-400">
            Línea punteada: sin entrenamientos programados, sin registros o anterior al inicio del seguimiento por fecha (no
            verificable) en ese intervalo. El intervalo actual se muestra más claro porque aún no termina.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer text-zinc-500 hover:text-zinc-700">Ver datos en tabla</summary>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-400 text-left">
                    <th className="py-1 pr-3 font-semibold">Intervalo</th>
                    <th className="py-1 pr-3 font-semibold">Programados</th>
                    <th className="py-1 pr-3 font-semibold">Completados</th>
                    <th className="py-1 pr-3 font-semibold">Parciales</th>
                    <th className="py-1 pr-3 font-semibold">Omitidos</th>
                    <th className="py-1 font-semibold">Cumplimiento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 text-zinc-600">
                  {buckets.map((b, i) => {
                    const c = perBucket[i];
                    const pct = displayablePct(c);
                    return (
                      <tr key={b.start}>
                        <td className="py-1 pr-3 whitespace-nowrap">{bucketLabel(b)}</td>
                        <td className="py-1 pr-3">{c.scheduled}</td>
                        <td className="py-1 pr-3">{c.completed}</td>
                        <td className="py-1 pr-3">{c.partial}</td>
                        <td className="py-1 pr-3">{c.skipped}</td>
                        <td className="py-1">{pct === null ? (beforeTracking(b, c) ? "Antes del seguimiento" : "—") : `${pct}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </Card>
  );
}

// ── 3. Asistencia a clases ───────────────────────────────────────

export function AttendanceSection({
  frequency,
  recent,
  buckets,
  rangeLabel,
  incomplete,
}: {
  frequency: AttendanceFrequency;
  recent: ProgressClassView[];
  buckets: ProgressBucket[];
  rangeLabel: string;
  incomplete: boolean;
}) {
  const max = Math.max(1, ...frequency.perBucket.map((b) => b.confirmed));
  return (
    <Card
      title="Asistencia a clases"
      subtitle="Clases en las que el gimnasio confirmó tu asistencia (a tiempo o con tardanza). Tus autorreportes del plan no cuentan aquí."
    >
      {incomplete ? (
        <Notice tone="amber">
          {INCOMPLETE}: hay más registros de asistencia en este período de los que se pueden leer de una vez, así que no se
          calculan los totales, el promedio semanal ni el gráfico. Las últimas clases asistidas sí están completas.
        </Notice>
      ) : (
        <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Esta semana" value={frequency.thisWeek} hint="lunes a domingo" />
        <Stat label="Este mes" value={frequency.thisMonth} />
        <Stat
          label={`Promedio semanal (${rangeLabel})`}
          value={frequency.weeklyAverage === null ? "—" : String(frequency.weeklyAverage).replace(".", ",")}
          hint={`${frequency.confirmed} en ${frequency.weeks} semanas`}
        />
        <Stat label="Con tardanza" value={frequency.late} hint={`de ${frequency.confirmed} confirmadas`} />
      </div>
      {frequency.absent > 0 && (
        <p className="text-xs text-zinc-500">Ausencias registradas en el período: {frequency.absent}.</p>
      )}

      {frequency.confirmed === 0 ? (
        <Notice>No hay asistencias confirmadas en este período.</Notice>
      ) : (
        <div className="space-y-2">
          <div className="flex items-end gap-1 h-28 border-b border-zinc-200" role="img" aria-label="Asistencias confirmadas por intervalo">
            {buckets.map((b, i) => {
              const fb = frequency.perBucket[i];
              const onTime = fb.confirmed - fb.late;
              return (
                <div
                  key={b.start}
                  className="flex-1 min-w-0 h-full flex flex-col justify-end items-center"
                  title={`${bucketTitle(b)}: asistencias ${fb.confirmed} (con tardanza ${fb.late})`}
                >
                  {fb.confirmed > 0 && <span className="text-[10px] text-zinc-500 mb-0.5">{fb.confirmed}</span>}
                  <div className="w-full max-w-8 flex flex-col justify-end gap-[2px]" style={{ height: `${(100 * fb.confirmed) / max}%` }}>
                    {fb.late > 0 && <div className="w-full rounded-t bg-amber-400" style={{ flexGrow: fb.late }} />}
                    {onTime > 0 && <div className={`w-full bg-emerald-600 ${fb.late > 0 ? "" : "rounded-t"}`} style={{ flexGrow: onTime }} />}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-1">
            {buckets.map((b) => (
              <span key={b.start} className="flex-1 min-w-0 text-center text-[10px] text-zinc-400 truncate">
                {bucketLabel(b)}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600" /> A tiempo
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Con tardanza
            </span>
          </div>
        </div>
      )}
        </>
      )}

      {recent.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Últimas clases asistidas</p>
          <ul className="divide-y divide-zinc-100">
            {recent.map((c, i) => (
              <li key={`${c.date}-${c.startTime}-${i}`} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-800 break-words">{c.typeName ?? c.title}</p>
                  <p className="text-xs text-zinc-500">
                    {long(c.date)} · {c.startTime}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                    c.late ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {c.late ? "Llegó tarde" : "Asistió"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-zinc-400">
        Se informan cantidades, no porcentajes: el sistema no registra cuántas clases debías tomar. Los días sin clases no
        cuentan como ausencias.
      </p>
    </Card>
  );
}

// ── 4. Evolución de planes ───────────────────────────────────────

const PHASE: Record<PlanPhase, { label: string; cls: string }> = {
  CURRENT: { label: "Vigente", cls: "bg-emerald-100 text-emerald-700" },
  UPCOMING: { label: "Próximo", cls: "bg-sky-100 text-sky-700" },
  FINISHED: { label: "Finalizado", cls: "bg-zinc-100 text-zinc-600" },
  INACTIVE: { label: "Desactivado", cls: "bg-zinc-100 text-zinc-500" },
};

function PlanRow({ plan }: { plan: ProgressPlanView }) {
  const c = plan.counts;
  const pct = c ? displayablePct(c) : null;
  const phase = PHASE[plan.phase];
  let detail: string;
  if (!c) detail = "Plan anterior al seguimiento por fecha: no se calcula su cumplimiento.";
  else if (c.sufficiency === "NONE_SCHEDULED") detail = plan.phase === "UPCOMING" ? "Aún no inicia." : `${NOT_ENOUGH_DATA}.`;
  else
    detail = `Vencidos ${c.scheduled} · completados ${c.completed} · parciales ${c.partial} · omitidos ${c.skipped} · pendientes ${c.pending}`;
  return (
    <li className="py-3 space-y-1.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-800 break-words">{plan.name}</p>
          <p className="text-xs text-zinc-500">
            {long(plan.start)} – {long(plan.end)}
            {plan.trainerName && ` · Entrenador: ${plan.trainerName}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${phase.cls}`}>{phase.label}</span>
          <span className="text-sm font-bold text-zinc-800">{pct === null ? "—" : `${pct}%`}</span>
        </div>
      </div>
      {pct !== null && (
        <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden" aria-hidden>
          <div className="h-full bg-brand-blue rounded-full" style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="text-xs text-zinc-500">{detail}</p>
      {plan.phase === "CURRENT" && plan.upcoming > 0 && (
        <p className="text-[11px] text-zinc-400">Quedan {plan.upcoming} entrenamientos programados en este plan.</p>
      )}
      {plan.hasLegacyRecords && (
        <p className="text-[11px] text-zinc-400">Tiene registros anteriores al seguimiento por fecha; se conservan sin convertirse en ejecuciones.</p>
      )}
      {plan.phase === "INACTIVE" && <p className="text-[11px] text-zinc-400">Desactivado por el gimnasio: no suma a tu resumen.</p>}
      {plan.overlapped && (
        <p className="text-[11px] text-zinc-400">
          Parte de su período coincide con un plan más reciente: en tu resumen esas fechas cuentan una sola vez, con el plan más
          reciente.
        </p>
      )}
    </li>
  );
}

export function PlansSection({ plans, totalPlans }: { plans: ProgressPlanView[]; totalPlans: number }) {
  const current = plans.filter((p) => p.phase === "CURRENT");
  const others = plans.filter((p) => p.phase !== "CURRENT");
  return (
    <Card title="Evolución de planes" subtitle="Cada plan conserva su propio período y su propio cumplimiento.">
      {plans.length === 0 ? (
        <Notice>Aún no tienes planes personalizados asignados.</Notice>
      ) : (
        <>
          {current.length === 0 ? (
            <Notice>No tienes un plan vigente en este momento.</Notice>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {current.map((p) => (
                <PlanRow key={p.planId} plan={p} />
              ))}
            </ul>
          )}
          {totalPlans > plans.length && (
            <p className="text-xs text-zinc-500">
              Se muestran {plans.length} de {totalPlans} planes: los más recientes y los del período consultado.
            </p>
          )}
          {others.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Otros planes</p>
              <ul className="divide-y divide-zinc-100">
                {others.map((p) => (
                  <PlanRow key={p.planId} plan={p} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── 5. Objetivo y retroalimentación ──────────────────────────────

export function GoalSection({
  goal,
  feedback,
}: {
  goal: { goalName: string | null; goalDescription: string | null; sportName: string | null } | null;
  feedback: ProgressFeedbackView[] | null;
}) {
  return (
    <Card title="Objetivo y retroalimentación">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Objetivo de entrenamiento</p>
        {goal?.goalName || goal?.sportName ? (
          <div className="flex flex-wrap gap-1.5">
            {goal.goalName && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">{goal.goalName}</span>
            )}
            {goal.sportName && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{goal.sportName}</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Tu gimnasio aún no registró un objetivo para ti.</p>
        )}
        {goal?.goalDescription && <p className="text-sm text-zinc-600">{goal.goalDescription}</p>}
        <p className="text-[11px] text-zinc-400">
          Es tu objetivo declarado, no un resultado medido. El cumplimiento de arriba mide si realizaste lo planificado; el
          sistema no registra medidas físicas (peso, composición corporal u otras), por lo que no muestra resultados físicos.
        </p>
      </div>

      {feedback !== null && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Retroalimentación de tu entrenador</p>
          {feedback.length === 0 ? (
            <p className="text-sm text-zinc-500">Aún no hay comentarios de tu entrenador sobre tus entrenamientos.</p>
          ) : (
            <ul className="space-y-2">
              {feedback.map((f, i) => (
                <li key={`${f.date}-${i}`} className="bg-blue-50 border border-blue-100 rounded-lg p-2.5">
                  <p className="text-[11px] font-semibold text-blue-700">
                    {long(f.date)}
                    {f.sessionName && ` · ${f.sessionName}`}
                  </p>
                  <p className="text-sm text-blue-900 break-words whitespace-pre-wrap">{f.feedback}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
