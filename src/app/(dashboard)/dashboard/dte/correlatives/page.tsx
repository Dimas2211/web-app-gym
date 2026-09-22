// ─────────────────────────────────────────────────────────────────
// /dashboard/dte/correlatives — page.tsx
//
// F3-C24 (corrección de acceso) — Alineación de correlativos DTE
// accesible desde el contexto operativo del tenant actual, SIN
// depender de PlatformOrganization (que puede estar vacía en una
// base cliente/runtime como esta). Usa el tenant efectivo de la
// sesión y lista todas las sucursales/emisores DTE activos de ese
// tenant — el mismo cálculo que el panel embebido en Platform Admin →
// Organizaciones, pero resuelto directamente contra la sesión.
//
// Runtime-aware (bug residual post FASE IV-A): con sesión "Operar como
// cliente" activa, lee tenantId/PrismaClient del perfil runtime en vez
// de sessionUser.tenant_id — mismo patrón que
// /dashboard/dte/outgoing. Ningún control de alineación se muestra
// durante runtime — solo lectura.
//
// Solo super_admin — mismo nivel de acceso que el resto de F3-C24.
// ─────────────────────────────────────────────────────────────────

import { requireGlobalAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getLocationById } from "@/core/modules/locations/queries";
import {
  resolveEffectiveTenantContext,
  resolveRuntimeFirstLocationId,
} from "@/modules/platform/runtime/effective-tenant-context";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";
import { listDteCorrelativeAlignmentRows } from "@/modules/commerce/dte/queries/list-dte-correlative-alignment-rows";
import { DteCorrelativesPanel } from "@/modules/commerce/dte/components/dte-correlatives-panel";

export const metadata = {
  title: "Correlativos DTE",
};

export default async function DteCorrelativesPage() {
  const sessionUser = await requireGlobalAdmin();

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

    await requireOrganizationModule(tenantId, "fiscal.dte");

    const [rows, effectiveLocationId] = await Promise.all([
      listDteCorrelativeAlignmentRows(tenantId, client),
      context.runtime
        ? resolveRuntimeFirstLocationId(context)
        : (context.locationId ??
          getEffectiveLocationId(sessionUser, context.client, context.tenantId)),
    ]);

    const activeLocation = effectiveLocationId
      ? await getLocationById(effectiveLocationId, client)
      : null;

    return (
      <div className="mx-auto max-w-6xl space-y-5 p-6">
        <div>
          <h1 className="text-lg font-bold text-zinc-800">Correlativos DTE</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Alineación inicial de correlativos por sucursal, ambiente y tipo DTE — para empresas que
            migran desde otro sistema de facturación y ya tienen numeroControl usados ante Hacienda.
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Sucursal activa:{" "}
            {activeLocation
              ? activeLocation.name
              : "— ninguna seleccionada (se muestran todas las sucursales del tenant) —"}
          </p>
        </div>

        <DteCorrelativesPanel rows={rows} readOnly={!!context.runtime} />
      </div>
    );
  } finally {
    await dispose();
  }
}
