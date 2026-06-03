// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/deployment-exports
//
// Historial global de exportaciones de Deployment Bundles.
// Solo super_admin.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }             from "@/lib/permissions/guards";
import { listDeploymentExportLogsQuery } from "@/modules/platform/queries/list-deployment-export-logs";
import { PlatformDeploymentExportHistory } from "@/modules/platform/components/platform-deployment-export-history";

export const metadata = { title: "Deployment Exports" };

export default async function PlatformDeploymentExportsPage() {
  await requireSuperAdmin();

  const logs = await listDeploymentExportLogsQuery(undefined, 100);

  const successful = logs.filter((l) => l.result === "SUCCESS").length;
  const failed     = logs.filter((l) => l.result === "FAILED").length;
  const bundles    = logs.filter((l) => l.export_type === "DEPLOYMENT_BUNDLE").length;
  const configs    = logs.filter((l) => l.export_type === "CONFIGURATION_PACKAGE").length;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-800">Deployment Exports</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Historial global de exportaciones de bundles de despliegue.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3">
          <div className="text-2xl font-bold text-zinc-800">{logs.length}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Total exportaciones</div>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3">
          <div className="text-2xl font-bold text-emerald-600">{successful}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Exitosas</div>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3">
          <div className="text-2xl font-bold text-blue-600">{bundles}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Deployment Bundles</div>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3">
          <div className="text-2xl font-bold text-violet-600">{configs}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Config. Packages</div>
        </div>
      </div>

      {failed > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {failed} exportación(es) con error. Revisa el historial para más detalle.
        </div>
      )}

      {/* Tabla global */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-zinc-700 mb-4">
          Historial de exportaciones ({logs.length})
        </h2>
        <PlatformDeploymentExportHistory logs={logs} showOrganization />
      </div>

    </div>
  );
}
