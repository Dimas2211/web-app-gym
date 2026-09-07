import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/permissions/guards";
import { getBranchOptions } from "@/modules/branches/queries";
import { UserForm } from "@/components/forms/user-form";
import { createUserAction } from "@/modules/users/actions";
import { getAssignableRoles, ROLE_LABELS } from "@/lib/utils/roles";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";

export default async function NewUserPage() {
  const user = await requireAdmin();

  // PASO 6E: página de escritura pura. Bajo sesión runtime "Operar como
  // cliente" redirige ANTES de cargar los selectores.
  const { context, dispose } = await resolveEffectiveTenantContext(user);
  const effectiveUser = context.runtime ? { ...user, tenant_id: context.tenantId } : user;

  try {
    await requireOrganizationModule(context.tenantId, "core.users");
    if (context.runtime) {
      redirect("/dashboard/users");
    }

    const branches = await getBranchOptions(effectiveUser, context.client);

    const availableRoles = getAssignableRoles(user.role).map((r) => ({
      value: r,
      label: ROLE_LABELS[r],
    }));

    return (
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/users" className="hover:text-zinc-800 transition-colors">
            Usuarios
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">Nuevo</span>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
          <h1 className="text-lg font-bold text-zinc-800 mb-6">Nuevo usuario</h1>
          <UserForm
            action={createUserAction}
            branches={branches}
            availableRoles={availableRoles}
          />
        </div>
      </div>
    );
  } finally {
    await dispose();
  }
}
