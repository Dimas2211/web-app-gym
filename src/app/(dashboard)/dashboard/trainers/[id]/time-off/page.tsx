import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { requireAdmin, canManageTrainer } from "@/lib/permissions/guards";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import {
  createTrainerTimeOffAction,
  updateTrainerTimeOffAction,
  deactivateTrainerTimeOffAction,
} from "@/modules/trainers/time-off-actions";
import { TrainerTimeOffForm } from "@/components/forms/trainer-time-off-form";
import { dateOnly } from "@/modules/classes/booking/booking-eligibility";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
};

// GYM-BOOKINGS 3A — ausencias del entrenador. Rol LIVE del contexto
// operacional (SA tenant / BA su sucursal); las acciones lo revalidan.
export default async function TrainerTimeOffPage({ params, searchParams }: Props) {
  const sessionUser = await requireAdmin();
  const { id } = await params;
  const { edit } = await searchParams;

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.trainers" });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return <div className="p-8 text-sm text-red-500">{err.userMessage}</div>;
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (context.readOnly) redirect(`/dashboard/trainers/${id}`);

    const trainer = await context.client.trainer.findFirst({
      where: { id, tenant_id: context.tenantId },
      select: { id: true, first_name: true, last_name: true, branch_id: true },
    });
    const liveUser = { ...sessionUser, role: context.effectiveUser.role as UserRole, location_id: context.locationId };
    if (!trainer || !canManageTrainer(liveUser, trainer)) notFound();

    const entries = await context.client.trainerTimeOff.findMany({
      where: { tenant_id: context.tenantId, trainer_id: id },
      orderBy: [{ status: "asc" }, { starts_on: "desc" }],
      take: 50,
    });
    const editing = edit ? entries.find((t) => t.id === edit && t.status === "active") : undefined;

    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/trainers" className="hover:text-zinc-800 transition-colors">
            Entrenadores
          </Link>
          <span>/</span>
          <Link href={`/dashboard/trainers/${id}`} className="hover:text-zinc-800 transition-colors">
            {trainer.first_name} {trainer.last_name}
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">Ausencias</span>
        </div>

        <div>
          <h1 className="text-xl font-bold text-zinc-800">Ausencias del entrenador</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Excepciones a la disponibilidad semanal. Si una ausencia afecta sesiones programadas, se rechaza y se
            listan: reasígnalas o cancélalas desde la agenda primero.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            {editing ? "Editar ausencia" : "Registrar ausencia"}
          </h2>
          <TrainerTimeOffForm
            key={editing?.id ?? "new"}
            action={editing ? updateTrainerTimeOffAction : createTrainerTimeOffAction}
            trainerId={id}
            timeOffId={editing?.id}
            defaultValues={
              editing
                ? {
                    starts_on: dateOnly(editing.starts_on),
                    ends_on: dateOnly(editing.ends_on),
                    start_time: editing.start_time,
                    end_time: editing.end_time,
                    reason: editing.reason,
                  }
                : undefined
            }
            cancelHref={editing ? `/dashboard/trainers/${id}/time-off` : undefined}
          />
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Registradas · {entries.length}</h2>
          {entries.length === 0 ? (
            <p className="text-sm text-zinc-400">No hay ausencias registradas.</p>
          ) : (
            <ul className="space-y-1.5">
              {entries.map((t) => (
                <li
                  key={t.id}
                  className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${
                    t.status === "active" ? "bg-zinc-50" : "bg-zinc-50/50 opacity-60"
                  }`}
                >
                  <span className="text-sm text-zinc-700">
                    <span className="font-medium">
                      {dateOnly(t.starts_on)}
                      {dateOnly(t.ends_on) !== dateOnly(t.starts_on) ? ` → ${dateOnly(t.ends_on)}` : ""}
                    </span>{" "}
                    · {t.start_time && t.end_time ? `${t.start_time}–${t.end_time}` : "Día completo"}
                    {t.reason ? ` · ${t.reason}` : ""}
                    {t.status !== "active" && " · Desactivada"}
                  </span>
                  {t.status === "active" && (
                    <span className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/dashboard/trainers/${id}/time-off?edit=${t.id}`}
                        className="text-xs text-zinc-600 hover:text-zinc-900"
                      >
                        Editar
                      </Link>
                      <form action={deactivateTrainerTimeOffAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <button type="submit" className="text-xs text-amber-700 hover:text-amber-900">
                          Desactivar
                        </button>
                      </form>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  } finally {
    await dispose();
  }
}
