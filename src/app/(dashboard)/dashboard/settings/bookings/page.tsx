import Link from "next/link";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { requireGlobalAdmin } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { requireEffectiveVertical } from "@/modules/platform/runtime/effective-vertical";
import { loadGymBookingPolicy } from "@/modules/classes/booking/booking-service";
import { updateGymBookingPolicyAction } from "@/modules/settings/actions";
import { GymBookingPolicyForm } from "@/components/forms/gym-booking-policy-form";

// GYM-BOOKINGS 3A — política de reservas del gimnasio EFECTIVO. Mismo
// patrón que settings/gym: requireGlobalAdmin → requireOperationalContext
// (gym.classes) → rol LIVE global → vertical GYM → Support Session no edita.
export default async function GymBookingPolicyPage() {
  const sessionUser = await requireGlobalAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.classes" });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return <div className="p-8 text-sm text-red-500">{err.userMessage}</div>;
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!getCapabilities(context.effectiveUser.role as UserRole).isGlobal) {
      redirect("/dashboard");
    }
    await requireEffectiveVertical(context.tenantId, "GYM");
    if (context.readOnly) {
      redirect("/dashboard/settings");
    }

    const policy = await loadGymBookingPolicy(context.client, context.tenantId);

    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/settings" className="hover:text-zinc-800 transition-colors">
            Configuración
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">Reservas</span>
        </div>

        <div>
          <h1 className="text-xl font-bold text-zinc-800">Política de reservas</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Modalidades personalizada y grupal, ventanas de reserva y cancelación, asistencia y series recurrentes.
            {policy.fromDefaults && " Aún no se ha guardado: se muestran los valores por defecto."}
          </p>
        </div>

        <GymBookingPolicyForm action={updateGymBookingPolicyAction} policy={policy} />
      </div>
    );
  } finally {
    await dispose();
  }
}
