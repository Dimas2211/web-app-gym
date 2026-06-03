// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/manual-deployment/[jobId]
//
// Runbook de deployment manual con checklist interactivo,
// instrucciones de ENV, base de datos, seeds y smoke test.
// Solo super_admin.
// ─────────────────────────────────────────────────────────────────

import { notFound }                             from "next/navigation";
import Link                                     from "next/link";
import { ArrowLeft }                            from "lucide-react";

import { requireSuperAdmin }                    from "@/lib/permissions/guards";
import { getManualDeploymentJobByIdQuery }       from "@/modules/platform/queries/get-manual-deployment-job-by-id";
import { PlatformManualDeploymentDetail }        from "@/modules/platform/components/platform-manual-deployment-detail";

interface Props {
  params: Promise<{ jobId: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { jobId } = await params;
  const job       = await getManualDeploymentJobByIdQuery(jobId);
  return {
    title: job
      ? `Manual Deployment — ${job.org_details.name}`
      : "Runbook no encontrado",
  };
}

export default async function PlatformManualDeploymentDetailPage({ params }: Props) {
  await requireSuperAdmin();

  const { jobId } = await params;
  const job       = await getManualDeploymentJobByIdQuery(jobId);

  if (!job) notFound();
  if (job.deployment_mode !== "MANUAL") notFound();

  return (
    <div className="space-y-5">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard/platform/manual-deployment"
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          <ArrowLeft size={15} />
          Manual Deployment
        </Link>
        <span className="text-zinc-300">/</span>
        <span className="text-sm font-medium text-zinc-700">
          {job.org_details.name}
        </span>
      </div>

      {/* Runbook */}
      <PlatformManualDeploymentDetail job={job} />

    </div>
  );
}
