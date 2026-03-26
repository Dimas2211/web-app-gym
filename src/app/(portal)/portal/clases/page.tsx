import { requireClient } from "@/lib/permissions/guards";
import {
  getClientByUserId,
  getAvailableClasses,
  getMyBookings,
} from "@/modules/client-portal/queries";
import { BookClassButton } from "./book-class-button";

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export default async function ClasesPage() {
  const sessionUser = await requireClient();
  const client = await getClientByUserId(sessionUser.id);

  if (!client) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-zinc-800">Clases disponibles</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-800 font-medium">Perfil de cliente no configurado.</p>
        </div>
      </div>
    );
  }

  const [classes, myBookings] = await Promise.all([
    getAvailableClasses(client.branch_id),
    getMyBookings(client.id),
  ]);

  // Mapa de classId → estado de reserva del cliente
  const bookingMap = new Map<string, string>();
  for (const b of myBookings) {
    bookingMap.set(b.scheduled_class_id, b.booking_status);
  }

  // Verificar membresía activa
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Agrupar por fecha
  const byDate = new Map<string, typeof classes>();
  for (const cls of classes) {
    const key = cls.class_date.toString().slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(cls);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-800">Clases disponibles</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Sucursal: {client.branch.name} · Próximas {classes.length} clase(s)
        </p>
      </div>

      {classes.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 text-center">
          <p className="text-zinc-500">No hay clases programadas próximamente en tu sucursal.</p>
        </div>
      ) : (
        Array.from(byDate.entries()).map(([dateKey, dayClasses]) => (
          <div key={dateKey} className="space-y-2">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
              {formatDate(dateKey)}
            </p>
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm divide-y divide-zinc-100">
              {dayClasses.map((cls) => {
                const confirmedCount = cls.bookings.length;
                const isFull = confirmedCount >= cls.capacity;
                const myStatus = bookingMap.get(cls.id);
                const isConfirmed = myStatus === "confirmed";
                const bookingId = myBookings.find(
                  (b) => b.scheduled_class_id === cls.id && b.booking_status === "confirmed"
                )?.id;

                return (
                  <div key={cls.id} className="p-4 flex items-start gap-4">
                    {/* Hora */}
                    <div className="text-center shrink-0 w-16">
                      <p className="text-sm font-bold text-zinc-800">{cls.start_time}</p>
                      <p className="text-xs text-zinc-400">{cls.end_time}</p>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-zinc-800 truncate">
                        {cls.title}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {cls.class_type.name} ·{" "}
                        {cls.trainer.first_name} {cls.trainer.last_name}
                      </p>
                      {cls.room_name && (
                        <p className="text-xs text-zinc-400">{cls.room_name}</p>
                      )}
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {confirmedCount}/{cls.capacity} lugares ocupados
                      </p>
                    </div>

                    {/* Acción */}
                    <div className="shrink-0">
                      <BookClassButton
                        classId={cls.id}
                        bookingId={bookingId}
                        isConfirmed={isConfirmed}
                        isFull={isFull && !isConfirmed}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Mis reservas próximas */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
          Mis reservas próximas
        </p>
        {myBookings.filter(
          (b) =>
            b.booking_status === "confirmed" &&
            new Date(b.scheduled_class.class_date) >= today
        ).length === 0 ? (
          <p className="text-sm text-zinc-500">No tienes reservas confirmadas próximas.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {myBookings
              .filter(
                (b) =>
                  b.booking_status === "confirmed" &&
                  new Date(b.scheduled_class.class_date) >= today
              )
              .map((booking) => (
                <li key={booking.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-800">
                      {booking.scheduled_class.class_type.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatDate(booking.scheduled_class.class_date)} ·{" "}
                      {booking.scheduled_class.start_time}
                    </p>
                  </div>
                  <BookClassButton
                    classId={booking.scheduled_class_id}
                    bookingId={booking.id}
                    isConfirmed={true}
                    isFull={false}
                  />
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
