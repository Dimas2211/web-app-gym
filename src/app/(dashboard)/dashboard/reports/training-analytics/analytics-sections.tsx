// GYM-5D — secciones de "Analítica de entrenamiento" (solo lectura, componentes de servidor).
// Hechos agregados, no juicios: conteos y porcentajes con la fórmula de GYM-5A; sin nombres
// de alumnos, sin rankings ni puntuaciones. Conceptos separados en pantalla: alumno, plan,
// ocurrencia programada, ejecución (registro por fecha) y asistencia a clases (GYM-4).

import Link from "next/link";
import type { ReactNode } from "react";
import { COMPLIANCE_FORMULA } from "@/modules/weekly-plans/training-tracking-rules";
import { formatCalendarDate, MODALITY_LABELS, SESSION_KIND_LABELS } from "@/modules/client-portal/portal-schedule";
import { PROGRESS_RANGES, type ProgressBucket, type ProgressRange } from "@/modules/client-portal/progress-rules";
import { NO_TRAINER, type AttendanceCounts, type GroupMetrics } from "@/modules/weekly-plans/training-analytics-rules";
import type { AnalyticsBranch, TrainingAnalytics } from "@/modules/weekly-plans/training-analytics-queries";

export const NOT_ENOUGH_DATA = "Sin datos suficientes";
export const INCOMPLETE = "Datos incompletos";
export const BASE = "/dashboard/reports/training-analytics";
export const CROSS_BRANCH_DETECTED =
  "Algunos alumnos tienen planes heredados solapados en distintas sucursales: cada fecha cuenta una sola vez, en la sucursal del plan más reciente. La fila de una sucursal puede diferir de la vista de esa sucursal por separado.";
export const CROSS_BRANCH_SCOPE =
  "Cifras calculadas solo con los planes de esta sucursal. Si un alumno tiene planes heredados solapados con otra sucursal, la comparación entre sucursales puede asignar esas fechas a la otra sede y mostrar cifras distintas.";

const long = (d: string) => formatCalendarDate(d, { day: "2-digit", month: "short", year: "numeric" });

function bucketLabel(b: ProgressBucket): string {
  return b.granularity === "week"
    ? `Semana del ${formatCalendarDate(b.start, { day: "numeric", month: "short" })}`
    : formatCalendarDate(b.start, { month: "long", year: "numeric" });
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
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

export function Notice({ children, tone = "zinc" }: { children: ReactNode; tone?: "zinc" | "amber" }) {
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

const pctText = (pct: number | null) => (pct === null ? NOT_ENOUGH_DATA : `${pct}%`);

function PctBar({ pct }: { pct: number | null }) {
  return (
    <span className="flex items-center gap-1.5 min-w-[5.5rem]">
      <span aria-hidden className="h-1.5 w-10 shrink-0 rounded-full bg-zinc-100 overflow-hidden">
        {pct !== null && <span className="block h-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />}
      </span>
      <span className={pct === null ? "text-xs text-zinc-400" : "text-sm font-semibold text-zinc-800"}>{pctText(pct)}</span>
    </span>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left">
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 sm:px-3 py-2 text-xs font-semibold text-zinc-500 align-bottom min-w-[4.5rem]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <td className={`px-4 sm:px-3 py-2 whitespace-nowrap ${strong ? "font-medium text-zinc-800" : "text-zinc-600"}`}>{children}</td>;
}

// ── Filtros ──────────────────────────────────────────────────────

export function FiltersForm({
  range,
  branches,
  branchId,
  canChooseBranch,
}: {
  range: ProgressRange;
  branches: AnalyticsBranch[];
  branchId: string | null;
  canChooseBranch: boolean;
}) {
  const select = "border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-800 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900";
  return (
    <form method="GET" action={BASE} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Período de la evolución y la asistencia
        <select name="periodo" defaultValue={range} className={select}>
          {Object.entries(PROGRESS_RANGES).map(([value, cfg]) => (
            <option key={value} value={value}>
              {cfg.label} ({cfg.granularity === "week" ? "semanal" : "mensual"})
            </option>
          ))}
        </select>
      </label>
      {canChooseBranch ? (
        <label className="flex flex-col gap-1 text-xs text-zinc-500 w-full sm:w-auto">
          Sucursal
          <select name="sede" defaultValue={branchId ?? ""} className={select}>
            <option value="">Todas las sucursales</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.active ? "" : " (inactiva)"}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-xs text-zinc-500 py-2">
          Sucursal: <span className="font-semibold text-zinc-700">{branches[0]?.name}</span>
        </p>
      )}
      <button type="submit" className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-800 transition-colors">
        Aplicar
      </button>
      <Link href={BASE} className="text-sm text-zinc-500 hover:text-zinc-800 py-2">
        Restablecer
      </Link>
    </form>
  );
}

// ── A. Panorama ──────────────────────────────────────────────────

function complianceUnavailable(data: TrainingAnalytics): string {
  return data.trackingUnavailable
    ? "El seguimiento por fecha aún no está disponible en este gimnasio: no se calculan cifras de cumplimiento."
    : `${INCOMPLETE}: hay más planes o registros de los que se pueden leer en una consulta. No se muestran cifras para no presentar totales parciales.`;
}

export function OverviewSection({ data }: { data: TrainingAnalytics }) {
  const c = data.current;
  return (
    <Card
      title="Panorama de planes vigentes"
      subtitle={`Planes activos cuyo período incluye hoy (${long(data.today)}), contados desde el inicio de cada plan hasta hoy. Los planes futuros no cuentan.`}
    >
      {!c ? (
        <Notice tone="amber">{complianceUnavailable(data)}</Notice>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <Stat label="Alumnos con plan vigente" value={c.overview.students} hint="alumnos distintos, hoy" />
            <Stat label="Planes vigentes" value={c.overview.plans} hint="asignados, hoy" />
            {data.compliance && (
              <>
                <Stat label="Programados vencidos" value={c.overview.counts.scheduled} hint="ocurrencias hasta hoy" />
                <Stat label="Completados" value={c.overview.counts.completed} hint="estado efectivo" />
                <Stat label="Parciales" value={c.overview.counts.partial} hint="cuentan 0,5" />
                <Stat label="Omitidos" value={c.overview.counts.skipped} hint="estado efectivo" />
                <Stat label="Pendientes sin registro" value={c.overview.counts.pending} hint="sin autorreporte ni registro" />
                <Stat label="Autorreportes por revisar" value={c.overview.toReview} hint="sin registro del entrenador" />
                <Stat label="Registros del entrenador" value={c.overview.trainerRecorded} hint="verificados por el entrenador" />
                <Stat label="Cumplimiento" value={pctText(c.overview.pct)} hint={`${c.overview.counts.scheduled} programados vencidos`} />
              </>
            )}
          </div>
          {!data.compliance ? (
            <Notice tone="amber">{complianceUnavailable(data)}</Notice>
          ) : (
            <div className="text-xs text-zinc-500 space-y-1">
              <p>
                {COMPLIANCE_FORMULA}. Las cifras suman los conteos de todos los planes (no promedian porcentajes) y se
                muestran solo si hay entrenamientos vencidos con algún registro. El registro del entrenador prevalece sobre
                el autorreporte; un autorreporte no es una asistencia.
              </p>
              {c.overview.counts.pendingBeforeTracking > 0 && (
                <p>
                  {c.overview.counts.pendingBeforeTracking} de los pendientes son anteriores al inicio del seguimiento por
                  fecha{data.trackingStart ? ` (${long(data.trackingStart)})` : ""}: siguen en el denominador, como en el detalle de cada plan.
                </p>
              )}
              {c.overlap && <p>Algunos planes vigentes de un mismo alumno se solapan: cada fecha cuenta una sola vez, en el plan más reciente.</p>}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── B. Evolución ─────────────────────────────────────────────────

export function EvolutionSection({ data }: { data: TrainingAnalytics }) {
  const granularity = data.buckets[0]?.granularity === "week" ? "Evolución semanal" : "Evolución mensual";
  const e = data.evolution;
  const withAttendance = data.attendance?.data != null;
  return (
    <Card
      title={granularity}
      subtitle={`Últimos ${PROGRESS_RANGES[data.range].label}: planes activos con fechas dentro de cada ${data.buckets[0]?.granularity === "week" ? "semana (lunes a domingo)" : "mes calendario"}, en la zona horaria del gimnasio.`}
    >
      {!e ? (
        <Notice tone="amber">{complianceUnavailable(data)}</Notice>
      ) : e.total.scheduled === 0 ? (
        <Notice>{NOT_ENOUGH_DATA}: no hay entrenamientos programados vencidos en este período.</Notice>
      ) : (
        <>
          <Table
            head={[
              "Período",
              "Programados vencidos",
              "Completados",
              "Parciales",
              "Omitidos",
              "Sin registro",
              "Por revisar",
              "Cumplimiento",
              ...(withAttendance ? ["Asistencias confirmadas"] : []),
            ]}
          >
            {e.buckets.map((b, i) => (
              <tr key={b.bucket.start}>
                <Td strong>
                  {bucketLabel(b.bucket)}
                  {b.bucket.isCurrent && <span className="ml-1 text-xs text-zinc-400">(en curso)</span>}
                </Td>
                <Td>{b.counts.scheduled}</Td>
                <Td>{b.counts.completed}</Td>
                <Td>{b.counts.partial}</Td>
                <Td>{b.counts.skipped}</Td>
                <Td>{b.counts.pending}</Td>
                <Td>{b.counts.selfReportedOnly}</Td>
                <Td>{b.beforeTracking ? <span className="text-xs text-zinc-400">Antes del seguimiento</span> : <PctBar pct={b.pct} />}</Td>
                {withAttendance && <Td>{data.attendance!.data!.perBucket[i]}</Td>}
              </tr>
            ))}
            <tr className="bg-zinc-50/60">
              <Td strong>Total del período</Td>
              <Td strong>{e.total.scheduled}</Td>
              <Td strong>{e.total.completed}</Td>
              <Td strong>{e.total.partial}</Td>
              <Td strong>{e.total.skipped}</Td>
              <Td strong>{e.total.pending}</Td>
              <Td strong>{e.total.selfReportedOnly}</Td>
              <Td strong>
                <PctBar pct={e.totalPct} />
              </Td>
              {withAttendance && <Td strong>{data.attendance!.data!.total.confirmed}</Td>}
            </tr>
          </Table>
          <p className="text-xs text-zinc-500">
            Cada período suma sus conteos ({COMPLIANCE_FORMULA.toLowerCase()}). «{NOT_ENOUGH_DATA}»: sin entrenamientos
            vencidos o sin ningún registro. «Antes del seguimiento»: período sin registros anterior al inicio del seguimiento
            por fecha{data.trackingStart ? ` (${long(data.trackingStart)})` : ""}; sus pendientes siguen contando en el total.
            {e.total.pendingBeforeTracking > 0 && ` ${e.total.pendingBeforeTracking} pendientes del período son anteriores a ese inicio.`}
            {e.overlap && " Planes solapados de un mismo alumno: cada fecha cuenta una vez, en el plan más reciente."}
            {withAttendance && " Las asistencias son un dato aparte y no suman al cumplimiento."}
          </p>
        </>
      )}
    </Card>
  );
}

// ── C. Sucursales ────────────────────────────────────────────────

function BranchMetricCells({ m }: { m: GroupMetrics | undefined }) {
  return (
    <>
      <Td>{m?.counts.scheduled ?? 0}</Td>
      <Td>{m?.counts.pending ?? 0}</Td>
      <Td>{m?.toReview ?? 0}</Td>
      <Td>
        <PctBar pct={m?.pct ?? null} />
      </Td>
    </>
  );
}

function attendanceCell(data: TrainingAnalytics, counts: AttendanceCounts | undefined): ReactNode {
  if (!data.attendance) return null;
  return <Td>{data.attendance.incomplete ? INCOMPLETE : (counts?.confirmed ?? 0)}</Td>;
}

export function BranchesSection({ data, title, single }: { data: TrainingAnalytics; title: string; single: boolean }) {
  const c = data.current;
  if (!c) return null;
  const withAttendance = data.attendance !== null;
  const rows = data.branches.filter((b) => b.active || c.byBranch.has(b.id) || (data.attendance?.data?.byBranch.get(b.id)?.confirmed ?? 0) > 0);
  return (
    <Card
      title={title}
      subtitle={`Planes vigentes por la sucursal del plan; asistencias por la sucursal de la clase, en los últimos ${PROGRESS_RANGES[data.range].label}.`}
    >
      <Table
        head={[
          "Sucursal",
          "Alumnos con plan vigente",
          "Planes vigentes",
          ...(data.compliance ? ["Programados vencidos", "Sin registro", "Por revisar", "Cumplimiento"] : []),
          ...(withAttendance ? ["Asistencias confirmadas"] : []),
        ]}
      >
        {rows.map((b) => {
          const m = c.byBranch.get(b.id);
          return (
            <tr key={b.id}>
              <Td strong>
                {b.name}
                {!b.active && <span className="ml-1 text-xs text-zinc-400">(inactiva)</span>}
              </Td>
              <Td>{m?.students ?? 0}</Td>
              <Td>{m?.plans ?? 0}</Td>
              {data.compliance && <BranchMetricCells m={m} />}
              {attendanceCell(data, data.attendance?.data?.byBranch.get(b.id))}
            </tr>
          );
        })}
      </Table>
      {!single && (
        <p className="text-xs text-zinc-500">
          Un alumno con planes vigentes en dos sucursales cuenta en ambas filas; los demás conteos suman exactamente el panorama.
        </p>
      )}
      {/* §8 GYM-5D: solapes heredados entre sedes. Solo se detectan con los planes ya leídos;
          en la vista de una sede no se consultan otras sedes, así que la nota es fija. */}
      {!single && c.crossBranchOverlap && <p className="text-xs text-zinc-400">{CROSS_BRANCH_DETECTED}</p>}
      {single && <p className="text-xs text-zinc-400">{CROSS_BRANCH_SCOPE}</p>}
    </Card>
  );
}

// ── D. Entrenadores ──────────────────────────────────────────────

export function TrainersSection({ data, classes }: { data: TrainingAnalytics; classes: boolean }) {
  const c = data.current;
  if (!c) return null;
  const rows = [...c.byTrainer.entries()]
    .map(([id, m]) => {
      const t = data.trainers.get(id);
      const name = id === NO_TRAINER ? "Sin entrenador asignado" : (t?.name ?? "Entrenador no disponible");
      return { id, m, name, inactive: t ? !t.active : false };
    })
    // Orden alfabético (sin entrenador al final): no es un ranking.
    .sort((a, b) => Number(a.id === NO_TRAINER) - Number(b.id === NO_TRAINER) || a.name.localeCompare(b.name, "es") || a.id.localeCompare(b.id));
  return (
    <Card
      title="Planes por entrenador"
      subtitle="Distribución de los planes vigentes según el entrenador asignado al plan y seguimiento agregado de esos planes."
    >
      {rows.length === 0 ? (
        <Notice>No hay planes vigentes.</Notice>
      ) : (
        <Table
          head={[
            "Entrenador",
            "Planes vigentes",
            "Alumnos",
            ...(data.compliance ? ["Programados vencidos", "Completados", "Parciales", "Omitidos", "Sin registro", "Por revisar", "Cumplimiento"] : []),
          ]}
        >
          {rows.map((r) => (
            <tr key={r.id}>
              <Td strong>
                {r.name}
                {r.inactive && <span className="ml-1 text-xs text-zinc-400">(inactivo)</span>}
              </Td>
              <Td>{r.m.plans}</Td>
              <Td>{r.m.students}</Td>
              {data.compliance && (
                <>
                  <Td>{r.m.counts.scheduled}</Td>
                  <Td>{r.m.counts.completed}</Td>
                  <Td>{r.m.counts.partial}</Td>
                  <Td>{r.m.counts.skipped}</Td>
                  <Td>{r.m.counts.pending}</Td>
                  <Td>{r.m.toReview}</Td>
                  <Td>
                    <PctBar pct={r.m.pct} />
                  </Td>
                </>
              )}
            </tr>
          ))}
        </Table>
      )}
      <p className="text-xs text-zinc-500">
        La atribución es la del plan (entrenador asignado al plan semanal). Impartir una clase al alumno no convierte al
        entrenador en responsable de su plan. Estas cifras describen el registro de los planes; no son una evaluación del
        desempeño.
        {/* gym.classes apagado ⇒ sin enlace a un reporte que depende de clases. */}
        {classes && (
          <>
            {" "}Las clases impartidas se consultan en{" "}
            <Link href="/dashboard/reports/trainers/classes-taught" className="underline">
              Clases impartidas
            </Link>
            .
          </>
        )}
      </p>
    </Card>
  );
}

// ── E. Asistencia ────────────────────────────────────────────────

export function AttendanceSection({ data }: { data: TrainingAnalytics }) {
  const a = data.attendance;
  if (!a) return null;
  return (
    <Card title="Asistencia a clases" subtitle={`Registros de asistencia de los últimos ${PROGRESS_RANGES[data.range].label}, hasta hoy.`}>
      {!a.data ? (
        <Notice tone="amber">{INCOMPLETE}: hay más asistencias de las que se pueden leer en una consulta. No se muestran totales parciales.</Notice>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Stat label="Asistió" value={a.data.total.attended} hint="registros attended" />
            <Stat label="Llegó tarde" value={a.data.total.late} hint="registros late" />
            <Stat label="Asistencias confirmadas" value={a.data.total.confirmed} hint="asistió + llegó tarde" />
            <Stat label="Ausencias registradas" value={a.data.total.absent} hint="registros absent" />
          </div>
          <p className="text-xs text-zinc-500">
            Solo asistencias registradas en clases. Una reserva no es asistencia y un autorreporte de entrenamiento tampoco.
            No se calcula un porcentaje de asistencia: el sistema no registra cuántas clases se esperaban por alumno. Detalle
            por sesión en{" "}
            <Link href="/dashboard/reports/attendance/by-period" className="underline">
              Asistencia por período
            </Link>
            .
          </p>
        </>
      )}
    </Card>
  );
}

// ── F. Modalidades ───────────────────────────────────────────────

export function ModalitiesSection({ data }: { data: TrainingAnalytics }) {
  const c = data.current;
  if (!c) return null;
  const kinds = data.attendance?.data?.byKind ?? null;
  return (
    <Card title="Modalidades" subtitle="Dos agrupaciones distintas: planes por la modalidad actual del alumno y asistencias por el tipo de sesión.">
      <h3 className="text-sm font-semibold text-zinc-700">Planes vigentes por modalidad del alumno</h3>
      <Table head={["Modalidad del alumno", "Alumnos", "Planes vigentes", ...(data.compliance ? ["Programados vencidos", "Cumplimiento"] : [])]}>
        {c.byModality.map(({ key, metrics }) => (
          <tr key={key}>
            <Td strong>{MODALITY_LABELS[key]}</Td>
            <Td>{metrics.students}</Td>
            <Td>{metrics.plans}</Td>
            {data.compliance && (
              <>
                <Td>{metrics.counts.scheduled}</Td>
                <Td>
                  <PctBar pct={metrics.pct} />
                </Td>
              </>
            )}
          </tr>
        ))}
      </Table>
      {data.attendance && (
        <>
          <h3 className="text-sm font-semibold text-zinc-700">Asistencias por tipo de sesión</h3>
          {!kinds ? (
            <Notice tone="amber">{INCOMPLETE}</Notice>
          ) : (
            <Table head={["Tipo de sesión", "Asistió", "Llegó tarde", "Confirmadas", "Ausencias"]}>
              {kinds.map(({ kind, counts }) => (
                <tr key={kind}>
                  <Td strong>{SESSION_KIND_LABELS[kind]}</Td>
                  <Td>{counts.attended}</Td>
                  <Td>{counts.late}</Td>
                  <Td>{counts.confirmed}</Td>
                  <Td>{counts.absent}</Td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
      <p className="text-xs text-zinc-500">
        La modalidad del alumno es la de su ficha hoy (Normal, Personalizada o Grupal); no es el tipo de asignación del plan
        (individual o segmentada) ni la modalidad de una membresía. El tipo de sesión es el de la clase donde se registró la
        asistencia (los alumnos Normal reservan clases abiertas). Cada asistencia cuenta una vez por alumno y sesión; las
        actividades de una sesión grupal no se cuentan.
      </p>
    </Card>
  );
}

// ── Enlaces ──────────────────────────────────────────────────────

/** `classes` = gym.classes habilitado en el tenant efectivo; sin él no se enlazan reportes de clases. */
export function RelatedLinks({ classes }: { classes: boolean }) {
  const cls = "text-xs font-semibold text-zinc-700 border border-zinc-300 rounded-lg px-3 py-1.5 hover:bg-zinc-50";
  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/dashboard/weekly-plans/client-plans" className={cls}>
        Planes semanales
      </Link>
      {classes && (
        <>
          <Link href="/dashboard/reports/attendance/by-period" className={cls}>
            Asistencia por período
          </Link>
          <Link href="/dashboard/reports/trainers/classes-taught" className={cls}>
            Clases impartidas
          </Link>
        </>
      )}
    </div>
  );
}
