// ─────────────────────────────────────────────────────────────────
// /dashboard/dte/correlatives — page.tsx
//
// F3-C24 (corrección de acceso) — Alineación de correlativos DTE
// accesible desde el contexto operativo del tenant actual, SIN
// depender de PlatformOrganization (que puede estar vacía en una
// base cliente/runtime como esta). Usa tenant_id de la sesión y lista
// todas las sucursales/emisores DTE activos de ese tenant — el mismo
// cálculo que el panel embebido en Platform Admin → Organizaciones,
// pero resuelto directamente contra la sesión.
//
// Solo super_admin — mismo nivel de acceso que el resto de F3-C24.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getLocationById } from "@/core/modules/locations/queries";
import { listDteCorrelativeAlignmentRows } from "@/modules/commerce/dte/queries/list-dte-correlative-alignment-rows";
import { DteCorrelativesPanel } from "@/modules/commerce/dte/components/dte-correlatives-panel";

export const metadata = {
  title: "Correlativos DTE",
};

export default async function DteCorrelativesPage() {
  const sessionUser = await requireSuperAdmin();

  if (!sessionUser.tenant_id) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          La sesión no tiene un tenant activo — no se puede resolver contexto fiscal DTE.
        </div>
      </div>
    );
  }

  const [rows, effectiveLocationId] = await Promise.all([
    listDteCorrelativeAlignmentRows(sessionUser.tenant_id),
    getEffectiveLocationId(sessionUser),
  ]);

  const activeLocation = effectiveLocationId ? await getLocationById(effectiveLocationId) : null;

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="text-lg font-bold text-zinc-800">Correlativos DTE</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Alineación inicial de correlativos por sucursal, ambiente y tipo DTE — para empresas que migran
          desde otro sistema de facturación y ya tienen numeroControl usados ante Hacienda.
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          Sucursal activa: {activeLocation ? activeLocation.name : "— ninguna seleccionada (se muestran todas las sucursales del tenant) —"}
        </p>
      </div>

      <DteCorrelativesPanel rows={rows} />
    </div>
  );
}
