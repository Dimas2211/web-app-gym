// ─────────────────────────────────────────────────────────────────
// /dashboard/settings/dte — page.tsx
//
// "Facturación Electrónica" — configuración DTE TEST/PRODUCTION para
// el tenant/location de la sesión. Accesible por super_admin y
// branch_admin (requireAdmin), no exclusiva de Platform Admin —
// F-DTE-ENV, Auditoría TEST/PROD, gap completado.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getLocationById } from "@/core/modules/locations/queries";
import { getDteEnvironmentPanelData } from "@/modules/commerce/dte/queries/get-dte-environment-panel-data";
import { DteEnvironmentSettingsPanel } from "@/modules/commerce/dte/settings/components/dte-environment-settings-panel";

export const metadata = {
  title: "Facturación Electrónica",
};

export default async function DteSettingsPage() {
  const sessionUser = await requireAdmin();

  if (!sessionUser.tenant_id) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          La sesión no tiene un tenant activo — no se puede resolver contexto fiscal DTE.
        </div>
      </div>
    );
  }

  const location_id = await getEffectiveLocationId(sessionUser);

  if (!location_id) {
    return (
      <div className="p-6">
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3">
          Selecciona una sucursal activa para ver/administrar su configuración de Facturación Electrónica.
        </div>
      </div>
    );
  }

  const [data, activeLocation] = await Promise.all([
    getDteEnvironmentPanelData(sessionUser.tenant_id, location_id),
    getLocationById(location_id),
  ]);

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="text-lg font-bold text-zinc-800">Facturación Electrónica</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Ambiente, emisor y credenciales DTE ante el Ministerio de Hacienda para esta sucursal.
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          Sucursal: {activeLocation ? activeLocation.name : "—"}
        </p>
      </div>

      <DteEnvironmentSettingsPanel data={data} />

      <p className="text-xs text-zinc-400">
        Activar PRODUCCIÓN no transmite ni modifica documentos existentes — solo determina el ambiente de
        los próximos Documentos Tributarios Electrónicos que se generen para esta sucursal.
      </p>
    </div>
  );
}
