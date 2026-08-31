// ─────────────────────────────────────────────────────────────────
// sales — page.tsx
//
// Pantalla principal de consulta de ventas.
// Estructura de 4 zonas fijas (A barra / B resumen / C grilla / D líneas).
//
// Guard: requireAdmin (super_admin | branch_admin).
// Carga inicial: 100 ventas ordenadas por fecha desc de la location activa.
//
// PASO 6A (corrección de alcance): página runtime-aware. Con sesión
// "Operar como cliente" activa, lee tenant_id/location_id/PrismaClient
// del perfil runtime en vez de los del super_admin — la location
// efectiva es la primera sucursal activa del tenant runtime.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  resolveEffectiveTenantContext,
  resolveRuntimeFirstLocationId,
} from "@/modules/platform/runtime/effective-tenant-context";
import { listSales } from "@/modules/commerce/sales/queries/list-sales";
import { listCashRegisters } from "@/modules/commerce/cash/queries/list-cash-registers";
import { SalesClient } from "@/modules/commerce/sales/components/sales-client";

export const metadata = {
  title: "Ventas",
};

export default async function SalesPage() {
  const sessionUser = await requireAdmin();

  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  const { tenantId: tenant_id, client } = context;

  try {
    const location_id = context.runtime
      ? await resolveRuntimeFirstLocationId(context)
      : await getEffectiveLocationId(sessionUser);

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
      }, client),
      listCashRegisters(tenant_id, location_id, false, client).catch(() => []),
    ]);

    const hasOpenCashSession = cashRegisters.some((r) => r.open_session !== null);

    return (
      <SalesClient
        initialItems={items}
        initialTotal={total}
        hasOpenCashSession={hasOpenCashSession}
      />
    );
  } finally {
    await dispose();
  }
}
