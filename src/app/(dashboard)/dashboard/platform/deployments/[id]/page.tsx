// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/deployments/[id]
//
// Detalle de un Deployment Job con sus steps.
// Permite ejecutar simulación si el job está PENDING.
// Solo super_admin.
// ─────────────────────────────────────────────────────────────────

import { notFound }               from "next/navigation";
import Link                       from "next/link";
import { ArrowLeft }              from "lucide-react";

import { requireSuperAdmin }        from "@/lib/permissions/guards";
import { getDeploymentJobByIdQuery } from "@/modules/platform/queries/get-deployment-job-by-id";
import { PlatformDeploymentJobDetail } from "@/modules/platform/components/platform-deployment-job-detail";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const job    = await getDeploymentJobByIdQuery(id);
  return {
    title: job
      ? `Deployment Job — ${job.organization.name}`
      : "Job no encontrado",
  };
}

export default async function PlatformDeploymentJobDetailPage({ params }: Props) {
  await requireSuperAdmin();

  const { id } = await params;
  const job    = await getDeploymentJobByIdQuery(id);

  if (!job) notFound();

  return (
    <div className="space-y-5">

      {/* Navegación */}
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard/platform/deployments"
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          <ArrowLeft size={15} />
          Deployment Jobs
        </Link>
        <span className="text-zinc-300">/</span>
        <span className="text-sm font-medium text-zinc-700">
          {job.organization.name}
        </span>
      </div>

      {/* Detalle */}
      <PlatformDeploymentJobDetail job={job} />

    </div>
  );
}
