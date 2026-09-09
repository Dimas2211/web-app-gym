// ─────────────────────────────────────────────────────────────────
// /dashboard/dte/monitoring — page.tsx
//
// FASE IV-C — Inspector de metering comercial DTE (fiscal.dte.monthly_issued).
// Guard: requireAdmin (super_admin | branch_admin) + fiscal.dte module.
// Read-only: no muestra ni permite ninguna escritura — el ledger solo
// se resuelve vía reconcileDteWithMh (botón "Consultar estado MH" en
// /dashboard/dte/outgoing, ver reconcile-dte-with-mh.action.ts).
//
// Runtime-aware: con sesión "Operar como cliente" activa, lee
// tenantId/locationId/PrismaClient del perfil runtime — mismo patrón
// que /dashboard/dte/outgoing y /dashboard/settings/dte.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  resolveEffectiveTenantContext,
  resolveRuntimeFirstLocationId,
} from "@/modules/platform/runtime/effective-tenant-context";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";
import { getDteMonitoringPanelData, isValidPeriodKey } from "@/modules/commerce/dte/queries/get-dte-monitoring-panel-data";
import { DteMonitoringPanel } from "@/modules/commerce/dte/monitoring/components/dte-monitoring-panel";

export const metadata = {
  title: "Monitoreo Fiscal DTE",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DteMonitoringPage({ searchParams }: PageProps) {
  const sessionUser = await requireAdmin();

  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  const { tenantId, client } = context;

  try {
    if (!tenantId) {
      return (
        <div className="p-6">
          <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3">
            La sesión no tiene un tenant activo.
          </div>
        </div>
      );
    }

    const commercialCtx = await requireOrganizationModule(tenantId, "fiscal.dte");

    const locationId = context.runtime
      ? await resolveRuntimeFirstLocationId(context)
      : await getEffectiveLocationId(sessionUser);

    if (!locationId) {
      return (
        <div className="p-6">
          <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3">
            {context.runtime
              ? "El tenant runtime no tiene ninguna sucursal activa."
              : "Selecciona una sucursal activa para ver el monitoreo fiscal DTE."}
          </div>
        </div>
      );
    }

    // Filtro de periodo — nunca strings arbitrarios/SQL-ish (^\d{4}-\d{2}$).
    const rawParams = await searchParams;
    const rawPeriod = Array.isArray(rawParams.period) ? rawParams.period[0] : rawParams.period;
    const requestedPeriodKey = isValidPeriodKey(rawPeriod) ? rawPeriod : null;

    const data = await getDteMonitoringPanelData({
      tenantId,
      commercialCtx,
      runtimeDb: client ?? prisma,
      requestedPeriodKey,
    });

    return (
      <div className="p-6 space-y-5 max-w-6xl mx-auto">
        <div>
          <h1 className="text-lg font-bold text-zinc-800">Monitoreo Fiscal DTE</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Consumo mensual, reservas pendientes de reconciliación e historial de metering — solo lectura.
          </p>
        </div>

        <DteMonitoringPanel data={data} isRuntimeSession={!!context.runtime} />
      </div>
    );
  } finally {
    await dispose();
  }
}
