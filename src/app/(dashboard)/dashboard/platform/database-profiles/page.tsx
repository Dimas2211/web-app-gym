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

export default async function PlatformDatabaseProfilesPage() {
  await requireSuperAdmin();

  const [orgsResult, profiles] = await Promise.all([
    listPlatformOrganizationsQuery({ page_size: 500 }),
    listDatabaseProfiles({}),
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
    <PlatformDatabaseProfilesClient
      profiles={organizations.length > 0 ? profiles : []}
      organizations={organizations}
      encryptionKeyMissing={encryptionKeyMissing}
    />
  );
}
