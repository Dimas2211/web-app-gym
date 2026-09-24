// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/organizations/[id]/page.tsx
//
// Detalle completo de una organización Platform Admin.
// Solo accesible por super_admin.
// ─────────────────────────────────────────────────────────────────

import { notFound }             from "next/navigation";
import { requireSuperAdmin }    from "@/lib/permissions/guards";

import { getPlatformOrganizationByIdQuery } from "@/modules/platform/queries/get-platform-organization-by-id";
import { listOrganizationModulesQuery }     from "@/modules/platform/queries/list-organization-modules";
import { listPlatformVerticalsQuery }       from "@/modules/platform/queries/list-platform-verticals";
import { listPlatformPlansQuery }           from "@/modules/platform/queries/list-platform-plans";
import { getPlatformBrandingQuery }         from "@/modules/platform/queries/get-platform-branding";
import { listDeploymentLogsQuery }          from "@/modules/platform/queries/list-deployment-logs";
import { getDteCorrelativeAlignmentPanelDataQuery } from "@/modules/platform/queries/get-dte-correlative-alignment-panel-data";
import { getEffectiveOrganizationEntitlements, getEffectiveOrganizationModules } from "@/modules/platform/lib/entitlements-resolver";
import { listSharedRuntimeTargets } from "@/modules/platform/queries/list-shared-runtime-targets";
import { listDatabaseProfiles } from "@/modules/platform/queries/list-database-profiles";
import { getRuntimeProvisioningOperationQuery } from "@/modules/platform/queries/get-runtime-provisioning-operation";

import { PlatformOrganizationDetail }         from "@/modules/platform/components/platform-organization-detail";
import { PlatformOrganizationModulesPanel }   from "@/modules/platform/components/platform-organization-modules-panel";
import { PlatformOrganizationEntitlementsPanel } from "@/modules/platform/components/platform-organization-entitlements-panel";
import { PlatformLicensePanel }               from "@/modules/platform/components/platform-license-panel";
import { PlatformOrganizationSettingsPanel }  from "@/modules/platform/components/platform-organization-settings-panel";
import { PlatformDeploymentSummary }          from "@/modules/platform/components/platform-deployment-summary";
import { PlatformBrandingPanel }              from "@/modules/platform/components/platform-branding-panel";
import { PlatformDeploymentLogsPanel }        from "@/modules/platform/components/platform-deployment-logs-panel";
import { PlatformDteCorrelativePanel }        from "@/modules/platform/components/platform-dte-correlative-panel";
import { PlatformRuntimeProvisioningPanel }   from "@/modules/platform/components/platform-runtime-provisioning-panel";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const org = await getPlatformOrganizationByIdQuery(id);
  return {
    title: org ? `${org.name} — Platform Admin` : "Organización no encontrada",
  };
}

export default async function PlatformOrganizationDetailPage({ params }: Props) {
  await requireSuperAdmin();

  const { id } = await params;

  const [org, orgModules, verticals, allPlans, branding, logs, dteCorrelatives, effectiveEntitlements, effectiveModules, activeSharedTargets, orgDatabaseProfiles, provisioningOperation] = await Promise.all([
    getPlatformOrganizationByIdQuery(id),
    listOrganizationModulesQuery(id),
    listPlatformVerticalsQuery(false),
    listPlatformPlansQuery(false),
    getPlatformBrandingQuery(id),
    listDeploymentLogsQuery(id, 30),
    getDteCorrelativeAlignmentPanelDataQuery(id),
    getEffectiveOrganizationEntitlements(id),
    getEffectiveOrganizationModules(id),
    listSharedRuntimeTargets({ is_active: true }),
    listDatabaseProfiles({ organization_id: id, is_active: true }),
    getRuntimeProvisioningOperationQuery(id),
  ]);

  if (!org) notFound();

  // Gap V-B1.2 — el selector de edición solo debe ofrecer planes activos
  // para NUEVAS asignaciones, pero si la organización ya tiene asignado un
  // plan que luego fue desactivado, ese plan debe seguir apareciendo (para
  // no romper el form ni sugerir que desapareció) — nunca se reactiva ni
  // se quita automáticamente.
  const activePlans = allPlans.filter((p) => p.is_active);
  const currentPlanInactive = org.plan && !activePlans.some((p) => p.id === org.plan!.id)
    ? allPlans.find((p) => p.id === org.plan!.id) ?? null
    : null;
  const plans = currentPlanInactive ? [...activePlans, currentPlanInactive] : activePlans;

  return (
    <div className="space-y-5">

      {/* Header, info general y edición completa */}
      <PlatformOrganizationDetail org={org} verticals={verticals} plans={plans} />

      {/* SHARED-PILOT-4A — Runtime (Shared/Dedicated) + provisioning manual */}
      <PlatformRuntimeProvisioningPanel
        organizationId={org.id}
        organizationTenantId={org.tenant_id}
        sharedRuntimeTarget={org.shared_runtime_target}
        hasActiveDedicatedProfile={orgDatabaseProfiles.length > 0}
        activeSharedTargets={activeSharedTargets}
        provisioningOperation={provisioningOperation}
      />

      {/* Gestión de licencia */}
      <PlatformLicensePanel org={org} />

      {/* Módulos — estado efectivo (plan + overrides), Bloque A */}
      <PlatformOrganizationModulesPanel
        organizationId={org.id}
        effectiveModules={effectiveModules}
      />

      {/* Bloque A — Límites/capacidades efectivas (plan + overrides) */}
      <PlatformOrganizationEntitlementsPanel
        organizationId={org.id}
        entitlements={effectiveEntitlements}
        planName={org.plan?.name ?? null}
      />

      {/* Configuración operativa */}
      <PlatformOrganizationSettingsPanel
        org={org}
        orgModules={orgModules}
        branding={branding}
      />

      {/* Deployment summary */}
      <PlatformDeploymentSummary
        org={org}
        orgModules={orgModules}
        branding={branding}
      />

      {/* Branding */}
      <PlatformBrandingPanel
        organizationId={org.id}
        branding={branding}
      />

      {/* Deployment logs */}
      <PlatformDeploymentLogsPanel logs={logs} />

      {/* F3-C24 — Alineación de correlativos DTE */}
      <PlatformDteCorrelativePanel organizationId={org.id} rows={dteCorrelatives.rows} />

    </div>
  );
}
