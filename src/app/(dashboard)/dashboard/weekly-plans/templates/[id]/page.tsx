import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, canManageWeeklyPlanTemplate } from "@/lib/permissions/guards";
import { getWeeklyPlanTemplateById } from "@/modules/weekly-plans/queries";
import { toggleTemplateStatusAction } from "@/modules/weekly-plans/actions";
import { DeleteDayButton } from "./delete-day-button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  PLAN_LEVEL_LABELS,
  PLAN_LEVEL_COLORS,
  GENDER_LABELS,
  DAY_OF_WEEK_LABELS,
  WEEK_DAYS_ORDER,
} from "@/lib/utils/labels";
import type { PlanLevel, Gender } from "@prisma/client";

type Props = { params: Promise<{ id: string }> };

export default async function WeeklyPlanTemplateDetailPage({ params }: Props) {
  const sessionUser = await requireAdmin();
  const { id } = await params;

  const template = await getWeeklyPlanTemplateById(id, sessionUser);
  if (!template) notFound();

  const canEdit = canManageWeeklyPlanTemplate(sessionUser, template);

  const daysByWeekday = Object.fromEntries(
    template.days.map((d) => [d.weekday, d])
  );

  return (
    <div className="space-y-6">
      {/* Breadcrumb + acciones */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/weekly-plans/templates" className="hover:text-zinc-800">
            Plantillas
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">{template.name}</span>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            {template.status === "active" && (
              <Link
                href={`/dashboard/weekly-plans/templates/${id}/assign-segmented`}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
              >
                Aplicar a segmento
              </Link>
            )}
            <Link
              href={`/dashboard/weekly-plans/templates/${id}/edit`}
              className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
            >
              Editar
            </Link>
            <form action={toggleTemplateStatusAction}>
              <input type="hidden" name="id" value={id} />
              <button
                type="submit"
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  template.status === "active"
                    ? "text-amber-700 border-amber-300 hover:bg-amber-50"
                    : "text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                }`}
              >
                {template.status === "active" ? "Desactivar" : "Activar"}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Encabezado */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-800">{template.name}</h1>
            {template.code && (
              <p className="text-sm text-zinc-400 mt-0.5">Código: {template.code}</p>
            )}
            {template.description && (
              <p className="text-sm text-zinc-600 mt-2 max-w-2xl">{template.description}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={template.status} />
            {template.target_level && (
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  PLAN_LEVEL_COLORS[template.target_level as PlanLevel]
                }`}
              >
                {PLAN_LEVEL_LABELS[template.target_level as PlanLevel]}
              </span>
            )}
            {template.target_gender && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-zinc-100 text-zinc-600">
                {GENDER_LABELS[template.target_gender as Gender]}
              </span>
            )}
          </div>
        </div>

        {/* Segmentación y meta */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          {template.target_sport && (
            <div>
              <span className="text-xs text-zinc-400">Deporte:</span>{" "}
              <span className="text-zinc-700 font-medium">{template.target_sport.name}</span>
            </div>
          )}
          {template.target_goal && (
            <div>
              <span className="text-xs text-zinc-400">Meta:</span>{" "}
              <span className="text-zinc-700 font-medium">{template.target_goal.name}</span>
            </div>
          )}
          {template.branch && (
            <div>
              <span className="text-xs text-zinc-400">Sucursal:</span>{" "}
              <span className="text-zinc-700 font-medium">{template.branch.name}</span>
            </div>
          )}
          {!template.branch && (
            <div>
              <span className="text-xs text-zinc-400">Alcance:</span>{" "}
              <span className="text-zinc-500 italic text-xs">Global (todo el gimnasio)</span>
            </div>
          )}
        </div>
      </div>

      {/* Días de la plantilla */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            Días de la plantilla
          </h2>
          {canEdit && template.days.length < 7 && (
            <Link
              href={`/dashboard/weekly-plans/templates/${id}/days/new`}
              className="text-sm text-zinc-600 border border-zinc-300 px-3 py-1.5 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              + Añadir día
            </Link>
          )}
        </div>

        {template.days.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-zinc-400">Esta plantilla no tiene días configurados.</p>
            {canEdit && (
              <Link
                href={`/dashboard/weekly-plans/templates/${id}/days/new`}
                className="mt-3 inline-block text-sm text-zinc-600 border border-zinc-300 px-4 py-2 rounded-lg hover:bg-zinc-50"
              >
                Añadir primer día
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-0">
            {/* Grid de 7 días */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {WEEK_DAYS_ORDER.map((weekday) => {
                const day = daysByWeekday[weekday];
                return (
                  <div
                    key={weekday}
                    className={`rounded-lg border p-3.5 ${
                      day
                        ? "border-zinc-200 bg-zinc-50"
                        : "border-dashed border-zinc-200 bg-white opacity-50"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                        {DAY_OF_WEEK_LABELS[weekday]}
                      </span>
                      {day && canEdit && (
                        <div className="flex gap-1">
                          <Link
                            href={`/dashboard/weekly-plans/templates/${id}/days/${day.id}/edit`}
                            className="text-xs text-zinc-400 hover:text-zinc-700 px-1.5 py-0.5 rounded hover:bg-zinc-200"
                          >
                            Editar
                          </Link>
                          <DeleteDayButton
                            dayId={day.id}
                            templateId={id}
                            userRole={sessionUser.role}
                          />
                        </div>
                      )}
                    </div>

                    {day ? (
                      <div className="space-y-1.5">
                        {day.session_name && (
                          <p className="text-sm font-medium text-zinc-800">{day.session_name}</p>
                        )}
                        {day.focus_area && (
                          <p className="text-xs text-zinc-500">{day.focus_area}</p>
                        )}
                        <p className="text-xs text-zinc-400">{day.duration_minutes} min</p>
                        {day.exercise_block && (
                          <p className="text-xs text-zinc-600 whitespace-pre-wrap font-mono mt-1 max-h-24 overflow-auto">
                            {day.exercise_block}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400">Sin configurar</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Auditoría */}
      <div className="text-xs text-zinc-400 text-right">
        Creado:{" "}
        {new Date(template.created_at).toLocaleDateString("es-MX", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        {template.creator && (
          <>
            {" por "}
            {template.creator.first_name} {template.creator.last_name}
          </>
        )}
      </div>
    </div>
  );
}
