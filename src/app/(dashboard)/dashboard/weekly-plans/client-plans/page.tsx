import Link from "next/link";
import { requireClassViewer } from "@/lib/permissions/guards";
import {
  getClientWeeklyPlans,
  getGeneralTemplatesForScope,
} from "@/modules/weekly-plans/queries";
import {
  toggleClientPlanStatusAction,
  deleteClientPlanAction,
} from "@/modules/weekly-plans/actions";
import { DeleteAuthorizationDialog } from "@/components/forms/delete-authorization-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Status, AssignmentType } from "@prisma/client";

function AssignmentTypeBadge({ type }: { type: AssignmentType }) {
  if (type === "segmented") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
        Segmentado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-500">
      Individual
    </span>
  );
}

type SearchParams = Promise<{
  search?: string;
  status?: string;
  trainer_id?: string;
  client_id?: string;
}>;

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function ClientWeeklyPlansPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sessionUser = await requireClassViewer();
  const sp = await searchParams;

  const [plans, generalTemplates] = await Promise.all([
    getClientWeeklyPlans(sessionUser, {
      search: sp.search,
      status: sp.status as Status | undefined,
      trainer_id: sp.trainer_id,
      client_id: sp.client_id,
    }),
    getGeneralTemplatesForScope(sessionUser),
  ]);

  // Para entrenadores: mapa de cuántos de sus planes usan cada plantilla general
  const trainerPlansByTemplate: Record<string, number> = {};
  if (sessionUser.role === "trainer") {
    for (const p of plans) {
      if (p.template?.id) {
        trainerPlansByTemplate[p.template.id] =
          (trainerPlansByTemplate[p.template.id] ?? 0) + 1;
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-800">Planes semanales de clientes</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Planes de entrenamiento asignados a clientes.
          </p>
        </div>
        <Link
          href="/dashboard/weekly-plans/client-plans/new"
          className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
        >
          + Asignar plan
        </Link>
      </div>

      {/* Filtros */}
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <input
          name="search"
          type="search"
          placeholder="Buscar cliente…"
          defaultValue={sp.search ?? ""}
          className="border border-zinc-300 rounded-lg px-3.5 py-2 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
          <option value="suspended">Suspendido</option>
        </select>
        <button
          type="submit"
          className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-800 transition-colors"
        >
          Filtrar
        </button>
        <Link
          href="/dashboard/weekly-plans/client-plans"
          className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Limpiar
        </Link>
      </form>

      {/* Lista */}
      {plans.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
          <p className="text-zinc-400 text-sm">No se encontraron planes.</p>
          <Link
            href="/dashboard/weekly-plans/client-plans/new"
            className="mt-3 inline-block text-sm text-zinc-600 border border-zinc-300 px-4 py-2 rounded-lg hover:bg-zinc-50"
          >
            Asignar primer plan
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
          {/* Escritorio */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Cliente
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Plantilla
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Entrenador
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Periodo
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Días
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Tipo
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Estado
                  </th>
                  <th className="text-right px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {plans.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/dashboard/weekly-plans/client-plans/${p.id}`}
                        className="font-medium text-zinc-800 hover:text-zinc-600"
                      >
                        {p.client.last_name}, {p.client.first_name}
                      </Link>
                      {p.client.email && (
                        <p className="text-xs text-zinc-400 mt-0.5">{p.client.email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-600">
                      {p.template?.name ?? (
                        <span className="text-zinc-400 italic text-xs">Manual</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-600">
                      {p.trainer
                        ? `${p.trainer.last_name}, ${p.trainer.first_name}`
                        : <span className="text-zinc-400">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-500 text-xs">
                      {formatDate(p.start_date)} → {formatDate(p.end_date)}
                    </td>
                    <td className="px-4 py-3.5 text-center text-zinc-600 font-medium">
                      {p._count.days}
                    </td>
                    <td className="px-4 py-3.5">
                      <AssignmentTypeBadge type={p.assignment_type} />
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/weekly-plans/client-plans/${p.id}`}
                          className="text-xs text-zinc-500 hover:text-zinc-800 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
                        >
                          Ver
                        </Link>
                        <Link
                          href={`/dashboard/weekly-plans/client-plans/${p.id}/edit`}
                          className="text-xs text-zinc-500 hover:text-zinc-800 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
                        >
                          Editar
                        </Link>
                        <form action={toggleClientPlanStatusAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <button
                            type="submit"
                            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                              p.status === "active"
                                ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                                : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            }`}
                          >
                            {p.status === "active" ? "Desactivar" : "Activar"}
                          </button>
                        </form>
                        <DeleteAuthorizationDialog
                          entityLabel={`el plan de ${p.client.first_name} ${p.client.last_name}`}
                          userRole={sessionUser.role}
                          hiddenFields={{ id: p.id }}
                          action={deleteClientPlanAction}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Móvil */}
          <div className="md:hidden divide-y divide-zinc-100">
            {plans.map((p) => (
              <div key={p.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/dashboard/weekly-plans/client-plans/${p.id}`}
                    className="font-medium text-zinc-800"
                  >
                    {p.client.last_name}, {p.client.first_name}
                  </Link>
                  <StatusBadge status={p.status} />
                </div>
                <p className="text-xs text-zinc-500">
                  {formatDate(p.start_date)} → {formatDate(p.end_date)}
                </p>
                {p.trainer && (
                  <p className="text-xs text-zinc-500">
                    Entrenador: {p.trainer.first_name} {p.trainer.last_name}
                  </p>
                )}
                <div className="flex gap-2">
                  <Link
                    href={`/dashboard/weekly-plans/client-plans/${p.id}`}
                    className="text-xs text-zinc-600 border border-zinc-200 px-2.5 py-1 rounded hover:bg-zinc-50"
                  >
                    Ver
                  </Link>
                  <Link
                    href={`/dashboard/weekly-plans/client-plans/${p.id}/edit`}
                    className="text-xs text-zinc-600 border border-zinc-200 px-2.5 py-1 rounded hover:bg-zinc-50"
                  >
                    Editar
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-400">{plans.length} plan(es) encontrado(s).</p>

      {/* ── PROGRAMACIÓN GENERAL DEL GIMNASIO ─────────────────── */}
      <div className="mt-10 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-zinc-700">
            Programación general activa
          </h2>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-700">
            Plantillas publicadas
          </span>
        </div>
        {sessionUser.role === "trainer" ? (
          <p className="text-xs text-zinc-500">
            Rutinas generales publicadas para el gimnasio. Tus clientes las ven en su portal si
            tienen membresía vigente y su perfil (deporte, meta, género) coincide con la
            segmentación de cada plantilla. La columna <strong>Mis planes</strong> indica cuántos
            de tus planes activos utilizan esa plantilla como base.
          </p>
        ) : (
          <p className="text-xs text-zinc-500">
            Plantillas activas visibles para clientes según su perfil. Los clientes las ven en
            su portal si tienen membresía vigente y coinciden con la segmentación. Las marcadas
            como <strong>Segmentado</strong> fueron asignadas masivamente; las{" "}
            <strong>Individual</strong>, de forma manual.
          </p>
        )}

        {generalTemplates.length === 0 ? (
          <div className="bg-white rounded-xl border border-zinc-200 p-6 text-center">
            <p className="text-zinc-400 text-sm">
              No hay plantillas activas publicadas para este scope.
            </p>
            {(sessionUser.role === "super_admin" ||
              sessionUser.role === "branch_admin") && (
              <Link
                href="/dashboard/weekly-plans/templates"
                className="mt-2 inline-block text-sm text-zinc-600 border border-zinc-300 px-4 py-2 rounded-lg hover:bg-zinc-50"
              >
                Gestionar plantillas
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-sky-50 border-b border-sky-100">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-sky-700 uppercase tracking-wide">
                      Plantilla
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-sky-700 uppercase tracking-wide">
                      Segmentación
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-sky-700 uppercase tracking-wide">
                      Días
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-sky-700 uppercase tracking-wide">
                      Planes asignados
                    </th>
                    {sessionUser.role === "trainer" && (
                      <th className="text-center px-4 py-3 text-xs font-semibold text-sky-700 uppercase tracking-wide">
                        Mis planes
                      </th>
                    )}
                    <th className="text-left px-4 py-3 text-xs font-semibold text-sky-700 uppercase tracking-wide">
                      Alcance
                    </th>
                    {(sessionUser.role === "super_admin" ||
                      sessionUser.role === "branch_admin") && (
                      <th className="text-right px-5 py-3" />
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-50">
                  {generalTemplates.map((t) => (
                    <tr key={t.id} className="hover:bg-sky-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/dashboard/weekly-plans/templates/${t.id}`}
                          className="font-medium text-zinc-800 hover:text-zinc-600"
                        >
                          {t.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {t.target_sport && (
                            <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                              {t.target_sport.name}
                            </span>
                          )}
                          {t.target_goal && (
                            <span className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                              {t.target_goal.name}
                            </span>
                          )}
                          {!t.target_sport && !t.target_goal && (
                            <span className="text-xs text-zinc-400 italic">General</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center text-zinc-600 font-medium">
                        {t._count.days}
                      </td>
                      <td className="px-4 py-3.5 text-center text-zinc-500">
                        {t._count.client_plans}
                      </td>
                      {sessionUser.role === "trainer" && (
                        <td className="px-4 py-3.5 text-center">
                          {(trainerPlansByTemplate[t.id] ?? 0) > 0 ? (
                            <span className="text-xs font-semibold text-indigo-700">
                              {trainerPlansByTemplate[t.id]}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3.5 text-zinc-500 text-xs">
                        {t.branch?.name ?? (
                          <span className="italic text-zinc-400">Global</span>
                        )}
                      </td>
                      {(sessionUser.role === "super_admin" ||
                        sessionUser.role === "branch_admin") && (
                        <td className="px-5 py-3.5 text-right">
                          <Link
                            href={`/dashboard/weekly-plans/templates/${t.id}/assign-segmented`}
                            className="text-xs text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-2.5 py-1 rounded transition-colors"
                          >
                            Aplicar a segmento
                          </Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil */}
            <div className="md:hidden divide-y divide-sky-50">
              {generalTemplates.map((t) => (
                <div key={t.id} className="p-4 space-y-1.5">
                  <Link
                    href={`/dashboard/weekly-plans/templates/${t.id}`}
                    className="font-medium text-zinc-800 text-sm"
                  >
                    {t.name}
                  </Link>
                  <div className="flex flex-wrap gap-1">
                    {t.target_sport && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                        {t.target_sport.name}
                      </span>
                    )}
                    {t.target_goal && (
                      <span className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                        {t.target_goal.name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">
                    {t._count.days} día(s) · {t._count.client_plans} plan(es) asignado(s)
                    {sessionUser.role === "trainer" &&
                      (trainerPlansByTemplate[t.id] ?? 0) > 0 && (
                        <span className="ml-1 text-indigo-700 font-semibold">
                          · {trainerPlansByTemplate[t.id]} mis planes
                        </span>
                      )}
                  </p>
                  {(sessionUser.role === "super_admin" ||
                    sessionUser.role === "branch_admin") && (
                    <Link
                      href={`/dashboard/weekly-plans/templates/${t.id}/assign-segmented`}
                      className="inline-block text-xs text-indigo-600 border border-indigo-200 px-2.5 py-1 rounded hover:bg-indigo-50"
                    >
                      Aplicar a segmento
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
