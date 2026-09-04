import Link from "next/link";
import { requireClassViewer } from "@/lib/permissions/guards";
import {
  getScheduledClasses,
  getUpcomingClasses,
  getTrainerOptionsForClass,
  getLinkedTrainerId,
} from "@/modules/classes/queries";
import {
  toggleScheduledClassStatusAction,
  deleteScheduledClassAction,
} from "@/modules/classes/actions";
import { CLASS_STATUS_LABELS, CLASS_STATUS_COLORS } from "@/lib/utils/labels";
import { DeleteClassButton } from "./_components/delete-class-button";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";

type Props = {
  searchParams: Promise<{
    date?: string;
    branch_id?: string;
    trainer_id?: string;
    status?: string;
    error?: string;
    view?: string;
  }>;
};

function formatDateDisplay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatDateHeader(date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const d = new Date(year, month, day);
  return d.toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function CapacityBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const color =
    pct >= 100 ? "bg-red-500" : pct >= 75 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-zinc-500">
        {used}/{total}
      </span>
    </div>
  );
}

export default async function ClassesAgendaPage({ searchParams }: Props) {
  const sessionUser = await requireClassViewer();
  await requireOrganizationModule(sessionUser.tenant_id, "gym.classes");
  const sp = await searchParams;

  const sp1 = (v: string | string[] | undefined): string | undefined => {
    const s = Array.isArray(v) ? v.find((x) => x !== "") : v;
    return s === "" ? undefined : s;
  };

  const today = new Date().toISOString().split("T")[0];
  const selectedDate = sp1(sp.date) ?? today;
  const prevDate = offsetDate(selectedDate, -1);
  const nextDate = offsetDate(selectedDate, 1);
  const viewMode = sp1(sp.view) === "upcoming" ? "upcoming" : "day";

  const isAdmin = sessionUser.role === "super_admin" || sessionUser.role === "branch_admin";
  const isTrainer = sessionUser.role === "trainer";

  let forcedTrainerId: string | null = null;
  if (isTrainer) {
    forcedTrainerId = await getLinkedTrainerId(sessionUser.id, sessionUser.tenant_id);
  }

  const [classes, trainers] = await Promise.all([
    viewMode === "upcoming"
      ? getUpcomingClasses(sessionUser, {
          trainer_id: isTrainer ? (forcedTrainerId ?? "__none__") : sp1(sp.trainer_id),
          status: sp1(sp.status),
        })
      : getScheduledClasses(sessionUser, {
          date: selectedDate,
          branch_id: sp1(sp.branch_id),
          trainer_id: isTrainer ? (forcedTrainerId ?? "__none__") : sp1(sp.trainer_id),
          status: sp1(sp.status),
        }),
    isAdmin ? getTrainerOptionsForClass(sessionUser) : Promise.resolve([]),
  ]);

  if (isTrainer && !forcedTrainerId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-800">Mis clases</h1>
          <p className="text-sm text-zinc-500 mt-0.5 capitalize">{formatDateDisplay(selectedDate)}</p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-10 text-center">
          <p className="text-zinc-500 text-sm">Tu cuenta no tiene un perfil de entrenador vinculado.</p>
          <p className="text-zinc-400 text-xs mt-1">Contacta al administrador para asociar tu perfil.</p>
        </div>
      </div>
    );
  }

  const errorMsg = sp1(sp.error);

  // Agrupar clases por fecha para la vista "Próximas"
  const byDate = new Map<string, typeof classes>();
  if (viewMode === "upcoming") {
    for (const cls of classes) {
      const d = cls.class_date;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(cls);
    }
  }

  // ── Tarjeta de clase reutilizable ────────────────────────────
  function ClassCard({
    c,
    dateForDelete,
    viewForDelete,
  }: {
    c: (typeof classes)[0];
    dateForDelete: string;
    viewForDelete?: string;
  }) {
    const confirmedCount = c._count.bookings;
    const attendanceCount = c._count.attendance;
    const available = c.capacity - confirmedCount;
    const statusKey = c.status as keyof typeof CLASS_STATUS_LABELS;
    const isDeletable = confirmedCount === 0 && attendanceCount === 0;

    return (
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 hover:border-zinc-300 transition-colors">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-semibold text-zinc-800">
                {c.start_time} – {c.end_time}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${CLASS_STATUS_COLORS[statusKey]}`}
              >
                {CLASS_STATUS_LABELS[statusKey]}
              </span>
              {c.is_personalized && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                  Personalizada
                </span>
              )}
            </div>
            <Link
              href={`/dashboard/classes/${c.id}`}
              className="text-base font-semibold text-zinc-800 hover:text-zinc-600 transition-colors"
            >
              {c.title}
            </Link>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-zinc-500">{c.class_type.name}</span>
              {!isTrainer && (
                <>
                  <span className="text-xs text-zinc-400">·</span>
                  <span className="text-xs text-zinc-500">
                    {c.trainer.first_name} {c.trainer.last_name}
                  </span>
                </>
              )}
              {sessionUser.role === "super_admin" && (
                <>
                  <span className="text-xs text-zinc-400">·</span>
                  <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">
                    {c.branch.name}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <CapacityBar used={confirmedCount} total={c.capacity} />
              <p className="text-xs text-zinc-400 mt-1">
                {available > 0 ? `${available} cupos libres` : "Sin cupo"}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <Link
                href={`/dashboard/classes/${c.id}`}
                className="text-xs text-zinc-600 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors text-center"
              >
                Ver
              </Link>
              {isAdmin && (
                <>
                  {c.status !== "cancelled" && (
                    <Link
                      href={`/dashboard/classes/${c.id}/edit`}
                      className="text-xs text-zinc-600 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors text-center"
                    >
                      Editar
                    </Link>
                  )}
                  {c.status !== "cancelled" ? (
                    <form action={toggleScheduledClassStatusAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        type="submit"
                        title="La clase quedará cancelada y no aparecerá en la agenda principal."
                        className="w-full text-xs px-2.5 py-1 rounded border text-amber-700 border-amber-200 hover:bg-amber-50 transition-colors"
                      >
                        Cancelar
                      </button>
                    </form>
                  ) : (
                    <form action={toggleScheduledClassStatusAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        type="submit"
                        className="w-full text-xs px-2.5 py-1 rounded border text-emerald-700 border-emerald-200 hover:bg-emerald-50 transition-colors"
                      >
                        Reactivar
                      </button>
                    </form>
                  )}
                  {isDeletable && (
                    <DeleteClassButton
                      id={c.id}
                      date={dateForDelete}
                      view={viewForDelete}
                      action={deleteScheduledClassAction}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-800">
            {isTrainer ? "Mis clases" : "Agenda de clases"}
          </h1>
          {viewMode === "day" && (
            <p className="text-sm text-zinc-500 mt-0.5 capitalize">
              {formatDateDisplay(selectedDate)}
            </p>
          )}
          {viewMode === "upcoming" && (
            <p className="text-sm text-zinc-500 mt-0.5">
              Próximas {classes.length} clase(s) programadas
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle de vista */}
          <div className="flex rounded-lg border border-zinc-300 overflow-hidden text-sm">
            <Link
              href={`/dashboard/classes?date=${today}`}
              className={`px-3 py-1.5 transition-colors ${
                viewMode === "day"
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              Vista día
            </Link>
            <Link
              href="/dashboard/classes?view=upcoming"
              className={`px-3 py-1.5 border-l border-zinc-300 transition-colors ${
                viewMode === "upcoming"
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              Próximas
            </Link>
          </div>

          {isAdmin && (
            <Link
              href="/dashboard/classes/types"
              className="text-sm text-zinc-600 border border-zinc-300 px-3 py-1.5 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              Tipos de clase
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/dashboard/classes/new"
              className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
            >
              + Programar clase
            </Link>
          )}
        </div>
      </div>

      {/* Error de operación */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {errorMsg}
        </div>
      )}

      {/* ── VISTA DÍA ─────────────────────────────────────────── */}
      {viewMode === "day" && (
        <>
          {/* Navegación de fecha + filtros */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-1">
              <Link
                href={`/dashboard/classes?date=${prevDate}${!isTrainer && sp1(sp.trainer_id) ? `&trainer_id=${sp1(sp.trainer_id)}` : ""}`}
                className="text-sm px-3 py-2 rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                ←
              </Link>
              <Link
                href={`/dashboard/classes?date=${today}`}
                className={`text-sm px-3 py-2 rounded-lg border transition-colors ${
                  selectedDate === today
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                Hoy
              </Link>
              <Link
                href={`/dashboard/classes?date=${nextDate}${!isTrainer && sp1(sp.trainer_id) ? `&trainer_id=${sp1(sp.trainer_id)}` : ""}`}
                className="text-sm px-3 py-2 rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                →
              </Link>
            </div>

            <form method="get" className="flex items-end gap-2 flex-wrap">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Fecha</label>
                <input
                  type="date"
                  name="date"
                  defaultValue={selectedDate}
                  className="border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                />
              </div>
              {isAdmin && (
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Entrenador</label>
                  <select
                    name="trainer_id"
                    defaultValue={sp.trainer_id ?? ""}
                    className="border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  >
                    <option value="">Todos</option>
                    {trainers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.first_name} {t.last_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Estado</label>
                <select
                  name="status"
                  defaultValue={sp.status ?? ""}
                  className="border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
                >
                  <option value="">Activas</option>
                  <option value="scheduled">Programada</option>
                  <option value="in_progress">En curso</option>
                  <option value="completed">Completada</option>
                  <option value="cancelled">Cancelada</option>
                  <option value="all">Todas</option>
                </select>
              </div>
              <button
                type="submit"
                className="bg-zinc-100 border border-zinc-300 text-zinc-700 px-4 py-2 rounded-lg text-sm hover:bg-zinc-200 transition-colors"
              >
                Filtrar
              </button>
            </form>
          </div>

          {/* Lista día */}
          {classes.length === 0 ? (
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-10 text-center">
              <p className="text-zinc-400 text-sm">
                {isTrainer
                  ? "No tienes clases activas para esta fecha."
                  : sp1(sp.status) === "cancelled"
                  ? "No hay clases canceladas para esta fecha."
                  : sp1(sp.status) === "all"
                  ? "No hay clases registradas para esta fecha."
                  : "No hay clases activas para esta fecha."}
              </p>
              {isAdmin && sp1(sp.status) !== "cancelled" && (
                <Link
                  href={`/dashboard/classes/new?date=${selectedDate}`}
                  className="inline-block mt-4 text-sm text-zinc-600 border border-zinc-300 px-4 py-2 rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  Programar clase para este día
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {classes.map((c) => (
                <ClassCard
                  key={c.id}
                  c={c}
                  dateForDelete={selectedDate}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── VISTA PRÓXIMAS ────────────────────────────────────── */}
      {viewMode === "upcoming" && (
        <>
          {/* Filtros sin date picker */}
          <form method="get" className="flex items-end gap-2 flex-wrap">
            <input type="hidden" name="view" value="upcoming" />
            {isAdmin && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Entrenador</label>
                <select
                  name="trainer_id"
                  defaultValue={sp.trainer_id ?? ""}
                  className="border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
                >
                  <option value="">Todos</option>
                  {trainers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.first_name} {t.last_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Estado</label>
              <select
                name="status"
                defaultValue={sp.status ?? ""}
                className="border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
              >
                <option value="">Activas</option>
                <option value="scheduled">Programada</option>
                <option value="in_progress">En curso</option>
                <option value="completed">Completada</option>
                <option value="cancelled">Cancelada</option>
                <option value="all">Todas</option>
              </select>
            </div>
            <button
              type="submit"
              className="bg-zinc-100 border border-zinc-300 text-zinc-700 px-4 py-2 rounded-lg text-sm hover:bg-zinc-200 transition-colors"
            >
              Filtrar
            </button>
          </form>

          {/* Lista agrupada por fecha */}
          {classes.length === 0 ? (
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-10 text-center">
              <p className="text-zinc-400 text-sm">
                No hay clases próximas programadas.
              </p>
              {isAdmin && (
                <Link
                  href="/dashboard/classes/new"
                  className="inline-block mt-4 text-sm text-zinc-600 border border-zinc-300 px-4 py-2 rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  Programar clase
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {Array.from(byDate.entries()).map(([dateKey, dayClasses]) => (
                <div key={dateKey} className="space-y-3">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide capitalize">
                    {formatDateHeader(new Date(dayClasses[0].class_date))}
                  </p>
                  {dayClasses.map((c) => (
                    <ClassCard
                      key={c.id}
                      c={c}
                      dateForDelete={dateKey}
                      viewForDelete="upcoming"
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
