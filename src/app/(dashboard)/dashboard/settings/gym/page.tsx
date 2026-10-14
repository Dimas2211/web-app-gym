import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { requireGlobalAdmin } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import { getGym } from "@/modules/settings/queries";
import { GymForm } from "@/components/forms/gym-form";
import { updateGymAction } from "@/modules/settings/actions";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { requireEffectiveVertical } from "@/modules/platform/runtime/effective-vertical";

export default async function GymSettingsPage() {
  // Configuración del TENANT (no Platform Admin) — mismo patrón que
  // Seguridad: requireGlobalAdmin() → requireOperationalContext() → rol
  // LIVE. PLATFORM super_admin y RUNTIME_CLIENT super_admin editan SU gym
  // efectivo; la Server Action revalida lo mismo (updateGymAction).
  const sessionUser = await requireGlobalAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser);
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return <div className="p-8 text-sm text-red-500">{err.userMessage}</div>;
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    // Rol LIVE (RUNTIME_CLIENT: leído de runtimeDb) — un super_admin
    // degradado no conserva acceso solo por un JWT stale.
    if (!getCapabilities(context.effectiveUser.role as UserRole).isGlobal) {
      redirect("/dashboard");
    }

    // PASO 6F: superficie GYM-only — bloquea server-side si la organización
    // efectiva no tiene vertical GYM (ej. TrustMe: Commerce-only).
    await requireEffectiveVertical(context.tenantId, "GYM");

    // PASO 6E: Support Session ("Operar como cliente", solo lectura) no
    // edita — redirige ANTES de cargar el registro (comportamiento previo).
    if (context.readOnly) {
      redirect("/dashboard/settings");
    }

    const effectiveUser = { ...sessionUser, tenant_id: context.tenantId };
    const gym = await getGym(effectiveUser, context.client);
    if (!gym) notFound();

    return (
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/settings" className="hover:text-zinc-800 transition-colors">
            Configuración
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">Gimnasio</span>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-zinc-800">Datos del gimnasio</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Información general y de contacto de <span className="font-medium text-zinc-700">{gym.name}</span>.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
          <GymForm action={updateGymAction} defaultValues={gym} />
        </div>
      </div>
    );
  } finally {
    await dispose();
  }
}
