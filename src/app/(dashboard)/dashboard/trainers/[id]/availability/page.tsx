import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, canManageTrainer } from "@/lib/permissions/guards";
import { getTrainerById, getTrainerAvailability } from "@/modules/trainers/queries";
import {
  addAvailabilitySlotAction,
  removeAvailabilitySlotAction,
} from "@/modules/trainers/actions";
import { AvailabilitySlotForm } from "@/components/forms/availability-slot-form";
import { DAY_OF_WEEK_LABELS, WEEK_DAYS_ORDER } from "@/lib/utils/labels";

type Props = { params: Promise<{ id: string }> };

export default async function TrainerAvailabilityPage({ params }: Props) {
  const sessionUser = await requireAdmin();
  const { id } = await params;

  const trainer = await getTrainerById(id, sessionUser);
  if (!trainer || !canManageTrainer(sessionUser, trainer)) notFound();

  const slots = await getTrainerAvailability(id);

  // Agrupar por día
  const byDay: Record<number, typeof slots> = {};
  for (const slot of slots) {
    if (!byDay[slot.day_of_week]) byDay[slot.day_of_week] = [];
    byDay[slot.day_of_week].push(slot);
  }

  const daysWithSlots = WEEK_DAYS_ORDER.filter((d) => byDay[d]);
  const daysWithoutSlots = WEEK_DAYS_ORDER.filter((d) => !byDay[d]);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/trainers" className="hover:text-zinc-800 transition-colors">
          Entrenadores
        </Link>
        <span>/</span>
        <Link
          href={`/dashboard/trainers/${id}`}
          className="hover:text-zinc-800 transition-colors"
        >
          {trainer.first_name} {trainer.last_name}
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Disponibilidad</span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-zinc-800">Disponibilidad semanal</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Define los bloques horarios en que {trainer.first_name} está disponible. Esta información
          se usará en la agenda de clases.
        </p>
      </div>

      {/* Horarios actuales */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Bloques registrados · {slots.length} en total
        </h2>

        {slots.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No hay bloques de disponibilidad registrados aún.
          </p>
        ) : (
          <div className="space-y-4">
            {daysWithSlots.map((day) => (
              <div key={day}>
                <p className="text-xs font-semibold text-zinc-500 mb-2">
                  {DAY_OF_WEEK_LABELS[day]}
                </p>
                <div className="space-y-1.5">
                  {byDay[day].map((slot) => (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between gap-3 bg-zinc-50 rounded-lg px-3 py-2"
                    >
                      <span className="text-sm font-medium text-zinc-700">
                        {slot.start_time} – {slot.end_time}
                      </span>
                      <form action={removeAvailabilitySlotAction}>
                        <input type="hidden" name="slot_id" value={slot.id} />
                        <input type="hidden" name="trainer_id" value={id} />
                        <button
                          type="submit"
                          className="text-xs text-red-600 hover:text-red-800 px-2.5 py-1 rounded border border-red-200 hover:bg-red-50 transition-colors"
                        >
                          Eliminar
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resumen de días sin bloques */}
      {daysWithoutSlots.length > 0 && (
        <div className="bg-zinc-50 rounded-xl border border-zinc-200 px-4 py-3">
          <p className="text-xs text-zinc-400">
            Sin bloques: {daysWithoutSlots.map((d) => DAY_OF_WEEK_LABELS[d]).join(", ")}
          </p>
        </div>
      )}

      {/* Formulario para agregar bloque */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Agregar bloque de disponibilidad
        </h2>
        <AvailabilitySlotForm trainerId={id} action={addAvailabilitySlotAction} />
      </div>

      {/* Nota informativa */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs text-amber-700">
          <strong>Nota:</strong> La validación de solapamiento con clases agendadas se habilitará
          en la etapa 9 (Agenda y clases). Por ahora se valida que los bloques del mismo día no
          se solapen entre sí.
        </p>
      </div>

      {/* Volver */}
      <div>
        <Link
          href={`/dashboard/trainers/${id}`}
          className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
        >
          ← Volver a la ficha del entrenador
        </Link>
      </div>
    </div>
  );
}
