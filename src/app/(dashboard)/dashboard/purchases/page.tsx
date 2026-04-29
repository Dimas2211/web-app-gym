// ─────────────────────────────────────────────────────────────────
// purchases — page.tsx
//
// Pantalla principal de consulta de compras.
// Estructura de 4 zonas fijas (A barra / B resumen / C grilla / D líneas).
//
// Guard: requireAdmin (super_admin | branch_admin).
// Carga inicial: 100 compras ordenadas por fecha desc de la location activa.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getPurchases } from "@/modules/commerce/purchases/queries/get-purchases";
import { PurchasesClient } from "@/modules/commerce/purchases/components/purchases-client";

export const metadata = {
  title: "Compras",
};

export default async function PurchasesPage() {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id || !location_id) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-zinc-500">
        Sesión sin tenant o location activa.
      </div>
    );
  }

  const { items, total } = await getPurchases({
    tenant_id,
    location_id,
    sort_field:     "purchase_date",
    sort_direction: "desc",
    page:      1,
    page_size: 100,
  });

  return (
    <PurchasesClient
      initialItems={items}
      initialTotal={total}
    />
  );
}
