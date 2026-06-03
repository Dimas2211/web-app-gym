// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/plans/page.tsx
//
// Gestión visual de planes de licencia. Solo super_admin.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }        from "@/lib/permissions/guards";
import { listPlatformPlansQuery }   from "@/modules/platform/queries/list-platform-plans";
import { PlatformPlansTable }       from "@/modules/platform/components/platform-plans-table";

export const metadata = { title: "Planes — Platform Admin" };

export default async function PlatformPlansPage() {
  await requireSuperAdmin();

  const plans = await listPlatformPlansQuery(false);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-zinc-800">Planes de licencia</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Administra los planes disponibles para las organizaciones de la plataforma.
        </p>
      </div>

      <PlatformPlansTable plans={plans} />
    </div>
  );
}
