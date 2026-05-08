import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getLocationById } from "@/core/modules/locations/queries";
import { listDteCatalogItems } from "@/modules/commerce/dte/queries/list-dte-catalog-items";
import { getSaleDetailById } from "@/modules/commerce/sales/queries/get-sale-detail-by-id";
import { SaleNewClient } from "@/modules/commerce/sales/components/sale-new-client";

export const metadata = { title: "Nueva venta" };

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ sale_id?: string }>;
}) {
  const { sale_id } = await searchParams;

  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id) {
    return (
      <div className="p-8 text-sm text-red-500">
        La sesión no tiene un tenant activo.
      </div>
    );
  }

  if (!location_id) {
    return (
      <div className="p-8 text-sm text-amber-500">
        No hay sucursal activa seleccionada. Selecciona una sucursal para continuar.
      </div>
    );
  }

  const [cat016, cat017, cat018, location] = await Promise.all([
    listDteCatalogItems({ catalog_code: "CAT-016" }),
    listDteCatalogItems({ catalog_code: "CAT-017" }),
    listDteCatalogItems({ catalog_code: "CAT-018" }),
    getLocationById(location_id),
  ]);

  // Si viene sale_id, cargar el borrador existente (solo si es DRAFT y pertenece al tenant/location)
  let initialDraft = undefined;
  if (sale_id) {
    const sale = await getSaleDetailById(sale_id, tenant_id, location_id);
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
    />
  );
}
