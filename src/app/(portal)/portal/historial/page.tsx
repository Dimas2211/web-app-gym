import { randomUUID } from "node:crypto";
import { requireClient } from "@/lib/permissions/guards";
import { getMyAttendance, loadPortalBookings, type PortalBookingView } from "@/modules/client-portal/queries";
import { openPortalContext } from "@/modules/client-portal/portal-context";
import {
  CANCELLATION_TYPE_LABELS,
  formatCalendarDate,
  SESSION_KIND_LABELS,
  sessionLocalTimes,
} from "@/modules/client-portal/portal-schedule";
import { loadGymBookingPolicy } from "@/modules/classes/booking/booking-service";
import { PortalAccessNotice } from "../portal-access-notice";
import { BookClassButton } from "../clases/book-class-button";

// GYM-BOOKINGS 3B — historial del alumno: reservas pasadas, canceladas y
// asistencia. Solo campos autorizados (sin training_notes, notas internas,
// motivo de cancelación del staff ni datos de otros alumnos). Única acción:
// «Cancelar» cuando cancelBooking la aceptaría (OPEN heredado en una sesión
// completed del mismo día; auditoría externa 3B, H02).

const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  attended: "Asistió",
  late: "Llegó tarde",
  absent: "No asistió",
  cancelled: "Cancelada",
};

const ATTENDANCE_BADGE: Record<string, string> = {
  attended: "bg-emerald-100 text-emerald-700",
  late: "bg-amber-100 text-amber-700",
  absent: "bg-red-100 text-red-600",
  cancelled: "bg-zinc-100 text-zinc-500",
};

const dateLabel = (d: string) => formatCalendarDate(d, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });

function pastStatus(b: PortalBookingView): string {
  if (b.evaluation.state === "CANCELLED") return "Clase cancelada";
  if (b.bookingStatus === "waitlisted") return "En espera";
  return "Confirmada";
}

function BookingTable({ rows, cancelled }: { rows: PortalBookingView[]; cancelled: boolean }) {
  const withActions = !cancelled && rows.some((b) => b.evaluation.canCancel);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100">
            <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Fecha</th>
            <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Hora</th>
            <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Sesión</th>
            <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Entrenador</th>
            <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Sucursal</th>
            <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Estado</th>
            {!cancelled && <th className="text-left text-xs text-zinc-400 font-semibold pb-2">Asistencia</th>}
            {withActions && <th className="pb-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {rows.map((b) => (
            <tr key={b.ownBookingId}>
              <td className="py-2.5 pr-4 text-zinc-600 whitespace-nowrap">{dateLabel(b.date)}</td>
              <td className="py-2.5 pr-4 text-zinc-600 whitespace-nowrap">
                {b.start} – {b.end}
              </td>
              <td className="py-2.5 pr-4">
                <p className="font-medium text-zinc-800">{b.typeName}</p>
                <p className="text-xs text-zinc-400">{SESSION_KIND_LABELS[b.kind]}</p>
              </td>
              <td className="py-2.5 pr-4 text-zinc-600">{b.trainerName}</td>
              <td className="py-2.5 pr-4 text-zinc-600">{b.branchName}</td>
              <td className="py-2.5 pr-4 text-zinc-600 whitespace-nowrap">
                {cancelled ? (b.ownCancellation ? CANCELLATION_TYPE_LABELS[b.ownCancellation] : "Cancelada") : pastStatus(b)}
              </td>
              {!cancelled && (
                <td className="py-2.5">
                  {b.attendance ? (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ATTENDANCE_BADGE[b.attendance]}`}>
                      {ATTENDANCE_STATUS_LABELS[b.attendance]}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400">Sin registro</span>
                  )}
                </td>
              )}
              {withActions && (
                <td className="py-2.5 pl-4 text-right">
                  {b.evaluation.canCancel && (
                    <BookClassButton
                      classId={b.id}
                      bookKey={randomUUID()}
                      cancelKey={randomUUID()}
                      bookingId={b.ownBookingId}
                      canBook={false}
                      canCancel
                      cancelWarning={b.evaluation.cancelWarning}
                    />
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function HistorialPage() {
  const sessionUser = await requireClient();
  const access = await openPortalContext(sessionUser, { module: "gym.classes" });
  if (!access.ok) return <PortalAccessNotice title="Historial" denied={access} />;
  const { context, client, dispose } = access;

  try {
    const ref = { id: client.id, branch_id: client.branch_id, modality: client.modality, status: client.status };
    const [bookings, attendance, policy] = await Promise.all([
      loadPortalBookings({ db: context.client, tenantId: context.tenantId, client: ref }),
      getMyAttendance(client.id, context.client, context.tenantId),
      loadGymBookingPolicy(context.client, context.tenantId),
    ]);

    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-zinc-800">Historial</h1>

        {/* Asistencia registrada */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">Asistencia registrada</p>
          {attendance.length === 0 ? (
            <p className="text-sm text-zinc-500">No hay asistencia registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Fecha</th>
                    <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Sesión</th>
                    <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Entrenador</th>
                    <th className="text-left text-xs text-zinc-400 font-semibold pb-2">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {attendance.map((a) => {
                    const local = sessionLocalTimes(a.scheduled_class, policy.timezone);
                    return (
                      <tr key={a.id}>
                        <td className="py-2.5 pr-4 text-zinc-600 whitespace-nowrap">
                          {dateLabel(local.date)} · {local.start}
                        </td>
                        <td className="py-2.5 pr-4">
                          <p className="font-medium text-zinc-800">{a.scheduled_class.class_type.name}</p>
                          <p className="text-xs text-zinc-400">
                            {SESSION_KIND_LABELS[a.scheduled_class.session_kind]} · {a.scheduled_class.branch.name}
                          </p>
                        </td>
                        <td className="py-2.5 pr-4 text-zinc-600">
                          {a.scheduled_class.trainer.first_name} {a.scheduled_class.trainer.last_name}
                        </td>
                        <td className="py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ATTENDANCE_BADGE[a.attendance_status]}`}>
                            {ATTENDANCE_STATUS_LABELS[a.attendance_status]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Reservas pasadas */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">Reservas pasadas</p>
          {bookings.past.length === 0 ? (
            <p className="text-sm text-zinc-500">No hay reservas pasadas.</p>
          ) : (
            <BookingTable rows={bookings.past} cancelled={false} />
          )}
        </div>

        {/* Reservas canceladas */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">Reservas canceladas</p>
          {bookings.cancelled.length === 0 ? (
            <p className="text-sm text-zinc-500">No hay reservas canceladas.</p>
          ) : (
            <BookingTable rows={bookings.cancelled} cancelled />
          )}
        </div>
      </div>
    );
  } finally {
    await dispose();
  }
}
