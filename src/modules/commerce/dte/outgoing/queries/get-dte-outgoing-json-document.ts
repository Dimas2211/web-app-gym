// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — get-dte-outgoing-json-document.ts
//
// Lectura READ-ONLY del JSON original persistido (json_document) de un
// DteOutgoingDocument — cualquier tipo (01, 03, 05, 11, 14, …), venga
// de sale_id o de purchase_id.
//
// Scoping obligatorio: WHERE id AND tenant_id AND location_id.
//
// Solo selecciona metadatos de identificación + json_document.
// NUNCA selecciona: signed_jws, mh_response, observations,
//                   reception_stamp, credenciales, certificados.
// No escribe nada: no cambia estado, correlativo, firma ni logs.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

export interface DteOutgoingJsonDocument {
  id:              string;
  sale_id:         string | null;
  purchase_id:     string | null;
  dte_type_code:   string;
  generation_code: string | null;
  control_number:  string | null;
  environment:     string;
  dte_status:      string;
  /** JSON original tal como quedó persistido. null = aún no generado. */
  json_document:   Prisma.JsonValue | null;
}

export async function getDteOutgoingJsonDocument(params: {
  dteId:      string;
  tenantId:   string;
  locationId: string;
  client?:    PrismaClient;
}): Promise<DteOutgoingJsonDocument | null> {
  const { dteId, tenantId, locationId, client = prisma } = params;

  const row = await client.dteOutgoingDocument.findFirst({
    where: { id: dteId, tenant_id: tenantId, location_id: locationId },
    select: {
      id:              true,
      sale_id:         true,
      purchase_id:     true,
      dte_type_code:   true,
      generation_code: true,
      control_number:  true,
      environment:     true,
      dte_status:      true,
      json_document:   true,
      // EXCLUIDOS: signed_jws, mh_response, observations, reception_stamp
    },
  });

  if (!row) return null;

  return {
    id:              row.id,
    sale_id:         row.sale_id,
    purchase_id:     row.purchase_id,
    dte_type_code:   row.dte_type_code,
    generation_code: row.generation_code,
    control_number:  row.control_number,
    environment:     String(row.environment),
    dte_status:      String(row.dte_status),
    json_document:   row.json_document ?? null,
  };
}
