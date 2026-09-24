// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/data-onboarding/org/[organizationId]
//
// SHARED-OPS-PARITY-1. Data Onboarding Center ORGANIZATION-SCOPED.
// Funciona igual para organizaciones Shared y Dedicated: la identidad
// operativa es organizationId, el runtime y el tenant se resuelven
// server-side (resolveOrganizationRuntime → Runtime Router).
//
// Seguridad: solo super_admin; al cliente solo viaja
// OrganizationRuntimeHeader (sin encrypted_password ni DATABASE_URL).
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin } from "@/lib/permissions/guards";
import { controlPlanePrisma } from "@/modules/platform/runtime/control-plane-prisma";
import {
  resolveOrganizationRuntime,
  isOrganizationRuntimeResolutionError,
} from "@/modules/platform/runtime/resolve-organization-runtime";
import { PlatformDataOnboardingClient } from "@/modules/platform/components/platform-data-onboarding-client";
import { DataOnboardingUnavailable } from "@/modules/platform/components/data-onboarding-unavailable";

interface Props {
  params: Promise<{ organizationId: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { organizationId } = await params;
  const org = await controlPlanePrisma.platformOrganization.findUnique({
    where:  { id: organizationId },
    select: { name: true, code: true },
  });
  return {
    title: org ? `Data Onboarding — ${org.name} (${org.code})` : "Organización no encontrada",
  };
}

export default async function PlatformOrganizationDataOnboardingPage({ params }: Props) {
  await requireSuperAdmin();

  const { organizationId } = await params;

  let header;
  try {
    ({ header } = await resolveOrganizationRuntime({ organizationId }));
  } catch (err) {
    if (isOrganizationRuntimeResolutionError(err)) {
      return <DataOnboardingUnavailable reason={err.message} />;
    }
    throw err;
  }

  return <PlatformDataOnboardingClient header={header} />;
}
