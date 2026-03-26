import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, canManageTrainer } from "@/lib/permissions/guards";
import {
  getTrainerById,
  getAssignedClients,
} from "@/modules/trainers/queries";
import { toggleTrainerStatusAction } from "@/modules/trainers/actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { DAY_OF_WEEK_LABELS, WEEK_DAYS_ORDER } from "@/lib/utils/labels";

type Props = { params: Promise<{ id: string }> };

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="text-sm text-zinc-800 font-medium mt-0.5">{value || "—"}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

export default async function TrainerDetailPage({ params }: Props) {
  const sessionUser = await requireAdmin();
  const { id } = await params;

  const trainer = await getTrainerById(id, sessionUser);
  if (!trainer || !canManageTrainer(sessionUser, trainer)) notFound();

  const assignedClients = await getAssignedClients(trainer, sessionUser);

  // Disponibilidad agrupada por día
  const availabilityByDay: Record<number, typeof trainer.availability> = {};
  for (const slot of trainer.availability) {
    if (!availabilityByDay[slot.day_of_week]) {
      availabilityByDay[slot.day_of_week] = [];
    }
    availabilityByDay[slot.day_of_week].push(slot);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-6">
      {/* Breadcrumb + acciones */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/trainers" className="hover:text-zinc-800 transition-colors">
            Entrenadores
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">
            {trainer.first_name} {trainer.last_name}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/dashboard/trainers/${id}/availability`}
            className="text-sm text-zinc-600 border border-zinc-300 px-4 py-2 rounded-lg hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
          >
            Disponibilidad
          </Link>
          <Link
            href={`/dashboard/trainers/${id}/edit`}
            className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
          >
            Editar
          </Link>
          <form action={toggleTrainerStatusAction}>
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                trainer.status === "active"
                  ? "text-amber-700 border-amber-300 hover:bg-amber-50"
                  : "text-emerald-700 border-emerald-300 hover:bg-emerald-50"
              }`}
            >
              {trainer.status === "active" ? "Desactivar" : "Activar"}
            </button>
          </form>
        </div>
      </div>

      {/* Encabezado */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-800">
              {trainer.first_name} {trainer.last_name}
            </h1>
            {trainer.specialty && (
              <p className="text-sm text-zinc-500 mt-0.5">{trainer.specialty}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={trainer.status} />
            <span className="text-xs text-zinc-400 bg-zinc-100 px-2.5 py-1 rounded-full">
              {trainer.branch.name}
            </span>
          </div>
        </div>

        {trainer.user && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-zinc-400">Cuenta vinculada:</span>
            <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full font-medium">
              {trainer.user.email}
            </span>
          </div>
        )}
      </div>

      {/* Grid de datos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Section title="Datos de contacto">
          <div className="grid grid-cols-2 gap-4">
            <DetailRow label="Correo" value={trainer.email} />
            <DetailRow label="Teléfono" value={trainer.phone} />
          </div>
        </Section>

        <Section title="Perfil profesional">
          <div className="grid grid-cols-1 gap-4">
            <DetailRow label="Especialidad" value={trainer.specialty} />
          </div>
        </Section>
      </div>

      {/* Notas */}
      {trainer.notes && (
        <Section title="Notas internas">
          <p className="text-sm text-zinc-700 whitespace-pre-wrap">{trainer.notes}</p>
        </Section>
      )}

      {/* Disponibilidad semanal */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            Disponibilidad semanal
          </h2>
          <Link
            href={`/dashboard/trainers/${id}/availability`}
            className="text-xs text-zinc-600 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
          >
            Gestionar
          </Link>
        </div>

        {trainer.availability.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No hay bloques de disponibilidad registrados.{" "}
            <Link
              href={`/dashboard/trainers/${id}/availability`}
              className="text-zinc-600 hover:underline"
            >
              Agregar disponibilidad
            </Link>
          </p>
        ) : (
          <div className="space-y-3">
            {WEEK_DAYS_ORDER.filter((d) => availabilityByDay[d]).map((day) => (
              <div key={day} className="flex items-start gap-3">
                <span className="text-xs font-semibold text-zinc-500 w-20 pt-1 shrink-0">
                  {DAY_OF_WEEK_LABELS[day]}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {availabilityByDay[day].map((slot) => (
                    <span
                      key={slot.id}
                      className="text-xs bg-zinc-100 text-zinc-700 px-2.5 py-1 rounded-full"
                    >
                      {slot.start_time} – {slot.end_time}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clientes asignados */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            Clientes asignados
          </h2>
          <span className="text-xs text-zinc-400">
            {assignedClients.length} cliente{assignedClients.length !== 1 ? "s" : ""}
          </span>
        </div>

        {!trainer.user_id ? (
          <p className="text-sm text-zinc-400">
            Vincula una cuenta de usuario a este entrenador para gestionar clientes asignados.
          </p>
        ) : assignedClients.length === 0 ? (
          <p className="text-sm text-zinc-400">No hay clientes asignados a este entrenador.</p>
        ) : (
          <div className="space-y-2">
            {assignedClients.map((c) => {
              const activeMembership = c.memberships[0];
              const membershipExpired =
                activeMembership && new Date(activeMembership.end_date) < today;

              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 py-2 border-b border-zinc-100 last:border-0"
                >
                  <div>
                    <Link
                      href={`/dashboard/clients/${c.id}`}
                      className="text-sm font-medium text-zinc-700 hover:text-zinc-900 transition-colors"
                    >
                      {c.first_name} {c.last_name}
                    </Link>
                    {c.email && (
                      <p className="text-xs text-zinc-400 mt-0.5">{c.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {activeMembership ? (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          membershipExpired
                            ? "bg-red-50 text-red-600"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {membershipExpired ? "Membresía vencida" : activeMembership.membership_plan.name}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-300">Sin membresía</span>
                    )}
                    <StatusBadge status={c.status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Agenda — preparada para etapa 9 */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
          Agenda de clases
        </h2>
        <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center">
          <p className="text-sm text-zinc-400">
            La agenda de clases se habilitará en la etapa 9 del sistema.
          </p>
          <p className="text-xs text-zinc-300 mt-1">
            Módulo: Agenda y clases · Próximamente
          </p>
        </div>
      </div>

      {/* Auditoría */}
      <div className="text-xs text-zinc-400 text-right">
        Registrado:{" "}
        {new Date(trainer.created_at).toLocaleDateString("es-MX", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        {" · "}
        Actualizado:{" "}
        {new Date(trainer.updated_at).toLocaleDateString("es-MX", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </div>
    </div>
  );
}
