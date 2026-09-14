// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/organizations/page.tsx
//
// Listado de organizaciones Platform Admin.
// Solo accesible por super_admin.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }              from "@/lib/permissions/guards";
import { listPlatformOrganizationsQuery } from "@/modules/platform/queries/list-platform-organizations";
import { listPlatformVerticalsQuery }     from "@/modules/platform/queries/list-platform-verticals";
import { listPlatformPlansQuery }         from "@/modules/platform/queries/list-platform-plans";
import { PlatformOrganizationsClient }    from "@/modules/platform/components/platform-organizations-client";

export const metadata = {
  title: "Organizaciones — Platform Admin",
};

export default async function PlatformOrganizationsPage() {
  await requireSuperAdmin();

  const [result, verticals, plans] = await Promise.all([
    listPlatformOrganizationsQuery({ page_size: 500 }),
    listPlatformVerticalsQuery(false),
    // Activos e inactivos — el filtro de la tabla debe poder seguir
    // mostrando organizaciones ya asociadas a un plan desactivado.
    listPlatformPlansQuery(false),
  ]);

  // Gap V-B1.2 — solo planes activos pueden elegirse para NUEVAS
  // organizaciones. `plans` (con inactivos) sigue alimentando el filtro
  // de la tabla, que no asigna nada.
  const creatablePlans = plans.filter((p) => p.is_active);

  return (
    <PlatformOrganizationsClient
      initialItems={result.items}
      initialTotal={result.total}
      verticals={verticals}
      plans={plans}
      creatablePlans={creatablePlans}
    />
  );
}
