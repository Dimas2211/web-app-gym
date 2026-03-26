import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, canManagePlan } from "@/lib/permissions/guards";
import { getMembershipPlanById } from "@/modules/memberships/queries";
import { getBranchOptions } from "@/modules/branches/queries";
import { PlanForm } from "@/components/forms/plan-form";
import { updatePlanAction } from "@/modules/memberships/actions";

type Props = { params: Promise<{ id: string }> };

export default async function EditPlanPage({ params }: Props) {
  const sessionUser = await requireAdmin();
  const { id } = await params;

  const plan = await getMembershipPlanById(id, sessionUser);
  if (!plan || !canManagePlan(sessionUser, plan)) notFound();

  const branches = await getBranchOptions(sessionUser);
  const fixedBranchId =
    sessionUser.role === "branch_admin" ? sessionUser.branch_id : null;

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
}
