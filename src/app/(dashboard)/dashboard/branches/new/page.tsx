import Link from "next/link";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { BranchForm } from "@/components/forms/branch-form";
import { createBranchAction } from "@/modules/branches/actions";

export default async function NewBranchPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/branches" className="hover:text-zinc-800 transition-colors">
          Sucursales
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Nueva</span>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
        <h1 className="text-lg font-bold text-zinc-800 mb-6">Nueva sucursal</h1>
        <BranchForm action={createBranchAction} />
      </div>
    </div>
  );
}
