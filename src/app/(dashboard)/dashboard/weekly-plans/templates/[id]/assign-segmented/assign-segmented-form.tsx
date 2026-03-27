"use client";

import { useActionState } from "react";
import { assignTemplateSegmentedAction } from "@/modules/weekly-plans/actions";
import type { AssignSegmentedActionState } from "@/modules/weekly-plans/actions";

interface Option {
  id: string;
  name: string;
}

interface Props {
  templateId: string;
  templateName: string;
  branches: Option[];
  sports: Option[];
  goals: Option[];
  trainers: Array<{ id: string; first_name: string; last_name: string; branch_id: string }>;
  isSuperAdmin: boolean;
  userBranchId: string | null;
}

export function AssignSegmentedForm({
  templateId,
  templateName,
  branches,
  sports,
  goals,
  trainers,
  isSuperAdmin,
  userBranchId,
}: Props) {
  const [state, action, pending] = useActionState<AssignSegmentedActionState, FormData>(
    assignTemplateSegmentedAction,
    undefined
  );

  const wasSuccessful =
    state !== undefined &&
    !state.error &&
    !state.errors &&
    state.assigned !== undefined;

  return (
    <div className="space-y-6">
      {/* Resultado de la operación */}
      {wasSuccessful && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
          <p className="font-semibold text-emerald-800">Asignación completada</p>
          <p className="text-sm text-emerald-700 mt-1">
            Se asignaron <span className="font-bold">{state.assigned}</span> plan(es) nuevos.
            {(state.skipped ?? 0) > 0 && (
              <> Se omitieron <span className="font-bold">{state.skipped}</span> cliente(s) por solapamiento de fechas.</>
            )}
          </p>
          <p className="text-xs text-emerald-600 mt-2">
            Los planes creados ya están disponibles en la sección de planes de clientes.
          </p>
        </div>
      )}

      {state?.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <form action={action} className="space-y-6">
        <input type="hidden" name="template_id" value={templateId} />

        {/* Segmento de clientes */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700">
            Segmento de clientes destino
          </h2>
          <p className="text-xs text-zinc-500">
            Solo se asignará a clientes <strong>activos con membresía vigente</strong> que
            coincidan con los filtros. Dejar un filtro vacío significa &ldquo;todos&rdquo; en
            ese criterio.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Sucursal — solo super_admin puede elegir */}
            {isSuperAdmin ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-600">
                  Sucursal <span className="text-zinc-400">(opcional)</span>
                </label>
                <select
                  name="branch_id"
                  className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                >
                  <option value="">Todas las sucursales</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                {state?.errors?.branch_id && (
                  <p className="text-xs text-red-600">{state.errors.branch_id[0]}</p>
                )}
              </div>
            ) : (
              <input type="hidden" name="branch_id" value={userBranchId ?? ""} />
            )}

            {/* Género */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-600">
                Género <span className="text-zinc-400">(opcional)</span>
              </label>
              <select
                name="target_gender"
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
                <option value="">Todos los géneros</option>
                <option value="male">Masculino</option>
                <option value="female">Femenino</option>
                <option value="other">Otro</option>
                <option value="prefer_not_to_say">Prefiero no decir</option>
              </select>
            </div>

            {/* Deporte */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-600">
                Deporte <span className="text-zinc-400">(opcional)</span>
              </label>
              <select
                name="target_sport_id"
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
                <option value="">Todos los deportes</option>
                {sports.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Meta */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-600">
                Meta <span className="text-zinc-400">(opcional)</span>
              </label>
              <select
                name="target_goal_id"
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
                <option value="">Todas las metas</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Configuración del plan */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700">
            Configuración del plan asignado
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Fecha inicio */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-600">
                Fecha de inicio <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="start_date"
                required
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {state?.errors?.start_date && (
                <p className="text-xs text-red-600">{state.errors.start_date[0]}</p>
              )}
            </div>

            {/* Fecha fin */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-600">
                Fecha de fin <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="end_date"
                required
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {state?.errors?.end_date && (
                <p className="text-xs text-red-600">{state.errors.end_date[0]}</p>
              )}
            </div>

            {/* Entrenador */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-zinc-600">
                Entrenador asignado <span className="text-zinc-400">(opcional)</span>
              </label>
              <select
                name="trainer_id"
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
                <option value="">Sin entrenador específico</option>
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.last_name}, {t.first_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Notas */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-zinc-600">
                Notas del plan <span className="text-zinc-400">(opcional)</span>
              </label>
              <textarea
                name="notes"
                rows={2}
                maxLength={1000}
                placeholder="Notas generales que se copiarán a todos los planes creados…"
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Aviso */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-sm text-indigo-800">
          <p className="font-semibold">¿Qué hace esta acción?</p>
          <ul className="mt-1.5 space-y-1 text-indigo-700 text-xs list-disc list-inside">
            <li>
              Aplica la plantilla <strong>&ldquo;{templateName}&rdquo;</strong> a todos los
              clientes activos con membresía vigente que coincidan con el segmento.
            </li>
            <li>
              Cada cliente recibe un plan individual con los días de la plantilla copiados.
            </li>
            <li>
              Clientes con un plan activo en el mismo periodo de fechas son omitidos
              automáticamente.
            </li>
          </ul>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="submit"
            disabled={pending}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? "Aplicando…" : "Aplicar a segmento"}
          </button>
        </div>
      </form>
    </div>
  );
}
