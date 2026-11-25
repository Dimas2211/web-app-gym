// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — get-dte-receptor-delivery-status.ts
//
// MH20 (Fase 6.1 → 7, IMP20-021) — estado de entrega al receptor de un DTE
// saliente, REUTILIZANDO los modelos existentes del repositorio:
//   - DteDelivery (dte_deliveries): única fuente de evidencia de entrega.
//     Solo una fila CUSTOMER_EMAIL en SENT con sent_at cuenta como entrega
//     efectiva. DOWNLOAD/PRINT/INTERNAL_EMAIL no son entrega al receptor.
//   - El archivo y la representación se evalúan con los builders puros
//     (no se persiste DteRenderedDocument en una lectura).
// Hoy no existe proveedor de correo ni portal DTE: no hay filas SENT y el
// estado nunca resulta DELIVERED. Solo lectura; scope tenant/location.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import { OPERATIONAL_DTE_WHERE } from "@/modules/commerce/dte/utils/dte-document-purpose";
import { mh20ProfileSelect } from "@/modules/commerce/dte/config/dte-mh20.flags";
import { buildDteArchiveFile } from "@/modules/commerce/dte/services/build-dte-archive-file.service";
import { buildDteGraphicRepresentation } from "@/modules/commerce/dte/services/build-dte-graphic-representation.service";
import { computeReceptorDeliveryStatus, type ReceptorDeliveryStatus } from "@/modules/commerce/dte/utils/dte-receptor-delivery-status";

export async function getDteReceptorDeliveryStatus(params: {
  dteId:      string;
  tenantId:   string;
  locationId: string;
  client?:    PrismaClient;
}): Promise<ReceptorDeliveryStatus | null> {
  const { dteId, tenantId, locationId, client = prisma } = params;
  const row = await client.dteOutgoingDocument.findFirst({
    where:  { id: dteId, tenant_id: tenantId, location_id: locationId, ...OPERATIONAL_DTE_WHERE },
    select: { id: true, dte_type_code: true, environment: true, json_document: true, signed_jws: true, reception_stamp: true, ...mh20ProfileSelect() },
  });
  if (!row) return null;
  const archive = buildDteArchiveFile({
    kind: row.dte_type_code, jsonDocument: row.json_document, signedJws: row.signed_jws,
    receptionStamp: row.reception_stamp, environment: String(row.environment),
    persistedProfile: (row as { mh_spec_profile?: string | null }).mh_spec_profile ?? null,
  });
  const rep = buildDteGraphicRepresentation({
    kind: row.dte_type_code, jsonDocument: row.json_document, signedJws: row.signed_jws, receptionStamp: row.reception_stamp,
  });
  const sent = await client.dteDelivery.findFirst({
    where:   { dte_document_id: row.id, tenant_id: tenantId, location_id: locationId, delivery_type: "CUSTOMER_EMAIL", status: "SENT", sent_at: { not: null } },
    select:  { id: true, sent_at: true, provider_message_id: true },
    orderBy: { sent_at: "desc" },
  });
  return computeReceptorDeliveryStatus({
    archiveOk:        archive.ok,
    representationOk: rep.ok,
    receptorChannels: [],
    evidence: sent?.sent_at ? { channel: "EMAIL", deliveredAt: sent.sent_at, reference: sent.provider_message_id ?? sent.id } : null,
  });
}
