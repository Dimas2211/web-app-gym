// ─────────────────────────────────────────────────────────────────
// commerce/inventory — get-inventory-summary.ts
//
// Resumen operativo (KPIs) de la location para el panel lateral
// del módulo inventory.
//
// Estrategia de cómputo:
//   - total_products, active_products y products_empty se resuelven
//     con count() directo en Prisma (condiciones simples).
//   - products_low y products_ok requieren comparar dos columnas
//     (current_stock vs min_stock) — imposible en Prisma WHERE sin raw SQL.
//     Se computan en memoria sobre un fetch de campos mínimos acotado
//     por SUMMARY_FETCH_LIMIT. Asumido correcto para <= 5 000 registros.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { InventorySummary } from "../types/inventory.types";
import { deriveStockAlertLevel, STOCK_ALERT_LEVEL } from "../types/inventory.types";

// Límite defensivo para el fetch de campos mínimos usado en el
// cómputo de products_low y products_ok.
const SUMMARY_FETCH_LIMIT = 5_000;

// ── Query principal ───────────────────────────────────────────────

/**
 * Devuelve los KPIs de inventario de una location para el panel resumen.
 *
 * @param tenant_id   - Extraído de session. Nunca del body del cliente.
 * @param location_id - Location cuyo resumen se calcula.
 */
export async function getInventorySummary(
  tenant_id: string,
  location_id: string,
): Promise<InventorySummary> {
  const scope = { tenant_id, location_id } as const;

  // ── Counts directos via Prisma ───────────────────────────────
  // Estos tres no requieren comparación columna-columna.
  const [total_products, active_products, products_empty_count] =
    await prisma.$transaction([
      prisma.productLocation.count({ where: { ...scope } }),
      prisma.productLocation.count({ where: { ...scope, is_active: true } }),
      prisma.productLocation.count({
        where: { ...scope, current_stock: { lte: 0 } },
      }),
    ]);

  // ── Cómputo en memoria para low/ok ───────────────────────────
  // Fetch mínimo: solo los campos necesarios para derivar la alerta.
  // current_stock > 0 ya excluye los EMPTY, reduciendo el set.
  const stockRows = await prisma.productLocation.findMany({
    where: { ...scope, current_stock: { gt: 0 } },
    select: { current_stock: true, min_stock: true },
    take: SUMMARY_FETCH_LIMIT,
  });

  let products_low = 0;
  let products_ok  = 0;

  for (const row of stockRows) {
    const alert = deriveStockAlertLevel(
      Number(row.current_stock),
      Number(row.min_stock),
    );
    if (alert === STOCK_ALERT_LEVEL.LOW)  products_low++;
    if (alert === STOCK_ALERT_LEVEL.OK)   products_ok++;
  }

  return {
    location_id,
    total_products,
    active_products,
    products_empty: products_empty_count,
    products_low,
    products_ok,
  };
}
