// ─────────────────────────────────────────────────────────────────
// commerce/products — get-lines-lookup.ts
//
// LOOKUP TEMPORAL — Etapa 11 (primer corte)
// Mover a commerce/catalog cuando ese módulo exista.
//
// PREREQUISITO: Requiere modelo ProductLine en schema.prisma.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";

export interface LineLookupItem {
  id: string;
  code: string;
  name: string;
  category_id: string;
}

/**
 * Devuelve las líneas activas de una categoría específica.
 * Se invoca después de seleccionar categoría en el formulario para
 * poblar el select de línea con datos coherentes.
 *
 * Siempre filtra por category_id para evitar mostrar líneas de
 * otra categoría que rompería la coherencia relacional.
 *
 * @param tenantId    - Extraído de session.tenantId.
 * @param categoryId  - ID de la categoría ya seleccionada.
 * @param client      - PrismaClient opcional (Runtime Database Router, PASO 6A).
 */
export async function getLinesLookup(
  tenantId: string,
  categoryId: string,
  client: PrismaClient = prisma,
): Promise<LineLookupItem[]> {
  return client.productLine.findMany({
    where: {
      tenant_id: tenantId,
      category_id: categoryId,
      status: "active",
    },
    select: {
      id: true,
      code: true,
      name: true,
      category_id: true,
    },
    orderBy: { name: "asc" },
  });
}
