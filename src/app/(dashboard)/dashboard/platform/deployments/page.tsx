// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/deployments
//
// Dashboard de Deployment Jobs.
// Lista todos los jobs con filtros por estado, ambiente y org.
// Solo super_admin.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }          from "@/lib/permissions/guards";
import { listDeploymentJobsQuery }    from "@/modules/platform/queries/list-deployment-jobs";
import { PlatformDeploymentJobsClient } from "@/modules/platform/components/platform-deployment-jobs-client";

export const metadata = { title: "Deployment Jobs — Platform" };

export default async function PlatformDeploymentsPage() {
  await requireSuperAdmin();

  const jobs = await listDeploymentJobsQuery({ page_size: 100 });

  return (
    <div className="space-y-5">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Deployment Jobs</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Historial de jobs de deployment automatizados (simulación).
          </p>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-4">
        <PlatformDeploymentJobsClient jobs={jobs} />
      </div>

    </div>
  );
}
