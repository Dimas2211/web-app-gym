// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/page.tsx
//
// Panel principal de Platform Admin.
// Solo accesible por super_admin.
// ─────────────────────────────────────────────────────────────────

import Link from "next/link";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { getPlatformStatsQuery } from "@/modules/platform/queries/get-platform-stats";
import { PlatformDashboardCards } from "@/modules/platform/components/platform-dashboard-cards";

export const metadata = {
  title: "Platform Admin",
};

export default async function PlatformPage() {
  await requireSuperAdmin();

  const stats = await getPlatformStatsQuery();

  return (
    <div className="space-y-6">

      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-800">Platform Admin</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Consola de administración de la plataforma base multiindustria.
        </p>
      </div>

      {/* Cards de estadísticas */}
      <PlatformDashboardCards stats={stats} />

      {/* Accesos rápidos */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
          Módulos Platform
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Link
            href="/dashboard/platform/organizations"
            className="border border-zinc-200 rounded-lg p-3 text-center hover:border-zinc-400 hover:bg-zinc-50 transition-colors group"
          >
            <p className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900">
              Organizaciones
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">Gestión de tenants</p>
          </Link>

          <div className="border border-dashed border-zinc-200 rounded-lg p-3 text-center opacity-50 cursor-not-allowed">
            <p className="text-sm font-medium text-zinc-400">Planes y Licencias</p>
            <p className="text-xs text-zinc-300 mt-0.5">Próximamente</p>
          </div>

          <div className="border border-dashed border-zinc-200 rounded-lg p-3 text-center opacity-50 cursor-not-allowed">
            <p className="text-sm font-medium text-zinc-400">Aprovisionamiento</p>
            <p className="text-xs text-zinc-300 mt-0.5">Próximamente</p>
          </div>
        </div>
      </div>

      {/* Nota informativa */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>Etapa 16D:</strong> Esta consola permite consultar y operar organizaciones existentes.
        El aprovisionamiento automático, facturación y deploy se implementarán en etapas posteriores.
      </div>
    </div>
  );
}
