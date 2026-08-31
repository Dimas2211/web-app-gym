// ─────────────────────────────────────────────────────────────────
// commerce/products — get-units-lookup.ts
//
// LOOKUP TEMPORAL — Etapa 11 (primer corte)
// Mover a commerce/catalog (o core/catalog) cuando ese módulo exista.
//
// DECISIÓN ARQUITECTÓNICA:
// units_of_measure es datos de referencia global, no tenant-level.
// Razón: unidades como "kg", "litro", "unidad", "caja" son
// compartidas por todas las organizaciones y no tiene sentido que
// cada tenant las recree manualmente.
// Si en el futuro se necesitan unidades personalizadas por tenant,
// agregar un campo tenant_id nullable y buscar:
//   WHERE tenant_id = ? OR tenant_id IS NULL
//
// PREREQUISITO: Requiere modelo UnitOfMeasure en schema.prisma.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";

export interface UnitLookupItem {
  id: string;
  name: string;
  symbol: string;
}

/**
 * Devuelve todas las unidades de medida activas.
 * No filtra por tenant porque son datos de referencia global.
 * Ordenadas por nombre para el select del formulario.
 *
 * @param client - PrismaClient opcional (Runtime Database Router, PASO 6A) —
 *                 cada base cliente tiene su propia copia sembrada de este catálogo.
 */
export async function getUnitsLookup(client: PrismaClient = prisma): Promise<UnitLookupItem[]> {
  return client.unitOfMeasure.findMany({
    where: {
      status: "active",
    },
    select: {
      id: true,
      name: true,
      symbol: true,
    },
    orderBy: { name: "asc" },
  });
}
