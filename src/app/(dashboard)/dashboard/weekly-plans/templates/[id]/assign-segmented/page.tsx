import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, canManageWeeklyPlanTemplate } from "@/lib/permissions/guards";
import { getWeeklyPlanTemplateById } from "@/modules/weekly-plans/queries";
import {
  getTrainerOptionsForPlan,
  getBranchOptionsForPlan,
  getSportOptions,
  getGoalOptions,
} from "@/modules/weekly-plans/queries";
import { AssignSegmentedForm } from "./assign-segmented-form";

type Props = { params: Promise<{ id: string }> };

export default async function AssignSegmentedPage({ params }: Props) {
  const sessionUser = await requireAdmin();
  const { id } = await params;

  const template = await getWeeklyPlanTemplateById(id, sessionUser);
  if (!template) notFound();
  if (!canManageWeeklyPlanTemplate(sessionUser, template)) notFound();
  if (template.status !== "active") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">
          Solo se pueden aplicar plantillas activas a segmentos.
        </p>
        <Link
          href={`/dashboard/weekly-plans/templates/${id}`}
          className="text-sm text-zinc-500 hover:text-zinc-800"
        >
          ← Volver a la plantilla
        </Link>
      </div>
    );
  }

  const [branches, sports, goals, trainers] = await Promise.all([
    getBranchOptionsForPlan(sessionUser),
    getSportOptions(),
    getGoalOptions(),
    getTrainerOptionsForPlan(sessionUser),
  ]);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/weekly-plans/templates" className="hover:text-zinc-800">
          Plantillas
        </Link>
        <span>/</span>
        <Link
          href={`/dashboard/weekly-plans/templates/${id}`}
          className="hover:text-zinc-800"
        >
          {template.name}
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Aplicar a segmento</span>
      </div>

      {/* Encabezado */}
      <div>
        <h1 className="text-xl font-bold text-zinc-800">Asignación segmentada</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Aplica la plantilla <strong>{template.name}</strong> a un grupo de clientes según
          sus características.
        </p>
      </div>

      {/* Formulario */}
      <AssignSegmentedForm
        templateId={id}
        templateName={template.name}
        branches={branches}
        sports={sports}
        goals={goals}
        trainers={trainers}
        isSuperAdmin={sessionUser.role === "super_admin"}
        userBranchId={sessionUser.branch_id ?? null}
      />

      {/* Enlace a planes resultantes */}
      <div className="text-right">
        <Link
          href="/dashboard/weekly-plans/client-plans"
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          Ver planes de clientes →
        </Link>
      </div>
    </div>
  );
}
