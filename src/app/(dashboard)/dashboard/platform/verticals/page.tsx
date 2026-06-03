// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/verticals/page.tsx
//
// Gestión visual de verticales de industria. Solo super_admin.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }           from "@/lib/permissions/guards";
import { listPlatformVerticalsQuery }  from "@/modules/platform/queries/list-platform-verticals";
import { PlatformVerticalsTable }      from "@/modules/platform/components/platform-verticals-table";

export const metadata = { title: "Verticales — Platform Admin" };

export default async function PlatformVerticalsPage() {
  await requireSuperAdmin();

  const verticals = await listPlatformVerticalsQuery(false);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-zinc-800">Verticales de industria</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Administra las verticales disponibles: GYM, RETAIL, CLINIC, VETERINARY, GENERAL y otras.
        </p>
      </div>

      <PlatformVerticalsTable verticals={verticals} />
    </div>
  );
}
