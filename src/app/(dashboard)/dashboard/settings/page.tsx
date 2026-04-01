import Link from "next/link";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { getGym, getSports, getGoals } from "@/modules/settings/queries";

export default async function SettingsPage() {
  const user = await requireSuperAdmin();

  const [gym, sports, goals] = await Promise.all([getGym(user), getSports(), getGoals()]);

  // Métricas deportes
  const sportsActive = sports.filter((s) => s.status === "active").length;
  const sportsInactive = sports.filter((s) => s.status !== "active").length;

  // Métricas metas
  const goalsActive = goals.filter((g) => g.status === "active").length;
  const goalsInactive = goals.filter((g) => g.status !== "active").length;

  // Completitud del gimnasio: qué campos de contacto están rellenos
  const gymContactFields = [
    { label: "Dirección", value: gym?.address },
    { label: "Teléfono", value: gym?.phone },
    { label: "Correo", value: gym?.email },
    { label: "Sitio web", value: gym?.website },
  ];
  const gymFieldsFilled = gymContactFields.filter((f) => !!f.value).length;
  const gymFieldsTotal = gymContactFields.length;
  const gymIsComplete = gymFieldsFilled === gymFieldsTotal;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-800">Configuración</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Parámetros globales del sistema. Solo visible para Super Admin.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Card: Gimnasio */}
        <Link
          href="/dashboard/settings/gym"
          className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 hover:border-zinc-400 hover:shadow-md transition-all group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-start justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-zinc-800 group-hover:text-zinc-900">
                Datos del gimnasio
              </h2>
              {gymIsComplete ? (
                <span className="shrink-0 text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-full">
                  Completo
                </span>
              ) : (
                <span className="shrink-0 text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">
                  Incompleto
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed mb-3">
              Nombre, slug, dirección, teléfono y contacto del gimnasio.
            </p>
            {gym && (
              <p className="text-sm font-medium text-zinc-700 truncate">{gym.name}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {gymContactFields.map((f) => (
                <span
                  key={f.label}
                  className={`text-xs ${f.value ? "text-zinc-500" : "text-zinc-300"}`}
                >
                  {f.value ? "✓" : "○"} {f.label}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-4 text-xs text-zinc-400 group-hover:text-zinc-600 transition-colors">
            Editar →
          </div>
        </Link>

        {/* Card: Deportes */}
        <Link
          href="/dashboard/settings/sports"
          className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 hover:border-zinc-400 hover:shadow-md transition-all group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-start justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-zinc-800 group-hover:text-zinc-900">
                Deportes
              </h2>
              <span className="shrink-0 text-2xl font-black text-zinc-700 leading-none">
                {sports.length}
              </span>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed mb-3">
              Catálogo global de disciplinas asignables a clientes y plantillas.
            </p>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-zinc-600">{sportsActive} activos</span>
              </span>
              {sportsInactive > 0 && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-zinc-300" />
                  <span className="text-zinc-400">{sportsInactive} inactivos</span>
                </span>
              )}
            </div>
          </div>
          <div className="mt-4 text-xs text-zinc-400 group-hover:text-zinc-600 transition-colors">
            Gestionar →
          </div>
        </Link>

        {/* Card: Metas */}
        <Link
          href="/dashboard/settings/goals"
          className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 hover:border-zinc-400 hover:shadow-md transition-all group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-start justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-zinc-800 group-hover:text-zinc-900">
                Metas de entrenamiento
              </h2>
              <span className="shrink-0 text-2xl font-black text-zinc-700 leading-none">
                {goals.length}
              </span>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed mb-3">
              Catálogo global de objetivos físicos asignables a clientes y plantillas.
            </p>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-zinc-600">{goalsActive} activas</span>
              </span>
              {goalsInactive > 0 && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-zinc-300" />
                  <span className="text-zinc-400">{goalsInactive} inactivas</span>
                </span>
              )}
            </div>
          </div>
          <div className="mt-4 text-xs text-zinc-400 group-hover:text-zinc-600 transition-colors">
            Gestionar →
          </div>
        </Link>

        {/* Card: Códigos operativos */}
        <Link
          href="/dashboard/settings/codes"
          className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 hover:border-zinc-400 hover:shadow-md transition-all group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-start justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-zinc-800 group-hover:text-zinc-900">
                Códigos operativos
              </h2>
              <span className="shrink-0 text-xs font-mono bg-zinc-100 text-zinc-600 font-semibold px-2 py-0.5 rounded-full">
                A · C
              </span>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Nomenclatura de códigos cortos para personal y clientes. Prefijos, dígitos y numeración inicial.
            </p>
          </div>
          <div className="mt-4 text-xs text-zinc-400 group-hover:text-zinc-600 transition-colors">
            Configurar →
          </div>
        </Link>

        {/* Placeholder secciones futuras */}
        <div className="bg-zinc-50 rounded-xl border border-dashed border-zinc-200 p-5 flex items-center justify-center min-h-[140px]">
          <p className="text-xs text-zinc-400 text-center leading-relaxed">
            Próximamente
            <br />
            <span className="text-zinc-300">Inventario · Ventas · Onboarding</span>
          </p>
        </div>

      </div>

      {/* Nota de alcance */}
      <p className="text-xs text-zinc-400">
        Los cambios en catálogos globales (deportes, metas) afectan a todos los entornos del sistema.
        Solo el Super Admin puede modificarlos.
      </p>
    </div>
  );
}
