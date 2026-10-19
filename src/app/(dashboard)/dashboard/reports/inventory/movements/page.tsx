// ─────────────────────────────────────────────────────────────────
// reports/inventory/movements — redirección de compatibilidad.
//
// La consulta de movimientos pertenece a Commerce (transversal), no al
// índice de reportes GYM. Ruta canónica:
//   /dashboard/reports/commerce/inventory-movements
// Se conserva esta URL solo para enlaces guardados; preserva product_id
// si viene (validado en la página destino contra el tenant efectivo).
// ─────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";

const CANONICAL = "/dashboard/reports/commerce/inventory-movements";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LegacyInventoryMovementsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ product_id?: string }>;
}) {
  const { product_id } = await searchParams;
  redirect(product_id && UUID_RE.test(product_id) ? `${CANONICAL}?product_id=${product_id}` : CANONICAL);
}
