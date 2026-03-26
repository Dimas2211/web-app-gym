import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembershipManager, canManageMembership } from "@/lib/permissions/guards";
import {
  getClientMembershipById,
  getActivePlansForAssignment,
  getActiveClientsForSelect,
} from "@/modules/memberships/queries";
import { getBranchOptions } from "@/modules/branches/queries";
import { ClientMembershipForm } from "@/components/forms/client-membership-form";
import { updateClientMembershipAction } from "@/modules/memberships/actions";

type Props = { params: Promise<{ id: string }> };

export default async function EditClientMembershipPage({ params }: Props) {
  const sessionUser = await requireMembershipManager();
  const { id } = await params;

  const membership = await getClientMembershipById(id, sessionUser);
  if (!membership || !canManageMembership(sessionUser, membership)) notFound();

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
        <span className="text-zinc-800 font-medium">Editar</span>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
        <h1 className="text-lg font-bold text-zinc-800 mb-1">Editar membresía</h1>
        <p className="text-sm text-zinc-500 mb-6">
          {membership.client.first_name} {membership.client.last_name}
          {" — "}
          {membership.membership_plan.name}
        </p>
        <ClientMembershipForm
          action={updateClientMembershipAction}
          defaultValues={{
            id: membership.id,
            client_id: membership.client_id,
            membership_plan_id: membership.membership_plan_id,
            branch_id: membership.branch_id,
            start_date: new Date(membership.start_date).toISOString().split("T")[0],
            price_at_sale: membership.price_at_sale.toString(),
            discount_amount: membership.discount_amount.toString(),
            final_amount: membership.final_amount.toString(),
            payment_status: membership.payment_status,
            status: membership.status,
            notes: membership.notes,
          }}
          plans={plans}
          clients={clients}
          branches={branches}
          fixedBranchId={fixedBranchId}
          fixedClientId={membership.client_id}
          isEdit
        />
      </div>
    </div>
  );
}
