import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { getGoalById } from "@/modules/settings/queries";
import { GoalForm } from "@/components/forms/goal-form";
import { updateGoalAction } from "@/modules/settings/actions";

type Props = { params: Promise<{ id: string }> };

export default async function EditGoalPage({ params }: Props) {
  await requireSuperAdmin();
  const { id } = await params;

  const goal = await getGoalById(id);
  if (!goal) notFound();

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/settings" className="hover:text-zinc-800 transition-colors">
          Configuración
        </Link>
        <span>/</span>
        <Link
          href="/dashboard/settings/goals"
          className="hover:text-zinc-800 transition-colors"
        >
          Metas
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">{goal.name}</span>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Editar</span>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
        <h1 className="text-lg font-bold text-zinc-800 mb-6">Editar meta de entrenamiento</h1>
        <GoalForm action={updateGoalAction} defaultValues={goal} />
      </div>
    </div>
  );
}
