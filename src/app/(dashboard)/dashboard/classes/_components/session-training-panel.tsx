// GYM-4 — registro de entrenamiento de una sesión: asistencia (canal
// TRAINER), actividades comunes, actividades individuales y notas privadas.
// Lo usan la vista del entrenador y, sin los botones de asistencia, el
// detalle administrativo (SA/BA). Ocultar un control es solo presentación:
// cada Server Action revalida rol LIVE, asignación, ventana y tenant.

import { randomUUID } from "node:crypto";
import type { GymBookingChannel } from "@prisma/client";
import {
  addAttendanceActivityAction,
  addSessionActivityAction,
  saveTrainingNotesAction,
  trainerRecordAttendanceAction,
} from "@/modules/classes/trainer-actions";
import {
  checkAttendanceAccess,
  checkTrainingRecordAccess,
  resolveSessionInstants,
} from "@/modules/classes/booking/booking-eligibility";
import type { SessionTrainingDetail } from "@/modules/classes/trainer/trainer-queries";

export const TRAINER_ATTENDANCE_LABELS = {
  attended: "Asistió",
  late: "Llegó tarde",
  absent: "No asistió",
  cancelled: "Cancelada",
} as const;

const ATTENDANCE_BADGE = {
  attended: "bg-emerald-100 text-emerald-800",
  late: "bg-amber-100 text-amber-800",
  absent: "bg-red-100 text-red-800",
  cancelled: "bg-zinc-100 text-zinc-600",
} as const;

const HOUR = 3_600_000;

export type TrainingWindow =
  | { state: "open"; closesAt: Date | null; administrativeCorrection: boolean }
  | { state: "cancelled" | "not_started" | "closed" | "incomplete"; opensAt: Date | null };

/**
 * Estado de la ventana R32 para la UI (la autoridad final es el motor).
 * TRAINER: la de la asistencia (sus botones viven en este panel). STAFF: el
 * panel administrativo solo muestra actividades y notas, así que usa la
 * regla de actividades (H03: sin la excepción de OPEN heredado).
 */
export function trainingWindow(
  detail: SessionTrainingDetail,
  channel: GymBookingChannel,
  role: string,
  now: Date
): TrainingWindow {
  const { session, policy } = detail;
  const { startsAt, endsAt } = resolveSessionInstants(session, policy.timezone);
  if (session.status === "cancelled") return { state: "cancelled", opensAt: startsAt };
  const input = { policy, now, startsAt, endsAt, sessionStatus: session.status, channel, role };
  const access =
    channel === "STAFF"
      ? checkTrainingRecordAccess(input)
      : checkAttendanceAccess({ ...input, kind: session.session_kind });
  if (access.ok) {
    const anchor = endsAt ?? startsAt;
    const closesAt =
      access.administrativeCorrection || !anchor ? null : new Date(anchor.getTime() + policy.attendanceEditWindowHours * HOUR);
    return { state: "open", closesAt, administrativeCorrection: access.administrativeCorrection };
  }
  if (access.code === "ATTENDANCE_NOT_STARTED") return { state: "not_started", opensAt: startsAt };
  if (access.code === "ATTENDANCE_WINDOW_CLOSED") return { state: "closed", opensAt: startsAt };
  return { state: "incomplete", opensAt: null };
}

function formatInstant(at: Date, timeZone: string | null) {
  return at.toLocaleString("es-MX", {
    timeZone: timeZone ?? undefined,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WindowBanner({ win, timeZone }: { win: TrainingWindow; timeZone: string | null }) {
  if (win.state === "open") {
    if (win.administrativeCorrection) {
      return (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
          Plazo del entrenador cerrado: los cambios quedan registrados como corrección administrativa.
        </div>
      );
    }
    return (
      <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 rounded-lg">
        Registro abierto{win.closesAt ? ` hasta ${formatInstant(win.closesAt, timeZone)}` : ""}
      </div>
    );
  }
  const text =
    win.state === "cancelled"
      ? "La clase está cancelada: no se registran asistencia, actividades ni notas."
      : win.state === "not_started"
        ? `El registro se habilita al inicio de la clase${win.opensAt ? `: ${formatInstant(win.opensAt, timeZone)}` : "."}`
        : win.state === "closed"
          ? "Cerró el plazo para registrar o editar esta clase. Solo un administrador puede corregirla."
          : timeZone
            ? "La clase no tiene horario completo. Contacta al administrador."
            : // H02: OPEN heredado sin starts_at necesita la zona del gimnasio (R32 no cambia).
              "El gimnasio no tiene una zona horaria válida configurada y esta clase no tiene horario absoluto: no se puede registrar hasta que un super administrador la configure en Ajustes › Reservas.";
  return <div className="bg-zinc-50 border border-zinc-200 text-zinc-700 text-sm px-4 py-3 rounded-lg">{text}</div>;
}

function ActivityList({ items, empty }: { items: { id: string; activity_name: string; notes: string | null }[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-zinc-400">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((a) => (
        <li key={a.id} className="text-xs bg-zinc-100 text-zinc-700 px-2.5 py-1 rounded-full max-w-full break-words">
          {a.activity_name}
          {a.notes ? <span className="text-zinc-500"> · {a.notes}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function ActivityForm({
  action,
  hidden,
  catalog,
  label,
}: {
  action: (formData: FormData) => Promise<void>;
  hidden: Record<string, string>;
  catalog: { id: string; name: string }[];
  label: string;
}) {
  if (catalog.length === 0) {
    return <p className="text-xs text-zinc-400">No hay actividades activas en el catálogo de esta sede.</p>;
  }
  return (
    <form action={action} className="flex flex-col sm:flex-row gap-2 sm:items-end">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="flex-1 min-w-0">
        <span className="block text-xs text-zinc-400 mb-1">{label}</span>
        <select
          name="activity_id"
          required
          defaultValue=""
          className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
        >
          <option value="" disabled>
            Seleccionar actividad…
          </option>
          {catalog.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex-1 min-w-0">
        <span className="block text-xs text-zinc-400 mb-1">Detalle (opcional)</span>
        <input
          type="text"
          name="notes"
          maxLength={500}
          placeholder="Series, tiempo, carga…"
          className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
      </label>
      <button
        type="submit"
        className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
      >
        Agregar
      </button>
    </form>
  );
}

export function SessionTrainingPanel({
  detail,
  win,
  showAttendanceControls,
  includePrivateNotes,
}: {
  detail: SessionTrainingDetail;
  win: TrainingWindow;
  /** Solo la vista del entrenador (canal TRAINER); SA/BA usan las acciones de staff. */
  showAttendanceControls: boolean;
  includePrivateNotes: boolean;
}) {
  const { session, catalog } = detail;
  const editable = win.state === "open";
  const attendanceByClient = new Map(session.attendance.map((a) => [a.client_id, a]));

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 sm:p-5 space-y-3">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Actividades de la clase</h2>
        <p className="text-xs text-zinc-500">Actividades comunes a todo el grupo; se registran una sola vez por clase.</p>
        <ActivityList items={session.activities} empty="Sin actividades comunes registradas." />
        {editable && (
          <ActivityForm
            action={addSessionActivityAction}
            hidden={{ scheduled_class_id: session.id }}
            catalog={catalog}
            label="Actividad común"
          />
        )}
      </section>

      <section className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 sm:p-5">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
          Alumnos con reserva confirmada · {session.bookings.length}
        </h2>
        {session.bookings.length === 0 ? (
          <p className="text-sm text-zinc-400">No hay alumnos con reserva confirmada.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {session.bookings.map((b) => {
              const att = attendanceByClient.get(b.client_id);
              const status = att?.attendance_status;
              const present = status === "attended" || status === "late";
              return (
                <li key={b.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-zinc-800 break-words min-w-0">
                      {b.client.first_name} {b.client.last_name}
                    </p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        status ? ATTENDANCE_BADGE[status] : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {status ? TRAINER_ATTENDANCE_LABELS[status] : "Sin registrar"}
                    </span>
                  </div>

                  {showAttendanceControls && editable && (
                    <div className="grid grid-cols-3 gap-2">
                      {(["attended", "late", "absent"] as const).map((s) => (
                        <form key={s} action={trainerRecordAttendanceAction}>
                          {/* Una clave por orden: doble clic o reenvío = replay sin segundo evento. */}
                          <input type="hidden" name="idempotency_key" value={randomUUID()} />
                          <input type="hidden" name="scheduled_class_id" value={session.id} />
                          <input type="hidden" name="booking_id" value={b.id} />
                          <input type="hidden" name="attendance_status" value={s} />
                          <button
                            type="submit"
                            aria-pressed={status === s}
                            className={`w-full text-sm px-2 py-2 rounded-lg border font-medium transition-colors ${
                              status === s
                                ? "bg-zinc-900 text-white border-zinc-900"
                                : "text-zinc-700 border-zinc-300 hover:bg-zinc-50"
                            }`}
                          >
                            {TRAINER_ATTENDANCE_LABELS[s]}
                          </button>
                        </form>
                      ))}
                    </div>
                  )}

                  {att && (
                    <div className="space-y-2">
                      <p className="text-xs text-zinc-400">Actividades individuales</p>
                      <ActivityList items={att.activities} empty="Sin actividades individuales." />
                      {editable && present && (
                        <ActivityForm
                          action={addAttendanceActivityAction}
                          hidden={{ scheduled_class_id: session.id, attendance_id: att.id }}
                          catalog={catalog}
                          label="Actividad del alumno"
                        />
                      )}
                      {editable && !present && (
                        <p className="text-xs text-zinc-400">Las actividades individuales se registran para alumnos presentes.</p>
                      )}
                    </div>
                  )}

                  {includePrivateNotes && att && (
                    <form action={saveTrainingNotesAction} className="space-y-2">
                      <input type="hidden" name="idempotency_key" value={randomUUID()} />
                      <input type="hidden" name="scheduled_class_id" value={session.id} />
                      <input type="hidden" name="booking_id" value={b.id} />
                      <label className="block">
                        <span className="block text-xs text-zinc-400 mb-1">Nota privada (no la ve el alumno)</span>
                        <textarea
                          name="training_notes"
                          rows={2}
                          maxLength={2000}
                          defaultValue={att.training_notes ?? ""}
                          readOnly={!editable}
                          className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 read-only:bg-zinc-50"
                        />
                      </label>
                      {editable && (
                        <button
                          type="submit"
                          className="text-sm px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition-colors"
                        >
                          Guardar nota
                        </button>
                      )}
                    </form>
                  )}

                  {!att && editable && (
                    <p className="text-xs text-zinc-400">Registra la asistencia para agregar actividades individuales y notas.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
