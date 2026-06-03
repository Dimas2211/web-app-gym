// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/deployment-preparation
//
// Deployment Preparation Dashboard.
// Muestra organizaciones READY y NOT_READY con estado de export.
// Solo super_admin.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin } from "@/lib/permissions/guards";
import { listDeploymentPreparationOrgsQuery } from "@/modules/platform/queries/list-deployment-preparation-organizations";
import { PlatformDeploymentPreparationTable } from "@/modules/platform/components/platform-deployment-preparation-table";

export const metadata = { title: "Deployment Preparation" };

export default async function PlatformDeploymentPreparationPage() {
  await requireSuperAdmin();

  const orgs = await listDeploymentPreparationOrgsQuery();

  const ready    = orgs.filter((o) => o.provisioning_status === "READY" || o.provisioning_status === "PROVISIONED" || o.provisioning_status === "DEPLOYED");
  const notReady = orgs.filter((o) => o.provisioning_status === "NOT_READY" || o.provisioning_status === "FAILED");

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-800">Deployment Preparation</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Organizaciones listas para generar su Deployment Bundle.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3">
          <div className="text-2xl font-bold text-zinc-800">{orgs.length}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Total organizaciones</div>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3">
          <div className="text-2xl font-bold text-emerald-600">{ready.length}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Listas para exportar</div>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3">
          <div className="text-2xl font-bold text-zinc-500">{notReady.length}</div>
          <div className="text-xs text-zinc-500 mt-0.5">No listas</div>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3">
          <div className="text-2xl font-bold text-blue-600">
            {orgs.reduce((acc, o) => acc + o.export_count, 0)}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">Bundles exportados</div>
        </div>
      </div>

      {/* Tabla READY */}
      {ready.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-zinc-700 mb-4">
            Listas para exportar ({ready.length})
          </h2>
          <PlatformDeploymentPreparationTable items={ready} />
        </div>
      )}

      {/* Tabla NOT READY */}
      {notReady.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-zinc-700 mb-4">
            No listas ({notReady.length})
          </h2>
          <PlatformDeploymentPreparationTable items={notReady} />
        </div>
      )}

      {orgs.length === 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center">
          <p className="text-sm text-zinc-400">No hay organizaciones registradas.</p>
        </div>
      )}

    </div>
  );
}
