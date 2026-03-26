import Link from "next/link";
import { requireAdmin } from "@/lib/permissions/guards";
import { getBranchOptions } from "@/modules/branches/queries";
import { PlanForm } from "@/components/forms/plan-form";
import { createPlanAction } from "@/modules/memberships/actions";

export default async function NewPlanPage() {
  const sessionUser = await requireAdmin();
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
}
