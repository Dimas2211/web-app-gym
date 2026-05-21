// ─────────────────────────────────────────────────────────────────
// /dashboard/dte/outgoing — page.tsx
//
// Vista global fiscal de DTE emitidos.
// Guard: requireAdmin (super_admin | branch_admin).
// Seguridad: tenant_id y location_id se inyectan desde el servidor.
// searchParams nunca se usan para resolver tenantId/locationId.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { listDteOutgoingGlobal } from "@/modules/commerce/dte/outgoing/queries/list-dte-outgoing-global";
import { dteOutgoingFiltersSchema } from "@/modules/commerce/dte/outgoing/schemas";
import { DteOutgoingClient } from "@/modules/commerce/dte/outgoing/components/dte-outgoing-client";

export const metadata = {
  title: "DTE Emitidos",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DteOutgoingPage({ searchParams }: PageProps) {
  const sessionUser = await requireAdmin();
  const tenantId    = sessionUser.tenant_id;
  const locationId  = await getEffectiveLocationId(sessionUser);

  if (!tenantId) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-zinc-500">
        Sesión sin tenant activo.
      </div>
    );
  }

  if (!locationId) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-zinc-500">
        Seleccione una location de trabajo para ver los DTE emitidos.
      </div>
    );
  }

  // Parsear filtros desde searchParams — nunca contienen tenantId/locationId.
  const rawParams = await searchParams;
  const parsedFilters = dteOutgoingFiltersSchema.safeParse({
    search:      rawParams.search,
    dteType:     rawParams.dteType,
    status:      rawParams.status,
    environment: rawParams.environment,
    dateFrom:    rawParams.dateFrom,
    dateTo:      rawParams.dateTo,
    sortField:   rawParams.sortField,
    sortDir:     rawParams.sortDir,
    page:        rawParams.page,
    pageSize:    rawParams.pageSize,
  });

  const filters = parsedFilters.success ? parsedFilters.data : { page: 1, pageSize: 50 };

  const initialResult = await listDteOutgoingGlobal({
    tenantId,
    locationId,
    ...filters,
  });

  return (
    <DteOutgoingClient
      initialResult={initialResult}
      initialFilters={filters}
    />
  );
}
