import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMembershipManager } from "@/lib/permissions/guards";
import { getActivePlansForAssignment, getActiveClientsForSelect } from "@/modules/memberships/queries";
import { getBranchOptions } from "@/modules/branches/queries";
import { ClientMembershipForm } from "@/components/forms/client-membership-form";
import { createClientMembershipAction } from "@/modules/memberships/actions";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";

type SearchParams = Promise<{ client_id?: string }>;

export default async function NewClientMembershipPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sessionUser = await requireMembershipManager();
  const params = await searchParams;

  // PASO 6D: página de escritura pura. Bajo sesión runtime "Operar como
  // cliente" redirige ANTES de cargar los selectores — nunca se cargan
  // planes/clientes/sucursales del tenant real del super_admin.
  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  const effectiveUser = context.runtime
    ? { ...sessionUser, tenant_id: context.tenantId }
    : sessionUser;

  try {
    await requireOrganizationModule(context.tenantId, "gym.memberships");
    if (context.runtime) {
      redirect("/dashboard/memberships/client-memberships");
    }

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
  } finally {
    await dispose();
  }
}
