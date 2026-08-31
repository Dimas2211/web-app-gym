// ─────────────────────────────────────────────────────────────────
// commerce/products — get-tax-rates-lookup.ts
//
// LOOKUP TEMPORAL — Etapa 11 (primer corte)
// Mover a commerce/billing o core/tax cuando ese módulo exista.
//
// PREREQUISITO: Requiere modelo TaxRate en schema.prisma.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";

export interface TaxRateLookupItem {
  id: string;
  name: string;
  /** Porcentaje: ej. 19 representa 19% */
  rate: number;
}

/**
 * Devuelve las tasas de impuesto activas de un tenant.
 * Ordenadas por tasa ascendente para el select del formulario.
 *
 * Se incluye `rate` en la proyección porque el formulario lo muestra
 * junto al nombre para que el usuario pueda distinguir las opciones
 * (ej. "IVA — 19%").
 *
 * @param tenantId - Extraído de session.tenantId.
 * @param client   - PrismaClient opcional (Runtime Database Router, PASO 6A).
 */
export async function getTaxRatesLookup(
  tenantId: string,
  client: PrismaClient = prisma,
): Promise<TaxRateLookupItem[]> {
  const rows = await client.taxRate.findMany({
    where: {
      tenant_id: tenantId,
      status: "active",
    },
    select: {
      id: true,
      name: true,
      rate: true,
    },
    orderBy: { rate: "asc" },
  });

  // Convertir Decimal → number para serialización segura al cliente
  return rows.map((r) => ({
    ...r,
    rate: Number(r.rate),
  }));
}
