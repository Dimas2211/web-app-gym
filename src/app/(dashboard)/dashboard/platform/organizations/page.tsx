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
    listPlatformPlansQuery(false),
  ]);

  return (
    <PlatformOrganizationsClient
      initialItems={result.items}
      initialTotal={result.total}
      verticals={verticals}
      plans={plans}
    />
  );
}
