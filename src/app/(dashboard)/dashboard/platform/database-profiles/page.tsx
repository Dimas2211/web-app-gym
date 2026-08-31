// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/database-profiles/page.tsx
//
// Página de administración de perfiles de conexión de base de datos.
// Solo accesible por super_admin.
// Carga organizaciones y perfiles server-side, delega UI al client.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }              from "@/lib/permissions/guards";
import { listPlatformOrganizationsQuery } from "@/modules/platform/queries/list-platform-organizations";
import { listDatabaseProfiles }           from "@/modules/platform/queries/list-database-profiles";
import { PlatformDatabaseProfilesClient } from "@/modules/platform/components/platform-database-profiles-client";

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

  const [orgsResult, profiles, params] = await Promise.all([
    listPlatformOrganizationsQuery({ page_size: 500 }),
    listDatabaseProfiles({}),
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
    <>
      {params.runtimeError && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
          <span>No se pudo abrir &quot;Operar como cliente&quot;: {params.runtimeError}</span>
        </div>
      )}
      <PlatformDatabaseProfilesClient
        profiles={organizations.length > 0 ? profiles : []}
        organizations={organizations}
        encryptionKeyMissing={encryptionKeyMissing}
      />
    </>
  );
}
