import Link from "next/link";
import { requireClientManager } from "@/lib/permissions/guards";
import { getBranchOptions } from "@/modules/branches/queries";
import { getTrainersForClient, getGoalOptions, getSportOptions } from "@/modules/clients/queries";
import { ClientForm } from "@/components/forms/client-form";
import { createClientAction } from "@/modules/clients/actions";

export default async function NewClientPage() {
  const sessionUser = await requireClientManager();

  const [branches, trainers, goals, sports] = await Promise.all([
    getBranchOptions(sessionUser),
    getTrainersForClient(sessionUser),
    getGoalOptions(),
    getSportOptions(),
  ]);

  // Si no es super_admin, la sucursal está fija
  const fixedBranchId =
    sessionUser.role !== "super_admin" ? sessionUser.branch_id : null;

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
}
