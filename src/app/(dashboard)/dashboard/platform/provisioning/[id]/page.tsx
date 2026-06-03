// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/provisioning/[id]/page.tsx
//
// Detalle de provisioning de una organización.
// Muestra checklist, summary, package y logs.
// Solo super_admin.
// ─────────────────────────────────────────────────────────────────

import { notFound }          from "next/navigation";
import Link                  from "next/link";
import { ArrowLeft }         from "lucide-react";
import { requireSuperAdmin } from "@/lib/permissions/guards";

import { getProvisioningPackageQuery }  from "@/modules/platform/queries/get-provisioning-package";
import { listProvisioningLogsQuery }    from "@/modules/platform/queries/list-provisioning-logs";

import { PlatformProvisioningDetailClient } from "@/modules/platform/components/platform-provisioning-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const pkg = await getProvisioningPackageQuery(id);
  return {
    title: pkg
      ? `Provisioning — ${pkg.config.organization_name}`
      : "Organización no encontrada",
  };
}

export default async function PlatformProvisioningDetailPage({ params }: Props) {
  await requireSuperAdmin();

  const { id } = await params;

  const [pkg, logs] = await Promise.all([
    getProvisioningPackageQuery(id),
    listProvisioningLogsQuery(id, 30),
  ]);

  if (!pkg) notFound();

  return (
    <div className="space-y-5">

      {/* Navegación */}
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard/platform/provisioning"
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          <ArrowLeft size={15} />
          Provisioning
        </Link>
        <span className="text-zinc-300">/</span>
        <span className="text-sm font-medium text-zinc-700">
          {pkg.config.organization_name}
        </span>
      </div>

      {/* Contenido interactivo */}
      <PlatformProvisioningDetailClient
        organizationId={pkg.organization_id}
        organizationName={pkg.config.organization_name}
        provisioningStatus={pkg.provisioning_status}
        pkg={pkg}
        logs={logs}
      />

    </div>
  );
}
