import Link from "next/link";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { GoalForm } from "@/components/forms/goal-form";
import { createGoalAction } from "@/modules/settings/actions";

export default async function NewGoalPage() {
  await requireSuperAdmin();

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
        <span className="text-zinc-800 font-medium">Nueva</span>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
        <h1 className="text-lg font-bold text-zinc-800 mb-6">Nueva meta de entrenamiento</h1>
        <GoalForm action={createGoalAction} />
      </div>
    </div>
  );
}
