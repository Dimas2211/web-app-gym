import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin, canManagePlan } from "@/lib/permissions/guards";
import { getMembershipPlanById } from "@/modules/memberships/queries";
import { getBranchOptions } from "@/modules/branches/queries";
import { PlanForm } from "@/components/forms/plan-form";
import { updatePlanAction } from "@/modules/memberships/actions";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";

type Props = { params: Promise<{ id: string }> };

export default async function EditPlanPage({ params }: Props) {
  const sessionUser = await requireAdmin();
  const { id } = await params;

  // PASO 6D: página de escritura pura. Bajo sesión runtime "Operar como
  // cliente" redirige ANTES de cargar el registro/selectores.
  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  const effectiveUser = context.runtime
    ? { ...sessionUser, tenant_id: context.tenantId }
    : sessionUser;

  try {
    await requireOrganizationModule(context.tenantId, "gym.memberships");
    if (context.runtime) {
      redirect("/dashboard/memberships/plans");
    }

    const plan = await getMembershipPlanById(id, effectiveUser, context.client);
    if (!plan || !canManagePlan(sessionUser, plan)) notFound();

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
          <span className="text-zinc-800 font-medium">Editar</span>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
          <h1 className="text-lg font-bold text-zinc-800 mb-6">Editar plan</h1>
          <PlanForm
            action={updatePlanAction}
            defaultValues={{
              id: plan.id,
              code: plan.code,
              name: plan.name,
              description: plan.description,
              duration_days: plan.duration_days,
              sessions_limit: plan.sessions_limit,
              price: plan.price.toString(),
              access_type: plan.access_type,
              is_recurring: plan.is_recurring,
              branch_id: plan.branch_id,
            }}
            branches={branches}
            fixedBranchId={fixedBranchId}
            isEdit
          />
        </div>
      </div>
    );
  } finally {
    await dispose();
  }
}
