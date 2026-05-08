import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getLocationById } from "@/core/modules/locations/queries";
import { listDteCatalogItems } from "@/modules/commerce/dte/queries/list-dte-catalog-items";
import { SaleNewClient } from "@/modules/commerce/sales/components/sale-new-client";

export const metadata = { title: "Nueva venta" };

export default async function NewSalePage() {
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

  return (
    <SaleNewClient
      initialDate={new Date().toISOString().slice(0, 10)}
      catalogCAT016={cat016}
      catalogCAT017={cat017}
      catalogCAT018={cat018}
      locationName={location?.name ?? undefined}
    />
  );
}
