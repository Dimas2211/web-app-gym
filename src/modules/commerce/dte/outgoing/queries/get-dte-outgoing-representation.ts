// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — get-dte-outgoing-representation.ts
//
// MH20 (Fase 6.1, IMP20-021) — lectura READ-ONLY para la representación
// gráfica (PDF) de un DTE saliente y su estado de entrega al receptor.
//
// Scoping obligatorio: id + tenant_id + location_id + documento operativo.
// Lee signed_jws solo para verificar que el documento está firmado; el
// JWS NO forma parte del PDF ni se registra. No escribe nada.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import { OPERATIONAL_DTE_WHERE } from "@/modules/commerce/dte/utils/dte-document-purpose";
import {
  buildDteGraphicRepresentation,
  type BuildGraphicRepresentationResult,
} from "@/modules/commerce/dte/services/build-dte-graphic-representation.service";

export type DteOutgoingRepresentation =
  | { status: "NOT_FOUND" }
  | { status: "BUILT"; id: string; dte_type_code: string; environment: string; result: BuildGraphicRepresentationResult };

export async function getDteOutgoingRepresentation(params: {
  dteId:      string;
  tenantId:   string;
  locationId: string;
  client?:    PrismaClient;
}): Promise<DteOutgoingRepresentation> {
  const { dteId, tenantId, locationId, client = prisma } = params;
  const row = await client.dteOutgoingDocument.findFirst({
    where:  { id: dteId, tenant_id: tenantId, location_id: locationId, ...OPERATIONAL_DTE_WHERE },
    select: { id: true, dte_type_code: true, environment: true, json_document: true, signed_jws: true, reception_stamp: true },
  });
  if (!row) return { status: "NOT_FOUND" };
  return {
    status:        "BUILT",
    id:            row.id,
    dte_type_code: row.dte_type_code,
    environment:   String(row.environment),
    result: buildDteGraphicRepresentation({
      kind:           row.dte_type_code,
      jsonDocument:   row.json_document,
      signedJws:      row.signed_jws,
      receptionStamp: row.reception_stamp,
    }),
  };
}
