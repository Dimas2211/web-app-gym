import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { getGym } from "@/modules/settings/queries";
import { GymForm } from "@/components/forms/gym-form";
import { updateGymAction } from "@/modules/settings/actions";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";

export default async function GymSettingsPage() {
  const user = await requireSuperAdmin();

  // PASO 6E: página de escritura pura (edición del único registro Gym del
  // tenant). Bajo sesión runtime "Operar como cliente" redirige ANTES de
  // cargarlo — nunca se renderiza el formulario contra el gimnasio real
  // del super_admin ni contra el del tenant runtime (edición deshabilitada).
  const { context, dispose } = await resolveEffectiveTenantContext(user);
  const effectiveUser = context.runtime ? { ...user, tenant_id: context.tenantId } : user;

  try {
    if (context.runtime) {
      redirect("/dashboard/settings");
    }

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
