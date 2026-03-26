import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, canManageBranch } from "@/lib/permissions/guards";
import { getBranchById } from "@/modules/branches/queries";
import { BranchForm } from "@/components/forms/branch-form";
import { updateBranchAction } from "@/modules/branches/actions";

type Props = { params: Promise<{ id: string }> };

export default async function EditBranchPage({ params }: Props) {
  const user = await requireAdmin();
  const { id } = await params;

  const branch = await getBranchById(id, user);
  if (!branch || !canManageBranch(user, id)) notFound();

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
}
