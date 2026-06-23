// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/data-onboarding/[profileId]
//
// E0: Data Onboarding Center — foundation read-only.
// Solo super_admin. Carga metadatos seguros del perfil desde el
// control plane y delega la UI al componente cliente.
//
// Reglas de seguridad E0:
// - No pasa encrypted_password al cliente.
// - No construye DATABASE_URL.
// - No ejecuta queries contra la base destino.
// - No crea actions de escritura.
// - No sube archivos.
// - No ejecuta importaciones ni exportaciones.
// ─────────────────────────────────────────────────────────────────

import { notFound }          from "next/navigation";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma }            from "@/lib/db/prisma";
import { PlatformDataOnboardingClient } from "@/modules/platform/components/platform-data-onboarding-client";
import type { DataOnboardingProfileHeader } from "@/modules/platform/types/platform.types";

interface Props {
  params: Promise<{ profileId: string }>;
}

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

  // Cargar solo metadatos seguros — sin encrypted_password ni DATABASE_URL
  const raw = await prisma.platformDatabaseProfile.findUnique({
    where:  { id: profileId },
    select: {
      id:               true,
      label:            true,
      db_host:          true,
      db_port:          true,
      db_name:          true,
      db_user:          true,
      ssl_mode:         true,
      environment:      true,
      is_active:        true,
      last_test_status: true,
      last_tested_at:   true,
      organization: {
        select: { id: true, code: true, name: true },
      },
    },
  });

  if (!raw) notFound();

  // Serializar Date → string para el paso Server → Client Component
  const profile: DataOnboardingProfileHeader = {
    id:               raw.id,
    label:            raw.label,
    db_host:          raw.db_host,
    db_port:          raw.db_port,
    db_name:          raw.db_name,
    db_user:          raw.db_user,
    ssl_mode:         String(raw.ssl_mode),
    environment:      String(raw.environment),
    is_active:        raw.is_active,
    last_test_status: String(raw.last_test_status),
    last_tested_at:   raw.last_tested_at?.toISOString() ?? null,
    organization:     raw.organization,
  };

  return <PlatformDataOnboardingClient profile={profile} />;
}
