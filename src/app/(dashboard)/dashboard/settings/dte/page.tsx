// ─────────────────────────────────────────────────────────────────
// /dashboard/settings/dte — page.tsx
//
// "Facturación Electrónica" — configuración DTE TEST/PRODUCTION para
// el tenant/location de la sesión. Accesible por super_admin y
// branch_admin (requireAdmin), no exclusiva de Platform Admin —
// F-DTE-ENV, Auditoría TEST/PROD, gap completado.
//
// Runtime-aware (bug residual post FASE IV-A): con sesión "Operar como
// cliente" activa, lee tenantId/PrismaClient del perfil runtime en vez
// de sessionUser.tenant_id — mismo patrón que
// /dashboard/dte/outgoing (resolveEffectiveTenantContext +
// resolveRuntimeFirstLocationId). No reutiliza getEffectiveLocationId
// en modo runtime — esa cookie pertenece al tenant real del super_admin,
// no al tenant runtime. Panel se renderiza read-only (canManage=false)
// mientras la sesión runtime está activa — writes siguen bloqueadas
// además a nivel de Server Action (defensa en profundidad).
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getLocationById } from "@/core/modules/locations/queries";
import {
  resolveEffectiveTenantContext,
  resolveRuntimeFirstLocationId,
} from "@/modules/platform/runtime/effective-tenant-context";
import { getDteEnvironmentPanelData } from "@/modules/commerce/dte/queries/get-dte-environment-panel-data";
import { DteEnvironmentSettingsPanel } from "@/modules/commerce/dte/settings/components/dte-environment-settings-panel";

export const metadata = {
  title: "Facturación Electrónica",
};

export default async function DteSettingsPage() {
  const sessionUser = await requireAdmin();

  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  const { tenantId, client } = context;

  try {
    if (!tenantId) {
      return (
        <div className="p-6">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            La sesión no tiene un tenant activo — no se puede resolver contexto fiscal DTE.
          </div>
        </div>
      );
    }

    const location_id = context.runtime
      ? await resolveRuntimeFirstLocationId(context)
      : (context.locationId ??
        (await getEffectiveLocationId(sessionUser, context.client, context.tenantId)));

    if (!location_id) {
      return (
        <div className="p-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {context.runtime
              ? "El tenant runtime no tiene ninguna sucursal activa — no se puede resolver contexto fiscal DTE."
              : "Selecciona una sucursal activa para ver/administrar su configuración de Facturación Electrónica."}
          </div>
        </div>
      );
    }

    const [data, activeLocation] = await Promise.all([
      getDteEnvironmentPanelData(tenantId, location_id, client),
      getLocationById(location_id, tenantId, client),
    ]);

    return (
      <div className="mx-auto max-w-5xl space-y-5 p-6">
        <div>
          <h1 className="text-lg font-bold text-zinc-800">Facturación Electrónica</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Ambiente, emisor y credenciales DTE ante el Ministerio de Hacienda para esta sucursal.
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Sucursal: {activeLocation ? activeLocation.name : "—"}
          </p>
        </div>

        <DteEnvironmentSettingsPanel data={data} readOnly={!!context.runtime} />

        <p className="text-xs text-zinc-400">
          Activar PRODUCCIÓN no transmite ni modifica documentos existentes — solo determina el
          ambiente de los próximos Documentos Tributarios Electrónicos que se generen para esta
          sucursal.
        </p>
      </div>
    );
  } finally {
    await dispose();
  }
}
