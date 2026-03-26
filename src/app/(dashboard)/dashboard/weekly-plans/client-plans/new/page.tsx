import Link from "next/link";
import { requireClassViewer } from "@/lib/permissions/guards";
import {
  getClientOptionsForPlan,
  getTrainerOptionsForPlan,
  getBranchOptionsForPlan,
  getTemplateOptions,
} from "@/modules/weekly-plans/queries";
import { createClientPlanAction } from "@/modules/weekly-plans/actions";
import { ClientWeeklyPlanForm } from "@/components/forms/client-weekly-plan-form";

type SearchParams = Promise<{ client_id?: string }>;

export default async function NewClientWeeklyPlanPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sessionUser = await requireClassViewer();
  const sp = await searchParams;

  const [clients, trainers, branches, templates] = await Promise.all([
    getClientOptionsForPlan(sessionUser),
    getTrainerOptionsForPlan(sessionUser),
    getBranchOptionsForPlan(sessionUser),
    getTemplateOptions(sessionUser),
  ]);

  const fixedBranchId =
    sessionUser.role === "branch_admin" || sessionUser.role === "reception"
      ? sessionUser.branch_id!
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
}
