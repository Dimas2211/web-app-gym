// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/modules/page.tsx
//
// Gestión visual del catálogo global de módulos. Solo super_admin.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }           from "@/lib/permissions/guards";
import { listPlatformModulesQuery }    from "@/modules/platform/queries/list-platform-modules";
import { listPlatformVerticalsQuery }  from "@/modules/platform/queries/list-platform-verticals";
import { PlatformModulesTable }        from "@/modules/platform/components/platform-modules-table";

export const metadata = { title: "Módulos — Platform Admin" };

export default async function PlatformModulesPage() {
  await requireSuperAdmin();

  const [modules, verticals] = await Promise.all([
    listPlatformModulesQuery(),
    listPlatformVerticalsQuery(false),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-zinc-800">Módulos</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Catálogo global de módulos disponibles en la plataforma.
        </p>
      </div>

      <PlatformModulesTable modules={modules} verticals={verticals} />
    </div>
  );
}
