// ─────────────────────────────────────────────────────────────────
// platform — /dashboard/platform/provisioning/page.tsx
//
// Dashboard principal del Provisioning Manager.
// Lista todas las organizaciones con estado de provisioning.
// Solo super_admin.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin } from "@/lib/permissions/guards";
import { listProvisioningOrganizationsQuery } from "@/modules/platform/queries/list-provisioning-organizations";
import { PlatformProvisioningTable } from "@/modules/platform/components/platform-provisioning-table";

export const metadata = {
  title: "Provisioning Manager — Platform Admin",
};

export default async function PlatformProvisioningPage() {
  await requireSuperAdmin();

  const organizations = await listProvisioningOrganizationsQuery();

  // Contadores por estado para el resumen
  const counts = organizations.reduce(
    (acc, org) => {
      acc[org.provisioning_status] = (acc[org.provisioning_status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-800">Provisioning Manager</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Prepara y valida organizaciones antes del despliegue.
        </p>
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { key: "NOT_READY",   label: "No listo",    color: "text-zinc-500" },
          { key: "READY",       label: "Listo",       color: "text-green-600" },
          { key: "PROVISIONED", label: "Provisionado", color: "text-blue-600" },
          { key: "DEPLOYED",    label: "Desplegado",  color: "text-purple-600" },
          { key: "FAILED",      label: "Fallido",     color: "text-red-600" },
        ].map(({ key, label, color }) => (
          <div key={key} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{counts[key] ?? 0}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabla de organizaciones */}
      <PlatformProvisioningTable organizations={organizations} />

    </div>
  );
}
