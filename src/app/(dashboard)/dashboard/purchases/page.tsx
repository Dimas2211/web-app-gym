// ─────────────────────────────────────────────────────────────────
// purchases — page.tsx
//
// Pantalla principal de consulta de compras.
// Estructura de 4 zonas fijas (A barra / B resumen / C grilla / D líneas).
//
// Guard: requireAdmin (super_admin | branch_admin).
// Carga inicial: 100 compras ordenadas por fecha desc de la location activa.
//
// PASO 6A (corrección de alcance): página runtime-aware. Con sesión
// "Operar como cliente" activa, lee tenant_id/location_id/PrismaClient
// del perfil runtime en vez de los del super_admin.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  resolveEffectiveTenantContext,
  resolveRuntimeFirstLocationId,
} from "@/modules/platform/runtime/effective-tenant-context";
import { requireOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement";
import { getPurchases } from "@/modules/commerce/purchases/queries/get-purchases";
import { PurchasesClient } from "@/modules/commerce/purchases/components/purchases-client";

export const metadata = {
  title: "Compras",
};

export default async function PurchasesPage() {
  const sessionUser = await requireAdmin();

  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  const { tenantId: tenant_id, client } = context;

  try {
    await requireOrganizationModule(tenant_id, "commerce.purchases");

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

    const { items, total } = await getPurchases({
      tenant_id,
      location_id,
      sort_field:     "purchase_date",
      sort_direction: "desc",
      page:      1,
      page_size: 100,
    }, client);

    return (
      <PurchasesClient
        initialItems={items}
        initialTotal={total}
      />
    );
  } finally {
    await dispose();
  }
}
