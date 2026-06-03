// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/deployment-preparation/[id]
//
// Detalle de Deployment Preparation para una organización.
// Muestra provisioning + bundle + historial de exportaciones.
// Solo super_admin.
// ─────────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import Link         from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireSuperAdmin }           from "@/lib/permissions/guards";
import { getProvisioningPackageQuery } from "@/modules/platform/queries/get-provisioning-package";
import { listDeploymentExportLogsQuery } from "@/modules/platform/queries/list-deployment-export-logs";
import { PlatformDeploymentPreparationDetailClient } from "@/modules/platform/components/platform-deployment-preparation-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const pkg = await getProvisioningPackageQuery(id);
  return {
    title: pkg
      ? `Deployment Preparation — ${pkg.config.organization_name}`
      : "Organización no encontrada",
  };
}

export default async function PlatformDeploymentPreparationDetailPage({ params }: Props) {
  await requireSuperAdmin();

  const { id } = await params;

  const [pkg, exportLogs] = await Promise.all([
    getProvisioningPackageQuery(id),
    listDeploymentExportLogsQuery(id, 50),
  ]);

  if (!pkg) notFound();

  return (
    <div className="space-y-5">

      {/* Navegación */}
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard/platform/deployment-preparation"
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          <ArrowLeft size={15} />
          Deployment Preparation
        </Link>
        <span className="text-zinc-300">/</span>
        <span className="text-sm font-medium text-zinc-700">
          {pkg.config.organization_name}
        </span>
      </div>

      {/* Contenido */}
      <PlatformDeploymentPreparationDetailClient
        organizationId={pkg.organization_id}
        organizationName={pkg.config.organization_name}
        organizationCode={pkg.config.organization_code}
        provisioningStatus={pkg.provisioning_status}
        pkg={pkg}
        exportLogs={exportLogs}
      />

    </div>
  );
}
