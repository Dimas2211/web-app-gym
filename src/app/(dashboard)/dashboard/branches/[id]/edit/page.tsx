import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin, canManageBranch } from "@/lib/permissions/guards";
import { getBranchById } from "@/modules/branches/queries";
import { BranchForm } from "@/components/forms/branch-form";
import { updateBranchAction } from "@/modules/branches/actions";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";

type Props = { params: Promise<{ id: string }> };

export default async function EditBranchPage({ params }: Props) {
  const user = await requireAdmin();
  const { id } = await params;

  // PASO 6E: página de escritura pura. Bajo sesión runtime "Operar como
  // cliente" redirige ANTES de cargar el registro.
  const { context, dispose } = await resolveEffectiveTenantContext(user);
  const effectiveUser = context.runtime ? { ...user, tenant_id: context.tenantId } : user;

  try {
    await requireOrganizationModule(context.tenantId, "core.locations");
    if (context.runtime) {
      redirect("/dashboard/branches");
    }

    const branch = await getBranchById(id, effectiveUser, context.client);
    if (!branch || !canManageBranch(effectiveUser, id)) notFound();

    return (
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/branches" className="hover:text-zinc-800 transition-colors">
            Sucursales
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">{branch.name}</span>
          <span>/</span>
          <span className="text-zinc-800 font-medium">Editar</span>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
          <h1 className="text-lg font-bold text-zinc-800 mb-6">Editar sucursal</h1>
          <BranchForm action={updateBranchAction} defaultValues={branch} />
        </div>
      </div>
    );
  } finally {
    await dispose();
  }
}
