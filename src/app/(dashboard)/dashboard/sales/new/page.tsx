import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { checkOperationalGrant } from "@/core/security/operational-authorization/operational-authorization";
import { SALE_DRAFT_WRITE_SCOPES } from "@/core/security/operational-authorization/scopes";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getLocationById } from "@/core/modules/locations/queries";
import { listDteCatalogItems } from "@/modules/commerce/dte/queries/list-dte-catalog-items";
import { getSaleDetailById } from "@/modules/commerce/sales/queries/get-sale-detail-by-id";
import { SaleNewClient } from "@/modules/commerce/sales/components/sale-new-client";
import { resolveSalesExportAvailability } from "@/modules/commerce/sales/export/services/sales-export-availability";
import {
  resolveEffectiveTenantContext,
  resolveRuntimeFirstLocationId,
} from "@/modules/platform/runtime/effective-tenant-context";

export const metadata = { title: "Nueva venta" };

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ sale_id?: string }>;
}) {
  const { sale_id } = await searchParams;

  const sessionUser = await requireAdmin();
  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  const tenant_id = context.tenantId;

  try {
    const location_id = context.runtime
      ? await resolveRuntimeFirstLocationId(context)
      : (context.locationId ??
        (await getEffectiveLocationId(sessionUser, context.client, context.tenantId)));

    if (!tenant_id) {
      return <div className="p-8 text-sm text-red-500">La sesión no tiene un tenant activo.</div>;
    }

    if (!location_id) {
      return (
        <div className="p-8 text-sm text-amber-500">
          No hay sucursal activa seleccionada. Selecciona una sucursal para continuar.
        </div>
      );
    }

    const [cat016, cat017, cat018, location, fex11] = await Promise.all([
      listDteCatalogItems({ catalog_code: "CAT-016" }, context.client),
      listDteCatalogItems({ catalog_code: "CAT-017" }, context.client),
      listDteCatalogItems({ catalog_code: "CAT-018" }, context.client),
      getLocationById(location_id, tenant_id, context.client),
      // FEX 11: fiscal.dte + emisor DTE activo único de la sucursal.
      resolveSalesExportAvailability(tenant_id, location_id, context.client),
    ]);

    // Si viene sale_id, cargar el borrador existente (solo si es DRAFT y pertenece al tenant/location)
    // Autorización Operativa: exige grant de ESTA venta (SALE_EDIT por
    // Clave de Supervisor o SALE_DRAFT_OWNER del creador). Sin grant, la
    // URL directa NO carga el borrador editable.
    let initialDraft = undefined;
    if (sale_id) {
      const grant = await checkOperationalGrant(
        { tenantId: tenant_id, client: context.client ?? prisma, effectiveUser: { id: sessionUser.id } },
        SALE_DRAFT_WRITE_SCOPES,
        sale_id,
        { renew: false },
      );
      if (!grant.ok) redirect("/dashboard/sales?auth=required");
      const sale = await getSaleDetailById(sale_id, tenant_id, location_id, context.client);
      if (sale && sale.status === "DRAFT") {
        initialDraft = sale;
      }
    }

    return (
      <SaleNewClient
        initialDate={new Date().toISOString().slice(0, 10)}
        catalogCAT016={cat016}
        catalogCAT017={cat017}
        catalogCAT018={cat018}
        locationName={location?.name ?? undefined}
        initialDraft={initialDraft}
        fex11Enabled={fex11.enabled}
      />
    );
  } finally {
    await dispose();
  }
}
