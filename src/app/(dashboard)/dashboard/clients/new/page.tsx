import Link from "next/link";
import { redirect } from "next/navigation";
import { requireClientManager } from "@/lib/permissions/guards";
import { getBranchOptions } from "@/modules/branches/queries";
import { getTrainersForClient, getGoalOptions, getSportOptions } from "@/modules/clients/queries";
import { ClientForm } from "@/components/forms/client-form";
import { createClientAction } from "@/modules/clients/actions";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";

export default async function NewClientPage() {
  const sessionUser = await requireClientManager();

  // PASO 6D: página de escritura pura. Bajo sesión runtime "Operar como
  // cliente" redirige ANTES de cargar los selectores — nunca se cargan
  // sucursales/entrenadores/deportes/metas del tenant real del super_admin.
  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  const effectiveUser = context.runtime
    ? { ...sessionUser, tenant_id: context.tenantId }
    : sessionUser;

  try {
    if (context.runtime) {
      redirect("/dashboard/clients");
    }

    const [branches, trainers, goals, sports] = await Promise.all([
      getBranchOptions(effectiveUser, context.client),
      getTrainersForClient(effectiveUser, context.client),
      getGoalOptions(context.client),
      getSportOptions(context.client),
    ]);

    // Si no es super_admin, la sucursal está fija
    const fixedBranchId =
      sessionUser.role !== "super_admin" ? sessionUser.location_id : null;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/clients" className="hover:text-zinc-800 transition-colors">
            Clientes
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">Nuevo</span>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
          <h1 className="text-lg font-bold text-zinc-800 mb-6">Registrar cliente</h1>
          <ClientForm
            action={createClientAction}
            branches={branches}
            trainers={trainers}
            goals={goals}
            sports={sports}
            fixedBranchId={fixedBranchId}
          />
        </div>
      </div>
    );
  } finally {
    await dispose();
  }
}
