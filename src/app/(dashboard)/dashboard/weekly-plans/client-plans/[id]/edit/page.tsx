import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClassViewer, canManageClientWeeklyPlan } from "@/lib/permissions/guards";
import {
  getClientWeeklyPlanById,
  getTrainerOptionsForPlan,
  getBranchOptionsForPlan,
  getClientOptionsForPlan,
  getTemplateOptions,
} from "@/modules/weekly-plans/queries";
import { updateClientPlanAction } from "@/modules/weekly-plans/actions";
import { ClientWeeklyPlanForm } from "@/components/forms/client-weekly-plan-form";

type Props = { params: Promise<{ id: string }> };

function toDateString(date: Date): string {
  return new Date(date).toISOString().split("T")[0];
}

export default async function EditClientWeeklyPlanPage({ params }: Props) {
  const sessionUser = await requireClassViewer();
  const { id } = await params;

  const [plan, trainers, branches, clients, templates] = await Promise.all([
    getClientWeeklyPlanById(id, sessionUser),
    getTrainerOptionsForPlan(sessionUser),
    getBranchOptionsForPlan(sessionUser),
    getClientOptionsForPlan(sessionUser),
    getTemplateOptions(sessionUser),
  ]);

  if (!plan || !canManageClientWeeklyPlan(sessionUser, plan)) notFound();

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
        <Link href={`/dashboard/weekly-plans/client-plans/${id}`} className="hover:text-zinc-800">
          {plan.client.first_name} {plan.client.last_name}
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Editar</span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-zinc-800">Editar plan semanal</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Cliente: {plan.client.first_name} {plan.client.last_name}
        </p>
      </div>

      <ClientWeeklyPlanForm
        action={updateClientPlanAction}
        defaultValues={{
          id: plan.id,
          client_id: plan.client_id,
          branch_id: plan.branch_id,
          trainer_id: plan.trainer_id,
          template_id: plan.template_id,
          start_date: toDateString(plan.start_date),
          end_date: toDateString(plan.end_date),
          status: plan.status,
          notes: plan.notes,
        }}
        branches={branches}
        trainers={trainers}
        clients={clients}
        templates={templates}
        fixedBranchId={fixedBranchId}
        fixedClientId={plan.client_id}
        isEdit
      />
    </div>
  );
}
