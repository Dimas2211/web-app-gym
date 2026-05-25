// ─────────────────────────────────────────────────────────────────
// sales — page.tsx
//
// Pantalla principal de consulta de ventas.
// Estructura de 4 zonas fijas (A barra / B resumen / C grilla / D líneas).
//
// Guard: requireAdmin (super_admin | branch_admin).
// Carga inicial: 100 ventas ordenadas por fecha desc de la location activa.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { listSales } from "@/modules/commerce/sales/queries/list-sales";
import { listCashRegisters } from "@/modules/commerce/cash/queries/list-cash-registers";
import { SalesClient } from "@/modules/commerce/sales/components/sales-client";

export const metadata = {
  title: "Ventas",
};

export default async function SalesPage() {
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

  const [{ items, total }, cashRegisters] = await Promise.all([
    listSales({
      tenant_id,
      location_id,
      sort_field:     "sale_date",
      sort_direction: "desc",
      page:      1,
      page_size: 100,
    }),
    listCashRegisters(tenant_id, location_id).catch(() => []),
  ]);

  const hasOpenCashSession = cashRegisters.some((r) => r.open_session !== null);

  return (
    <SalesClient
      initialItems={items}
      initialTotal={total}
      hasOpenCashSession={hasOpenCashSession}
    />
  );
}
