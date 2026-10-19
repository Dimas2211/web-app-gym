// ─────────────────────────────────────────────────────────────────
// reports/commerce/inventory-movements — page.tsx
//
// Commerce → Consultas y reportes → Movimientos por producto.
// Ruta canónica de la consulta individual de movimientos (Kardex).
// Puntos de entrada: este menú, Productos ("Ver movimientos completos")
// e Inventario ("Ver movimientos"), vía ?product_id=.
//
// Guard: contexto operacional runtime-aware con módulo
// commerce.inventory en modo LECTURA (sesiones read-only permitidas).
// Roles: super_admin, branch_admin, reception — igual que la API.
// El product_id de la URL se valida contra el tenant efectivo; los
// datos se consultan client-side vía /api/inventory/product-movements.
// ─────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { getSessionOrRedirect } from "@/lib/permissions/guards";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { INVENTORY_VIEWER_ROLES } from "@/modules/commerce/inventory/server/resolve-inventory-read-context";
import { ProductMovementReportClient } from "@/modules/commerce/inventory/components/product-movement-report-client";
import type { MovementProductOption } from "@/modules/commerce/inventory/queries/search-movement-products";
import { CommerceReportsTabs } from "@/modules/commerce/reports/components/commerce-reports-tabs";

export const metadata = { title: "Movimientos por producto" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProductInventoryMovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ product_id?: string }>;
}) {
  const user = await getSessionOrRedirect();
  const { product_id } = await searchParams;

  let handle;
  try {
    handle = await requireOperationalContext(user, { module: "commerce.inventory" });
  } catch (error) {
    if (error instanceof OperationalContextError) redirect("/dashboard");
    throw error;
  }

  const { context, dispose } = handle;
  let allowed = false;
  let initialProduct: MovementProductOption | null = null;
  let initialProductError: string | null = null;
  try {
    allowed = INVENTORY_VIEWER_ROLES.includes(context.effectiveUser.role);
    if (allowed && product_id) {
      initialProduct = UUID_RE.test(product_id)
        ? await context.client.product.findFirst({
            where: { id: product_id, tenant_id: context.tenantId },
            select: { id: true, product_code: true, name: true },
          })
        : null;
      if (!initialProduct) initialProductError = "El producto indicado no existe o no está disponible. Seleccioná otro.";
    }
  } finally {
    await dispose();
  }
  if (!allowed) redirect("/dashboard");

  return (
    <main className="p-4 md:p-8 max-w-7xl mx-auto text-zinc-100">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white">Consultas y reportes</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Historial individual de un producto en la sucursal activa: entradas, salidas, documentos,
          correlativos y existencias resultantes de cada movimiento.
        </p>
      </div>
      <CommerceReportsTabs active="inventory-movements" />
      <ProductMovementReportClient
        key={initialProduct?.id ?? "none"}
        initialProduct={initialProduct}
        initialProductError={initialProductError}
      />
    </main>
  );
}
