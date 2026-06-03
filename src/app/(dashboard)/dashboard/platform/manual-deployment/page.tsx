// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/manual-deployment
//
// Lista de Deployment Jobs en modo MANUAL.
// Permite crear nuevos jobs manuales para orgs con bundle exportado.
// Solo super_admin.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }              from "@/lib/permissions/guards";
import { listManualDeploymentJobsQuery }  from "@/modules/platform/queries/list-manual-deployment-jobs";
import { prisma }                         from "@/lib/db/prisma";
import { PlatformManualDeploymentTable }  from "@/modules/platform/components/platform-manual-deployment-table";
import { PlatformCreateManualDeploymentButton } from "@/modules/platform/components/platform-create-manual-deployment-button";

export const metadata = { title: "Manual Deployment — Platform" };

export default async function PlatformManualDeploymentPage() {
  await requireSuperAdmin();

  const [jobs, orgs] = await Promise.all([
    listManualDeploymentJobsQuery(),

    // Orgs candidatas: provisioning READY o superior, con bundle exportado
    prisma.platformOrganization.findMany({
      where: {
        provisioning_status: { in: ["READY", "PROVISIONED", "DEPLOYED"] },
        license_status:      { not: "CANCELLED" },
        export_logs: {
          some: { export_type: "DEPLOYMENT_BUNDLE", result: "SUCCESS" },
        },
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-5">

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Manual Deployment</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Guía operativa paso a paso para desplegar una instancia manualmente.
          </p>
        </div>
        {orgs.length > 0 && (
          <PlatformCreateManualDeploymentButton organizations={orgs} />
        )}
      </div>

      {orgs.length === 0 && jobs.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm text-amber-700">
            No hay organizaciones listas para deployment manual. Asegúrate de que tengan:
            provisioning READY, Deployment Bundle exportado, y módulos activos.
          </p>
        </div>
      )}

      {/* Leyenda de flujo */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">Flujo de Manual Deployment</h3>
        <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
          <li>Crear un deployment job manual para la organización.</li>
          <li>Abrir el runbook (botón Ver Runbook).</li>
          <li>Seguir los 11 pasos del checklist marcándolos a medida que avanzas.</li>
          <li>Revisar las instrucciones de ENV, Base de Datos, Seeds y Smoke Test.</li>
          <li>Marcar el job como Deployed o Fallido al finalizar.</li>
        </ol>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">
          Jobs de Deployment Manual ({jobs.length})
        </h2>
        <PlatformManualDeploymentTable jobs={jobs} />
      </div>

    </div>
  );
}
