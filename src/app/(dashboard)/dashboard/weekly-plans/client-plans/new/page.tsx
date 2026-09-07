import Link from "next/link";
import { redirect } from "next/navigation";
import { requireClassViewer } from "@/lib/permissions/guards";
import {
  getClientOptionsForPlan,
  getTrainerOptionsForPlan,
  getBranchOptionsForPlan,
  getTemplateOptions,
} from "@/modules/weekly-plans/queries";
import { createClientPlanAction } from "@/modules/weekly-plans/actions";
import { ClientWeeklyPlanForm } from "@/components/forms/client-weekly-plan-form";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";

type SearchParams = Promise<{ client_id?: string }>;

export default async function NewClientWeeklyPlanPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sessionUser = await requireClassViewer();
  const sp = await searchParams;

  // PASO 6D: página de escritura pura. Bajo sesión runtime "Operar como
  // cliente" redirige ANTES de cargar los selectores.
  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  const effectiveUser = context.runtime
    ? { ...sessionUser, tenant_id: context.tenantId }
    : sessionUser;

  try {
    await requireOrganizationModule(context.tenantId, "gym.weekly_plans");
    if (context.runtime) {
      redirect("/dashboard/weekly-plans/client-plans");
    }

    const [clients, trainers, branches, templates] = await Promise.all([
      getClientOptionsForPlan(effectiveUser, context.client),
      getTrainerOptionsForPlan(effectiveUser, context.client),
      getBranchOptionsForPlan(effectiveUser, context.client),
      getTemplateOptions(effectiveUser, context.client),
    ]);

    const fixedBranchId =
      sessionUser.role === "branch_admin" || sessionUser.role === "reception"
        ? sessionUser.location_id!
        : undefined;

    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/weekly-plans/client-plans" className="hover:text-zinc-800">
            Planes de clientes
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">Asignar plan</span>
        </div>

        <div>
          <h1 className="text-xl font-bold text-zinc-800">Asignar plan semanal</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Asigna un plan de entrenamiento semanal a un cliente.
          </p>
        </div>

        <ClientWeeklyPlanForm
          action={createClientPlanAction}
          defaultValues={{ client_id: sp.client_id }}
          branches={branches}
          trainers={trainers}
          clients={clients}
          templates={templates}
          fixedBranchId={fixedBranchId}
          fixedClientId={sp.client_id}
        />
      </div>
    );
  } finally {
    await dispose();
  }
}
