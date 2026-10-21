import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClassViewer, canManageClass } from "@/lib/permissions/guards";
import {
  getScheduledClassById,
  getAvailableClientsForBooking,
  getLinkedTrainerId,
} from "@/modules/classes/queries";
import {
  cancelBookingAction,
  recordAttendanceAction,
  createBookingAction,
} from "@/modules/classes/actions";
import { BookingForm } from "@/components/forms/booking-form";
import {
  CLASS_STATUS_LABELS,
  CLASS_STATUS_COLORS,
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_COLORS,
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_COLORS,
} from "@/lib/utils/labels";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";
import { resolveLinkedTrainer, TRAINER_PROFILE_MISSING_MESSAGE } from "@/modules/classes/trainer/trainer-access";
import { getSessionTrainingDetail } from "@/modules/classes/trainer/trainer-queries";
import { TrainerNoticeView } from "../_components/trainer-agenda";
import { FlashMessages, TrainerSessionView } from "../_components/trainer-session-view";
import { SessionTrainingPanel, WindowBanner, trainingWindow } from "../_components/session-training-panel";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string | string[]; notice?: string | string[] }>;
};

/** GYM-4: vista del entrenador de SU sesión (rol LIVE + Trainer activo vinculado + asignación). */
async function renderTrainerSession(
  sessionUser: Awaited<ReturnType<typeof requireClassViewer>>,
  context: Awaited<ReturnType<typeof resolveEffectiveTenantContext>>["context"],
  id: string,
  flash: { error?: string; notice?: string }
) {
  if (context.effectiveRole !== "trainer") {
    return <TrainerNoticeView title="Clase" message="Tu rol cambió. Vuelve a iniciar sesión para continuar." />;
  }
  const trainer = await resolveLinkedTrainer(context.client, sessionUser.id, context.tenantId);
  if (!trainer) return <TrainerNoticeView title="Clase" message={TRAINER_PROFILE_MISSING_MESSAGE} />;
  const detail = await getSessionTrainingDetail(context.client, context.tenantId, id, { includePrivateNotes: true });
  // Sesión de otro entrenador, sede o tenant: indistinguible de inexistente.
  if (!detail || detail.session.trainer.id !== trainer.id) notFound();
  const win = trainingWindow(detail, "TRAINER", "trainer", new Date());
  return <TrainerSessionView detail={detail} win={win} error={flash.error} notice={flash.notice} />;
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("es-MX", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function ScheduledClassDetailPage({ params, searchParams }: Props) {
  const sessionUser = await requireClassViewer();
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const errorMsg = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const noticeMsg = Array.isArray(sp.notice) ? sp.notice[0] : sp.notice;

  // PASO 6D: tenant/PrismaClient EFECTIVOS bajo sesión runtime "Operar como
  // cliente". El guard corre ANTES de buscar el registro; la búsqueda usa
  // context.client, con lo que un ID de otro tenant nunca puede resolverse.
  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  const effectiveUser = context.runtime
    ? { ...sessionUser, tenant_id: context.tenantId }
    : sessionUser;

  try {
    await requireOrganizationModule(context.tenantId, "gym.classes");

    if (!context.runtime && (context.effectiveRole === "trainer" || sessionUser.role === "trainer")) {
      return await renderTrainerSession(sessionUser, context, id, { error: errorMsg, notice: noticeMsg });
    }

    const isTrainer = !context.runtime && sessionUser.role === "trainer";

    const [scheduledClass, availableClients] = await Promise.all([
      getScheduledClassById(id, effectiveUser, context.client),
      !isTrainer
        ? getAvailableClientsForBooking(id, effectiveUser, context.client)
        : Promise.resolve([]),
    ]);

    if (!scheduledClass) notFound();

    // Trainer solo puede ver sus propias clases
    if (isTrainer) {
      const linkedId = await getLinkedTrainerId(sessionUser.id, effectiveUser.tenant_id, context.client);
      if (!linkedId || scheduledClass.trainer.id !== linkedId) notFound();
    }

    if (!isTrainer && !canManageClass(sessionUser, scheduledClass)) notFound();

    const confirmedBookings = scheduledClass.bookings.filter(
      (b) => b.booking_status === "confirmed"
    );
    const cancelledBookings = scheduledClass.bookings.filter(
      (b) => b.booking_status === "cancelled"
    );
    const available = scheduledClass.capacity - confirmedBookings.length;
    const pct =
      scheduledClass.capacity > 0
        ? Math.round((confirmedBookings.length / scheduledClass.capacity) * 100)
        : 0;

    const attendanceMap = new Map(
      scheduledClass.attendance.map((a) => [a.client_id, a])
    );

    const isAdmin =
      sessionUser.role === "super_admin" || sessionUser.role === "branch_admin";
    // canOperate se fuerza a false en modo runtime: la sesión es siempre solo lectura.
    const canOperate = !context.runtime && canManageClass(sessionUser, scheduledClass);
    const classStatus = scheduledClass.status as keyof typeof CLASS_STATUS_LABELS;
    const isCancelled = scheduledClass.status === "cancelled";

    // GYM-4: registro de entrenamiento (actividades y notas R36) solo para
    // SA/BA con rol LIVE y alcance sobre la clase. Recepción no lo ve.
    const liveAdmin = context.effectiveRole === "super_admin" || context.effectiveRole === "branch_admin";
    const training =
      canOperate && liveAdmin
        ? await getSessionTrainingDetail(context.client, context.tenantId, id, { includePrivateNotes: true })
        : null;
    const trainingWin = training ? trainingWindow(training, "STAFF", context.effectiveRole, new Date()) : null;

    return (
      <div className="space-y-6">
        {/* Error de operación (acciones de reserva/asistencia, GYM-BOOKINGS 2B) */}
        <FlashMessages error={errorMsg} notice={noticeMsg} />

        {/* Breadcrumb + acciones */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Link href="/dashboard/classes" className="hover:text-zinc-800 transition-colors">
              Agenda
            </Link>
            <span>/</span>
            <span className="text-zinc-800 font-medium">{scheduledClass.title}</span>
          </div>
          {isAdmin && canOperate && !isCancelled && (
            <Link
              href={`/dashboard/classes/${id}/edit`}
              className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
            >
              Editar clase
            </Link>
          )}
        </div>

        {/* Encabezado de la clase */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold ${CLASS_STATUS_COLORS[classStatus]}`}
                >
                  {CLASS_STATUS_LABELS[classStatus]}
                </span>
                {scheduledClass.is_personalized && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 font-medium">
                    Personalizada
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-zinc-800">{scheduledClass.title}</h1>
              <p className="text-sm text-zinc-500 mt-0.5">{scheduledClass.class_type.name}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-zinc-800">
                {scheduledClass.start_time} – {scheduledClass.end_time}
              </p>
              <p className="text-sm text-zinc-500 mt-0.5 capitalize">
                {formatDate(scheduledClass.class_date)}
              </p>
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Cupo */}
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4">
            <p className="text-xs text-zinc-400 mb-2">Cupo</p>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-zinc-800">{confirmedBookings.length}</span>
              <span className="text-zinc-400 text-sm mb-1">/ {scheduledClass.capacity}</span>
            </div>
            <div className="mt-2 h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 75 ? "bg-amber-400" : "bg-emerald-400"}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {available > 0 ? `${available} cupos disponibles` : "Sin cupo disponible"}
            </p>
          </div>

          {/* Entrenador */}
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4">
            <p className="text-xs text-zinc-400 mb-2">Entrenador</p>
            <Link
              href={`/dashboard/trainers/${scheduledClass.trainer_id}`}
              className="font-semibold text-zinc-800 hover:text-zinc-600 transition-colors"
            >
              {scheduledClass.trainer.first_name} {scheduledClass.trainer.last_name}
            </Link>
            {scheduledClass.trainer.specialty && (
              <p className="text-xs text-zinc-400 mt-1">{scheduledClass.trainer.specialty}</p>
            )}
          </div>

          {/* Sucursal y sala */}
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4">
            <p className="text-xs text-zinc-400 mb-2">Sucursal</p>
            <p className="font-semibold text-zinc-800">{scheduledClass.branch.name}</p>
            {scheduledClass.room_name && (
              <p className="text-xs text-zinc-400 mt-1">Sala: {scheduledClass.room_name}</p>
            )}
          </div>
        </div>

        {/* Notas */}
        {scheduledClass.notes && (
          <Section title="Notas">
            <p className="text-sm text-zinc-700 whitespace-pre-wrap">{scheduledClass.notes}</p>
          </Section>
        )}

        {/* Reservas confirmadas */}
        <Section
          title={`Reservas confirmadas · ${confirmedBookings.length}`}
          action={
            canOperate && !isCancelled && available > 0 ? (
              <span className="text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                {available} cupos libres
              </span>
            ) : available === 0 && !isCancelled ? (
              <span className="text-xs text-red-600 bg-red-50 px-2.5 py-1 rounded-full">Lleno</span>
            ) : null
          }
        >
          {confirmedBookings.length === 0 ? (
            <p className="text-sm text-zinc-400">No hay reservas confirmadas.</p>
          ) : (
            <div className="space-y-2">
              {confirmedBookings.map((b) => {
                const att = attendanceMap.get(b.client_id);
                const attStatus = att?.attendance_status as keyof typeof ATTENDANCE_STATUS_LABELS | undefined;
                return (
                  <div
                    key={b.id}
                    className="flex items-center justify-between gap-3 py-2 border-b border-zinc-100 last:border-0 flex-wrap"
                  >
                    <div>
                      <Link
                        href={`/dashboard/clients/${b.client.id}`}
                        className="text-sm font-medium text-zinc-700 hover:text-zinc-900 transition-colors"
                      >
                        {b.client.first_name} {b.client.last_name}
                      </Link>
                      {b.client.email && (
                        <p className="text-xs text-zinc-400 mt-0.5">{b.client.email}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Badge de asistencia actual */}
                      {attStatus && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${ATTENDANCE_STATUS_COLORS[attStatus]}`}
                        >
                          {ATTENDANCE_STATUS_LABELS[attStatus]}
                        </span>
                      )}

                      {/* Marcar asistencia */}
                      {canOperate && !isCancelled && (
                        <div className="flex items-center gap-1">
                          {(["attended", "absent", "late"] as const).map((status) => (
                            <form key={status} action={recordAttendanceAction}>
                              {/* GYM-BOOKINGS 2B: una clave por orden (doble clic = replay). */}
                              <input type="hidden" name="idempotency_key" value={randomUUID()} />
                              <input type="hidden" name="scheduled_class_id" value={id} />
                              <input type="hidden" name="client_id" value={b.client.id} />
                              <input type="hidden" name="attendance_status" value={status} />
                              <button
                                type="submit"
                                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                                  attStatus === status
                                    ? "bg-zinc-800 text-white border-zinc-800"
                                    : "text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                                }`}
                              >
                                {status === "attended" ? "✓" : status === "absent" ? "✗" : "T"}
                              </button>
                            </form>
                          ))}
                        </div>
                      )}

                      {/* Cancelar reserva */}
                      {canOperate && !isCancelled && (
                        <form action={cancelBookingAction} className="flex items-center gap-1">
                          <input type="hidden" name="idempotency_key" value={randomUUID()} />
                          <input type="hidden" name="scheduled_class_id" value={id} />
                          <input type="hidden" name="booking_id" value={b.id} />
                          <input
                            type="text"
                            name="reason"
                            maxLength={500}
                            placeholder="Motivo"
                            aria-label="Motivo de la cancelación"
                            className="text-xs w-28 border border-zinc-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-zinc-300"
                          />
                          <button
                            type="submit"
                            className="text-xs text-red-600 border border-red-200 px-2 py-0.5 rounded hover:bg-red-50 transition-colors"
                          >
                            Cancelar reserva
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Agregar reserva */}
        {canOperate && !isCancelled && available > 0 && (
          <Section title="Agregar reserva">
            <BookingForm
              idempotencyKey={randomUUID()}
              scheduledClassId={id}
              clients={availableClients}
              action={createBookingAction}
            />
          </Section>
        )}

        {/* Resumen de asistencia */}
        {scheduledClass.attendance.length > 0 && (
          <Section title={`Asistencia · ${scheduledClass.attendance.length}`}>
            <div className="flex flex-wrap gap-3">
              {(["attended", "absent", "late", "cancelled"] as const).map((s) => {
                const count = scheduledClass.attendance.filter(
                  (a) => a.attendance_status === s
                ).length;
                if (count === 0) return null;
                return (
                  <div
                    key={s}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium ${ATTENDANCE_STATUS_COLORS[s]}`}
                  >
                    {ATTENDANCE_STATUS_LABELS[s]}: {count}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* GYM-4 — registro de entrenamiento (SA/BA) */}
        {training && trainingWin && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Registro de entrenamiento</h2>
            <WindowBanner win={trainingWin} timeZone={training.policy.timezone} />
            <SessionTrainingPanel detail={training} win={trainingWin} showAttendanceControls={false} includePrivateNotes />
          </div>
        )}

        {/* Reservas canceladas */}
        {cancelledBookings.length > 0 && (
          <Section title={`Reservas canceladas · ${cancelledBookings.length}`}>
            <div className="space-y-1">
              {cancelledBookings.map((b) => (
                <div key={b.id} className="flex items-center gap-3 py-1.5">
                  <span className="text-sm text-zinc-400">
                    {b.client.first_name} {b.client.last_name}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${BOOKING_STATUS_COLORS["cancelled"]}`}
                  >
                    {BOOKING_STATUS_LABELS["cancelled"]}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Auditoría */}
        <div className="text-xs text-zinc-400 text-right">
          Creado:{" "}
          {new Date(scheduledClass.created_at).toLocaleDateString("es-MX", {
            year: "numeric", month: "long", day: "numeric",
          })}
          {scheduledClass.creator && ` · por ${scheduledClass.creator.first_name} ${scheduledClass.creator.last_name}`}
        </div>
      </div>
    );
  } finally {
    await dispose();
  }
}
