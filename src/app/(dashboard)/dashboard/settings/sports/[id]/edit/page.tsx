import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { getSportById } from "@/modules/settings/queries";
import { SportForm } from "@/components/forms/sport-form";
import { updateSportAction } from "@/modules/settings/actions";
import { requireEffectiveVertical } from "@/modules/platform/runtime/effective-vertical";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";

type Props = { params: Promise<{ id: string }> };

export default async function EditSportPage({ params }: Props) {
  const user = await requireSuperAdmin();
  const { id } = await params;

  // PASO 6F: superficie GYM-only + página de escritura pura. Bajo sesión
  // runtime "Operar como cliente" redirige ANTES de cargar el registro.
  const { context, dispose } = await resolveEffectiveTenantContext(user);

  try {
    await requireEffectiveVertical(context.tenantId, "GYM");
    if (context.runtime) {
      redirect("/dashboard/settings/sports");
    }

    const sport = await getSportById(id, context.client);
    if (!sport) notFound();

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
          <span className="text-zinc-800 font-medium">{sport.name}</span>
          <span>/</span>
          <span className="text-zinc-800 font-medium">Editar</span>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
          <h1 className="text-lg font-bold text-zinc-800 mb-6">Editar deporte</h1>
          <SportForm action={updateSportAction} defaultValues={sport} />
        </div>
      </div>
    );
  } finally {
    await dispose();
  }
}
