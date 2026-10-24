// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/data-onboarding/[profileId]
//
// Link histórico (Dedicated) del Data Onboarding Center, por perfil.
//
// SHARED-OPS-PARITY-1: converge con la ruta organization-scoped
// (/data-onboarding/org/[organizationId]). El perfil solo FIJA qué base
// Dedicated usar; la identidad operativa sigue siendo la organización
// dueña del perfil y el tenant sale de PlatformOrganization.tenant_id.
// Las actions reciben organizationId + profileId y lo re-validan
// server-side.
//
// Seguridad: solo super_admin; al cliente solo viaja
// OrganizationRuntimeHeader (sin encrypted_password ni DATABASE_URL).
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma }            from "@/lib/db/prisma";
import {
  resolveOrganizationRuntime,
  isOrganizationRuntimeResolutionError,
} from "@/modules/platform/runtime/resolve-organization-runtime";
import { PlatformDataOnboardingClient } from "@/modules/platform/components/platform-data-onboarding-client";
import { DataOnboardingUnavailable } from "@/modules/platform/components/data-onboarding-unavailable";
import { resolveDataOnboardingGymAccessForDisplay } from "@/modules/platform/lib/data-onboarding/gym-data-onboarding-access";

interface Props {
  params: Promise<{ profileId: string }>;
}

// ONBOARDING-5K: las Server Actions del Data Onboarding (preview, dry-run,
// import de hasta 5,000 registros) heredan este límite de la página. 60 s
// es válido en todos los planes de Vercel; la transacción de escritura
// (DATA_ONBOARDING_TX_OPTIONS.timeout = 45 s) termina o revierte antes.
export const maxDuration = 60;

export async function generateMetadata({ params }: Props) {
  const { profileId } = await params;
  const profile = await prisma.platformDatabaseProfile.findUnique({
    where:  { id: profileId },
    select: { label: true, organization: { select: { name: true } } },
  });
  return {
    title: profile
      ? `Data Onboarding — ${profile.label} (${profile.organization.name})`
      : "Perfil no encontrado",
  };
}

export default async function PlatformDataOnboardingPage({ params }: Props) {
  await requireSuperAdmin();

  const { profileId } = await params;

  let header;
  try {
    ({ header } = await resolveOrganizationRuntime({ profileId }));
  } catch (err) {
    if (isOrganizationRuntimeResolutionError(err)) {
      return <DataOnboardingUnavailable reason={err.message} />;
    }
    throw err;
  }

  // GYM-ONBOARDING: visibilidad de la sección GYM resuelta server-side.
  const gymAccess = await resolveDataOnboardingGymAccessForDisplay(header.tenantId);

  return <PlatformDataOnboardingClient header={header} gymAccess={gymAccess} />;
}
