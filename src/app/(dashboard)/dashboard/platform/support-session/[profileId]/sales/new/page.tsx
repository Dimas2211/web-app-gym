// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/support-session/[profileId]/sales/new
//
// F1-B1: Crear venta de prueba desde Support Session, usando el
// PlatformDatabaseProfile seleccionado. Solo super_admin. No cambia
// DATABASE_URL global — la app normal sigue conectada al .env.
// ─────────────────────────────────────────────────────────────────

import { notFound }          from "next/navigation";
import Link                  from "next/link";
import { ArrowLeft }         from "lucide-react";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { prisma }            from "@/lib/db/prisma";
import { SupportSaleForm }   from "@/modules/platform/components/support-session/support-sale-form";

interface Props {
  params: Promise<{ profileId: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { profileId } = await params;
  const profile = await prisma.platformDatabaseProfile.findUnique({
    where:  { id: profileId },
    select: { label: true },
  });
  return {
    title: profile ? `Nueva venta de prueba — ${profile.label}` : "Perfil no encontrado",
  };
}

export default async function SupportSessionNewSalePage({ params }: Props) {
  await requireSuperAdmin();

  const { profileId } = await params;

  const profile = await prisma.platformDatabaseProfile.findUnique({
    where:  { id: profileId },
    select: { id: true, label: true, environment: true },
  });

  if (!profile) notFound();

  return (
    <div className="space-y-5">
      <Link
        href={`/dashboard/platform/support-session/${profile.id}`}
        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
      >
        <ArrowLeft size={13} />
        Volver a sesión de soporte
      </Link>

      <div>
        <h1 className="text-xl font-bold text-zinc-800">Soporte / Nueva venta de prueba</h1>
        <p className="text-sm text-zinc-500">{profile.label}</p>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <SupportSaleForm
          profileId={profile.id}
          profileLabel={profile.label}
          environment={String(profile.environment)}
        />
      </div>
    </div>
  );
}
