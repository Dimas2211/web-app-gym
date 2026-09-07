import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { SportForm } from "@/components/forms/sport-form";
import { createSportAction } from "@/modules/settings/actions";
import { requireEffectiveVertical } from "@/modules/platform/runtime/effective-vertical";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";

export default async function NewSportPage() {
  const user = await requireSuperAdmin();

  // PASO 6F: superficie GYM-only + página de escritura pura. Bajo sesión
  // runtime "Operar como cliente" redirige ANTES de renderizar el formulario.
  const { context, dispose } = await resolveEffectiveTenantContext(user);

  try {
    await requireEffectiveVertical(context.tenantId, "GYM");
    if (context.runtime) {
      redirect("/dashboard/settings/sports");
    }

    return (
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/settings" className="hover:text-zinc-800 transition-colors">
            Configuración
          </Link>
          <span>/</span>
          <Link
            href="/dashboard/settings/sports"
            className="hover:text-zinc-800 transition-colors"
          >
            Deportes
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">Nuevo</span>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
          <h1 className="text-lg font-bold text-zinc-800 mb-6">Nuevo deporte</h1>
          <SportForm action={createSportAction} />
        </div>
      </div>
    );
  } finally {
    await dispose();
  }
}
