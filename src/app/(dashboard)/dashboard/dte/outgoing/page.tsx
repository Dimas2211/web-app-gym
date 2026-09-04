// ─────────────────────────────────────────────────────────────────
// /dashboard/dte/outgoing — page.tsx
//
// Vista global fiscal de DTE emitidos.
// Guard: requireAdmin (super_admin | branch_admin).
// Seguridad: tenant_id y location_id se inyectan desde el servidor.
// searchParams nunca se usan para resolver tenantId/locationId.
//
// PASO 6A (corrección de alcance): página runtime-aware. Con sesión
// "Operar como cliente" activa, lee tenantId/locationId/PrismaClient
// del perfil runtime — solo LECTURA de documentos ya existentes.
// No se toca generación, firma, transmisión ni invalidación.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  resolveEffectiveTenantContext,
  resolveRuntimeFirstLocationId,
} from "@/modules/platform/runtime/effective-tenant-context";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";
import { listDteOutgoingGlobal } from "@/modules/commerce/dte/outgoing/queries/list-dte-outgoing-global";
import { dteOutgoingFiltersSchema } from "@/modules/commerce/dte/outgoing/schemas";
import { DteOutgoingClient } from "@/modules/commerce/dte/outgoing/components/dte-outgoing-client";
import { getExternalDteMariaDbConfig } from "@/modules/commerce/dte/config/external-dte-mariadb.config";

export const metadata = {
  title: "DTE Emitidos",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DteOutgoingPage({ searchParams }: PageProps) {
  const sessionUser = await requireAdmin();

  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  const { tenantId, client } = context;

  try {
    if (tenantId) await requireOrganizationModule(tenantId, "fiscal.dte");
    if (!tenantId) {
      return (
        <div className="flex h-48 items-center justify-center text-sm text-zinc-500">
          Sesión sin tenant activo.
        </div>
      );
    }

    const locationId = context.runtime
      ? await resolveRuntimeFirstLocationId(context)
      : await getEffectiveLocationId(sessionUser);

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
    }, client);

    // Metadata segura para el diálogo de confirmación de acciones runtime-aware
    // (deliver-dte-to-external-db.action.ts). Nunca incluye credenciales.
    const runtimeWriteInfo = context.runtime
      ? {
          organizationName: context.runtime.organizationName,
          profileLabel:     context.runtime.profileLabel,
        }
      : null;

    const externalConfig = getExternalDteMariaDbConfig();
    const externalDeliveryTarget = {
      host:     externalConfig.host || null,
      database: externalConfig.database || null,
      table:    externalConfig.table || null,
    };

    return (
      <div className="-mx-4 sm:-mx-6 -mt-8 -mb-8 h-[calc(100vh-3.5rem)] overflow-hidden flex flex-col">
        <DteOutgoingClient
          initialResult={initialResult}
          initialFilters={filters}
          runtimeWriteInfo={runtimeWriteInfo}
          externalDeliveryTarget={externalDeliveryTarget}
        />
      </div>
    );
  } finally {
    await dispose();
  }
}
