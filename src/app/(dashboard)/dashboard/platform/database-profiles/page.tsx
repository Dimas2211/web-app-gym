// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/database-profiles/page.tsx
//
// Página de administración de perfiles de conexión de base de datos.
// Solo accesible por super_admin.
// Carga organizaciones, perfiles Dedicated y Shared Runtime Targets
// server-side, delega UI a dos secciones independientes (SHARED /
// DEDICATED) — modelos distintos, no se mezclan.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }              from "@/lib/permissions/guards";
import { listPlatformOrganizationsQuery } from "@/modules/platform/queries/list-platform-organizations";
import { listDatabaseProfiles }           from "@/modules/platform/queries/list-database-profiles";
import { listSharedRuntimeTargets }       from "@/modules/platform/queries/list-shared-runtime-targets";
import { PlatformDatabaseProfilesClient } from "@/modules/platform/components/platform-database-profiles-client";
import { PlatformSharedRuntimeTargetsPanel } from "@/modules/platform/components/platform-shared-runtime-targets-panel";

export const metadata = {
  title: "Perfiles de BD — Platform Admin",
};

export default async function PlatformDatabaseProfilesPage({
  searchParams,
}: {
  // PASO 6A: enterClientRuntimeAction redirige aquí con ?runtimeError=
  // cuando "Operar como cliente" falla (perfil inactivo, sin tenant, etc.)
  searchParams: Promise<{ runtimeError?: string }>;
}) {
  await requireSuperAdmin();

  const [orgsResult, profiles, sharedTargets, params] = await Promise.all([
    listPlatformOrganizationsQuery({ page_size: 500 }),
    listDatabaseProfiles({}),
    // Shared targets no dependen de organizations — se listan siempre
    listSharedRuntimeTargets({}),
    searchParams,
  ]);

  // Verificación server-side de la clave de cifrado
  // Segura: process.env solo se evalúa en el servidor, nunca se expone al cliente
  const encryptionKeyMissing = !process.env.PLATFORM_ENCRYPTION_KEY;

  const organizations = orgsResult.items.map((o) => ({
    id:   o.id,
    code: o.code,
    name: o.name,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-zinc-800">Perfiles de base de datos</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Shared Runtime Targets (base compartida) y perfiles Dedicated (una base por organización).
        </p>
      </div>
      {params.runtimeError && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
          <span>No se pudo abrir &quot;Operar como cliente&quot;: {params.runtimeError}</span>
        </div>
      )}
      <PlatformSharedRuntimeTargetsPanel
        targets={sharedTargets}
        encryptionKeyMissing={encryptionKeyMissing}
      />
      <PlatformDatabaseProfilesClient
        profiles={organizations.length > 0 ? profiles : []}
        organizations={organizations}
        encryptionKeyMissing={encryptionKeyMissing}
      />
    </div>
  );
}
