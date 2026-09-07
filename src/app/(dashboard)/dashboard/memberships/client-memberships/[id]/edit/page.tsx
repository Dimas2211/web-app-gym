import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireMembershipManager, canManageMembership } from "@/lib/permissions/guards";
import {
  getClientMembershipById,
  getActivePlansForAssignment,
  getActiveClientsForSelect,
} from "@/modules/memberships/queries";
import { getBranchOptions } from "@/modules/branches/queries";
import { ClientMembershipForm } from "@/components/forms/client-membership-form";
import { updateClientMembershipAction } from "@/modules/memberships/actions";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";

type Props = { params: Promise<{ id: string }> };

export default async function EditClientMembershipPage({ params }: Props) {
  const sessionUser = await requireMembershipManager();
  const { id } = await params;

  // PASO 6D: página de escritura pura. Bajo sesión runtime "Operar como
  // cliente" redirige ANTES de cargar el registro/selectores — nunca se
  // renderiza un formulario de edición contra el tenant real del super_admin.
  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  const effectiveUser = context.runtime
    ? { ...sessionUser, tenant_id: context.tenantId }
    : sessionUser;

  try {
    await requireOrganizationModule(context.tenantId, "gym.memberships");
    if (context.runtime) {
      redirect("/dashboard/memberships/client-memberships");
    }

    const membership = await getClientMembershipById(id, effectiveUser, context.client);
    if (!membership || !canManageMembership(sessionUser, membership)) notFound();

    const [plans, clients, branches] = await Promise.all([
      getActivePlansForAssignment(effectiveUser, context.client),
      getActiveClientsForSelect(effectiveUser, context.client),
      getBranchOptions(effectiveUser, context.client),
    ]);

    const fixedBranchId =
      sessionUser.role !== "super_admin" ? sessionUser.location_id : null;

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
  } finally {
    await dispose();
  }
}
