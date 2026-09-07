import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/permissions/guards";
import { getBranchOptions } from "@/modules/branches/queries";
import { PlanForm } from "@/components/forms/plan-form";
import { createPlanAction } from "@/modules/memberships/actions";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";

export default async function NewPlanPage() {
  const sessionUser = await requireAdmin();

  // PASO 6D: página de escritura pura. Bajo sesión runtime "Operar como
  // cliente" redirige ANTES de cargar los selectores.
  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  const effectiveUser = context.runtime
    ? { ...sessionUser, tenant_id: context.tenantId }
    : sessionUser;

  try {
    await requireOrganizationModule(context.tenantId, "gym.memberships");
    if (context.runtime) {
      redirect("/dashboard/memberships/plans");
    }

    const branches = await getBranchOptions(effectiveUser, context.client);

    const fixedBranchId =
      sessionUser.role === "branch_admin" ? sessionUser.location_id : null;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/memberships/plans" className="hover:text-zinc-800 transition-colors">
            Planes
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">Nuevo</span>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
          <h1 className="text-lg font-bold text-zinc-800 mb-6">Nuevo plan de membresía</h1>
          <PlanForm
            action={createPlanAction}
            branches={branches}
            fixedBranchId={fixedBranchId}
          />
        </div>
      </div>
    );
  } finally {
    await dispose();
  }
}
