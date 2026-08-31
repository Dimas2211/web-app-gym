// ─────────────────────────────────────────────────────────────────
// commerce/products — get-sublines-lookup.ts
//
// LOOKUP TEMPORAL — Etapa 11 (primer corte)
// Mover a commerce/catalog cuando ese módulo exista.
//
// PREREQUISITO: Requiere modelo ProductSubline en schema.prisma.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";

export interface SublineLookupItem {
  id: string;
  code: string;
  name: string;
  line_id: string;
}

/**
 * Devuelve las sublíneas activas de una línea específica.
 * Se invoca después de seleccionar línea en el formulario para
 * poblar el select de sublínea con datos coherentes.
 *
 * Siempre filtra por line_id para evitar mostrar sublíneas de
 * otra línea que rompería la coherencia relacional.
 *
 * @param tenantId - Extraído de session.tenantId.
 * @param lineId   - ID de la línea ya seleccionada.
 * @param client   - PrismaClient opcional (Runtime Database Router, PASO 6A).
 */
export async function getSublineLookup(
  tenantId: string,
  lineId: string,
  client: PrismaClient = prisma,
): Promise<SublineLookupItem[]> {
  return client.productSubline.findMany({
    where: {
      tenant_id: tenantId,
      line_id: lineId,
      status: "active",
    },
    select: {
      id: true,
      code: true,
      name: true,
      line_id: true,
    },
    orderBy: { name: "asc" },
  });
}
