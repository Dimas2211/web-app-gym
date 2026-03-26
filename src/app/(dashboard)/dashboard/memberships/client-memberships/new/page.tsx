import Link from "next/link";
import { requireMembershipManager } from "@/lib/permissions/guards";
import { getActivePlansForAssignment, getActiveClientsForSelect } from "@/modules/memberships/queries";
import { getBranchOptions } from "@/modules/branches/queries";
import { ClientMembershipForm } from "@/components/forms/client-membership-form";
import { createClientMembershipAction } from "@/modules/memberships/actions";

type SearchParams = Promise<{ client_id?: string }>;

export default async function NewClientMembershipPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sessionUser = await requireMembershipManager();
  const params = await searchParams;

  const [plans, clients, branches] = await Promise.all([
    getActivePlansForAssignment(sessionUser),
    getActiveClientsForSelect(sessionUser),
    getBranchOptions(sessionUser),
  ]);

  const fixedBranchId =
    sessionUser.role !== "super_admin" ? sessionUser.branch_id : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link
          href="/dashboard/memberships/client-memberships"
          className="hover:text-zinc-800 transition-colors"
        >
          Membresías
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Asignar</span>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
        <h1 className="text-lg font-bold text-zinc-800 mb-6">Asignar membresía a cliente</h1>
        <ClientMembershipForm
          action={createClientMembershipAction}
          plans={plans}
          clients={clients}
          branches={branches}
          fixedBranchId={fixedBranchId}
          fixedClientId={params.client_id ?? null}
          defaultValues={
            params.client_id ? { client_id: params.client_id } : undefined
          }
        />
      </div>
    </div>
  );
}
