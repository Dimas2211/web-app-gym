import { requireClient } from "@/lib/permissions/guards";
import { getClientByUserId, getMyBookings, getMyAttendance } from "@/modules/client-portal/queries";

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const BOOKING_STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  waitlisted: "En espera",
};

const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  attended: "Asistió",
  absent: "Ausente",
  late: "Tarde",
  cancelled: "Cancelada",
};

export default async function HistorialPage() {
  const sessionUser = await requireClient();
  const client = await getClientByUserId(sessionUser.id);

  if (!client) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-zinc-800">Historial</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-800 font-medium">Perfil de cliente no configurado.</p>
        </div>
      </div>
    );
  }

  const [bookings, attendance] = await Promise.all([
    getMyBookings(client.id),
    getMyAttendance(client.id),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pastBookings = bookings.filter(
    (b) => new Date(b.scheduled_class.class_date) < today
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-zinc-800">Historial</h1>

      {/* Asistencia registrada */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
          Asistencia registrada
        </p>
        {attendance.length === 0 ? (
          <p className="text-sm text-zinc-500">No hay asistencia registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Clase</th>
                  <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Fecha</th>
                  <th className="text-left text-xs text-zinc-400 font-semibold pb-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {attendance.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2.5 pr-4 font-medium text-zinc-800">
                      {a.scheduled_class.class_type.name}
                    </td>
                    <td className="py-2.5 pr-4 text-zinc-600">
                      {formatDate(a.scheduled_class.class_date)}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          a.attendance_status === "attended"
                            ? "bg-emerald-100 text-emerald-700"
                            : a.attendance_status === "late"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {ATTENDANCE_STATUS_LABELS[a.attendance_status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reservas pasadas */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
          Reservas pasadas
        </p>
        {pastBookings.length === 0 ? (
          <p className="text-sm text-zinc-500">No hay reservas pasadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Clase</th>
                  <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Fecha</th>
                  <th className="text-left text-xs text-zinc-400 font-semibold pb-2 pr-4">Hora</th>
                  <th className="text-left text-xs text-zinc-400 font-semibold pb-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {pastBookings.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2.5 pr-4 font-medium text-zinc-800">
                      {b.scheduled_class.class_type.name}
                    </td>
                    <td className="py-2.5 pr-4 text-zinc-600">
                      {formatDate(b.scheduled_class.class_date)}
                    </td>
                    <td className="py-2.5 pr-4 text-zinc-600">
                      {b.scheduled_class.start_time}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          b.booking_status === "confirmed"
                            ? "bg-emerald-100 text-emerald-700"
                            : b.booking_status === "cancelled"
                            ? "bg-zinc-100 text-zinc-500"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {BOOKING_STATUS_LABELS[b.booking_status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
