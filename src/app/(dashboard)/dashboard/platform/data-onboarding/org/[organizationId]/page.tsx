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
import { resolveDataOnboardingGymAccessForDisplay } from "@/modules/platform/lib/data-onboarding/gym-data-onboarding-access";

interface Props {
  params: Promise<{ organizationId: string }>;
}

// ONBOARDING-5K: las Server Actions del Data Onboarding (preview, dry-run,
// import de hasta 5,000 registros) heredan este límite de la página. 60 s
// es válido en todos los planes de Vercel; la transacción de escritura
// (DATA_ONBOARDING_TX_OPTIONS.timeout = 45 s) termina o revierte antes.
export const maxDuration = 60;

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

  // GYM-ONBOARDING: visibilidad de la sección GYM resuelta server-side.
  const gymAccess = await resolveDataOnboardingGymAccessForDisplay(header.tenantId);

  return <PlatformDataOnboardingClient header={header} gymAccess={gymAccess} />;
}
